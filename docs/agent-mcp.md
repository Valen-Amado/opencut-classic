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

## Configuración

| Variable | Dónde | Default |
|---|---|---|
| `NEXT_PUBLIC_AGENT_BRIDGE` | editor | `0` (apagado) |
| `NEXT_PUBLIC_AGENT_BRIDGE_URL` | editor | `ws://127.0.0.1:7801` |
| `NEXT_PUBLIC_AGENT_BRIDGE_TOKEN` | editor | `opencut-local-dev` |
| `OPENCUT_AGENT_PORT` | servidor MCP | `7801` |
| `OPENCUT_AGENT_TOKEN` | servidor MCP | `opencut-local-dev` |
| `OPENCUT_AGENT_TIMEOUT_MS` | servidor MCP | `120000` |

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
