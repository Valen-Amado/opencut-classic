# Agente MCP

Permite que Claude (Code o Desktop) lea y edite el proyecto abierto en el editor.
Todo corre en localhost y nada se publica.

## Cómo funciona

```
Claude  --stdio-->  packages/opencut-mcp  --WebSocket 127.0.0.1:7801-->  pestaña del editor
                                                                              |
                                                                          EditorCore
```

Quien conecta es **la pestaña del navegador**, no al revés. El servidor MCP solo
escucha en loopback y espera a que una pestaña se presente con un token. Si
cierras la pestaña, las herramientas desaparecen: no hay forma de tocar el
editor desde fuera de la máquina.

El proyecto vive en IndexedDB/OPFS dentro del navegador, y por eso las
herramientas se ejecutan ahí y no en el servidor.

## Arrancar

### 1. El editor

Con Bun (puerto 3000):

```bash
cp apps/web/.env.example apps/web/.env.local
# en .env.local: NEXT_PUBLIC_AGENT_BRIDGE=1
bun install
bun dev:web
```

Con Docker (puerto 3100). Las `NEXT_PUBLIC_*` se hornean en el build, así que hay
que reconstruir:

```bash
NEXT_PUBLIC_AGENT_BRIDGE=1 docker compose up -d --build web
```

Abajo a la izquierda aparece un indicador con el estado de la conexión y el log
de lo que hace el agente.

### 2. El servidor MCP

```bash
claude mcp add opencut -- bun /Users/vale/opencut-classic/packages/opencut-mcp/src/index.ts
```

> **Ojo con `bun` en esta Mac.** El `bun` del PATH es un shim de proto sin
> versión pineada, y falla con `proto::detect::failed`. Por eso el servidor está
> registrado con la ruta directa al binario:
>
> ```bash
> claude mcp add opencut -- /Users/vale/.proto/tools/bun/1.3.11/bun \
>   /Users/vale/opencut-classic/packages/opencut-mcp/src/index.ts
> ```
>
> Si algún día corres `proto pin bun 1.3.11`, el `bun` pelado vuelve a servir.

Para Claude Desktop (a hoy **no está instalado** en esta Mac; queda aquí para
cuando lo esté), en `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "opencut": {
      "command": "/Users/vale/.proto/tools/bun/1.3.11/bun",
      "args": ["/Users/vale/opencut-classic/packages/opencut-mcp/src/index.ts"]
    }
  }
}
```

## Herramientas

Los tiempos siempre van en **segundos**; internamente el editor usa ticks
enteros y la conversión ocurre en un solo sitio.

### Lectura

| Herramienta | Qué hace |
|---|---|
| `get_project_info` | Nombre, lienzo, relación de aspecto, fps, fondo, duración |
| `get_timeline` | Pistas y clips con ids, tiempos, efectos y velocidad |
| `list_media` | Assets importados, con los ids que espera `add_clip` |
| `get_selection` | Qué hay seleccionado en el editor |
| `capture_frame` | Renderiza un fotograma y lo devuelve como PNG |

### Edición

| Herramienta | Qué hace |
|---|---|
| `import_media` | Importa por `url` o por `path` local |
| `add_clip` | Coloca un asset en la línea de tiempo |
| `add_text` | Añade un texto |
| `update_text` | Cambia contenido o estilo de un texto |
| `split_clip` | Divide un clip en un tiempo absoluto |
| `trim_clip` | Recorta por el inicio o el final |
| `move_clip` | Mueve a otro tiempo y/o pista |
| `delete_clip` | Borra uno o varios clips |
| `set_speed` | Cambia la velocidad |
| `apply_effect` | Aplica un efecto |
| `set_canvas` | `9:16`, `1:1`, `4:5` o `16:9` |
| `seek` | Mueve el cabezal |
| `undo` / `redo` | Deshacer y rehacer |

### Salida

| Herramienta | Qué hace |
|---|---|
| `export` | Renderiza a mp4/webm y lo descarga el navegador |

Toda mutación pasa por `editor.command.execute(...)`, así que **un Ctrl+Z en el
editor revierte lo que hizo el agente**. Cuando una herramienta toca varias
cosas, van en un `BatchCommand` para que se deshagan juntas.


## Usarlo desde claude.ai (conector remoto)

Claude Code y Claude Desktop lanzan este proceso y le hablan por **stdio**, que
es local. claude.ai no puede: sus conectores salen **desde la nube de Anthropic**,
así que el servidor tiene que ser alcanzable por internet. Para eso está el
transporte HTTP.

### Seguridad: léelo antes

Exponer esto publica un endpoint que edita tu proyecto y lee archivos de tu
disco. La UI de conectores de Claude no permite cabeceras propias, así que el
único sitio donde cabe un secreto es la URL. Tres cosas lo acotan:

1. **La ruta lleva un secreto** de 32 caracteres. Cualquier otra ruta da 404,
   igual que un secreto incorrecto, así que sondear el host no revela nada.
2. **Las lecturas locales están confinadas** a `OPENCUT_MEDIA_ROOT` (por defecto,
   el repo). `import_media` no puede salir de ahí ni con `../`.
3. **Sin pestaña conectada no hay herramientas**: solo `opencut_status`.

Aun así, quien tenga la URL completa puede editar tu proyecto. Trátala como una
contraseña y baja el túnel cuando no lo uses.

### Pasos

```bash
# 1. un secreto nuevo (mínimo 24 caracteres; el servidor lo exige)
SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)

# 2. el servidor con HTTP activado
OPENCUT_MCP_HTTP=1 OPENCUT_MCP_HTTP_SECRET="$SECRET" \
  bun packages/opencut-mcp/src/index.ts

# 3. el túnel, en otra terminal
cloudflared tunnel --url http://127.0.0.1:7802
```

`cloudflared` está en `~/.local/bin/cloudflared` (binario suelto, sin Homebrew).

En claude.ai: **Configuración > Conectores > Añadir conector personalizado**, y
pega `https://<lo-que-diga-el-túnel>/mcp/<SECRET>`.

### Limitaciones

- La URL de `trycloudflare.com` **cambia cada vez que reinicias el túnel**, y hay
  que actualizar el conector en claude.ai. Para una URL fija hace falta una cuenta
  de Cloudflare con un túnel con nombre.
- Tu Mac tiene que estar encendida y con el editor abierto.
- El túnel gratuito no tiene garantías de disponibilidad.

## Configuración

| Variable | Dónde | Default |
|---|---|---|
| `NEXT_PUBLIC_AGENT_BRIDGE` | editor | `0` (apagado) |
| `NEXT_PUBLIC_AGENT_BRIDGE_URL` | editor | `ws://127.0.0.1:7801` |
| `NEXT_PUBLIC_AGENT_BRIDGE_TOKEN` | editor | `opencut-local-dev` |
| `OPENCUT_AGENT_PORT` | servidor MCP | `7801` |
| `OPENCUT_AGENT_TOKEN` | servidor MCP | `opencut-local-dev` |
| `OPENCUT_AGENT_TIMEOUT_MS` | servidor MCP | `120000` |
| `OPENCUT_MCP_HTTP` | servidor MCP | `0` (solo stdio) |
| `OPENCUT_MCP_HTTP_PORT` | servidor MCP | `7802` |
| `OPENCUT_MCP_HTTP_SECRET` | servidor MCP | — (obligatorio si HTTP=1) |
| `OPENCUT_MEDIA_ROOT` | servidor MCP | el directorio de trabajo |

El token del editor y el del servidor tienen que coincidir.

## Problemas comunes

**"No editor tab is connected"** — la pestaña no está abierta, o se construyó
sin `NEXT_PUBLIC_AGENT_BRIDGE=1`. Con Docker hay que **reconstruir**, no basta
con reiniciar: la variable se hornea en el build.

**El indicador se queda en "Conectando"** — el servidor MCP no está corriendo.
Claude lo arranca cuando lo necesita; si lo pruebas suelto, `bun
packages/opencut-mcp/src/index.ts`.

**"Invalid bridge token"** — `NEXT_PUBLIC_AGENT_BRIDGE_TOKEN` y
`OPENCUT_AGENT_TOKEN` no coinciden.

**Una llamada da timeout** — por defecto son 120 s. Un `export` de un proyecto
largo puede pasarse; sube `OPENCUT_AGENT_TIMEOUT_MS`.

**El puerto 7801 está ocupado** — cambia `OPENCUT_AGENT_PORT` y
`NEXT_PUBLIC_AGENT_BRIDGE_URL` a la vez.

## Tests

```bash
bun test apps/web/src/agent      # registro de herramientas
bun test packages/opencut-mcp    # puente WebSocket y end-to-end por stdio
```

El test end-to-end arranca el servidor de verdad, habla MCP por stdio y conecta
una pestaña simulada. Lo único que no cubre es `EditorCore`: las herramientas
necesitan un navegador (WASM, IndexedDB), así que eso se prueba abriendo el
editor.
