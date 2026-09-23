# Tarea: OpenCut Classic local + integracion MCP con Claude

Hola Claude Code. Vas a trabajar en la Mac de Vale. Sigue las fases en orden y **pide confirmacion antes de la Fase 3 (implementacion)**. Habla en espanol, con explicaciones cortas.

## Contexto
- Usamos **opencut-classic** (https://github.com/OpenCut-app/opencut-classic): editor de video web, MIT, archivado pero completo. Next.js 16 + nucleo Rust/wgpu compilado a WASM.
- **NO** uses `OpenCut-app/OpenCut` (es el Rewrite; hoy solo muestra paneles vacios).
- Objetivo: que Claude (Desktop o Code) pueda leer y editar el proyecto abierto en el editor via **MCP local**. Todo corre en localhost, nada se publica ni se despliega. Se usa la suscripcion de Claude, sin API key.
- Uso final: crear creativos de video para Woaly (e-commerce colombiano) en formatos 9:16, 1:1 y 4:5.

---

## Fase 1: Preparar el entorno
1. Verifica e instala si falta (pregunta antes de instalar algo global): `git`, `bun` (https://bun.sh), Docker Desktop (opcional), Xcode Command Line Tools.
2. Clona el repo en `~/Projects/opencut-classic` (o donde Vale indique). Si Vale tiene un fork en su GitHub, clona ese; si no, clona el original y crea una rama `feat/agent-mcp`.
3. Levanta el editor:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   bun install
   bun dev:web
   ```
   Opcional con base de datos: `docker compose up -d db redis serverless-redis-http` antes de `bun dev:web`.
4. Confirma que `http://localhost:3000` muestra el editor completo (timeline, preview, panel de medios). Si falla, diagnostica y resuelve antes de seguir.

## Fase 2: Explorar y confirmar
Lee `AGENTS.md`, `README.md` y `docs/` (sobre todo `docs/actions.md`). Confirma estos hechos y avisa si algo difiere:
- `apps/web/src/core/index.ts`: `EditorCore.getInstance()` expone managers `timeline`, `command`, `playback`, `scenes`, `project`, `media`, `renderer`, `save`, `selection`, `clipboard`.
- `apps/web/src/core/managers/commands.ts`: `CommandManager.execute({ command })` con undo/redo. Comandos en `apps/web/src/commands/` (incluye `batch-command.ts`).
- Export en `apps/web/src/export/`.
- El proyecto vive en el navegador (IndexedDB/OPFS): las herramientas deben ejecutarse dentro de la pestana del editor.

Luego presenta un **plan corto** con archivos a crear/modificar y **espera el OK de Vale**.

## Fase 3: Implementar

### Arquitectura
```
Claude Desktop/Code --stdio--> packages/opencut-mcp (Node)
                                    | WebSocket 127.0.0.1:7801 + token
                                    v
                     Pestana del editor (apps/web) -> tool registry -> EditorCore
```

1. **Tool registry** (`apps/web/src/agent/tools/`)
   - Cada herramienta: `name`, `description`, `inputSchema` (zod -> JSON Schema), `handler`.
   - Toda mutacion pasa por `editor.command.execute(...)`; operaciones multiples en batch, para que un Ctrl+Z las revierta completas.
   - Validacion estricta; errores accionables (ej: "clip X no existe, clips disponibles: ...").
   - Agnostico al transporte: se reutilizara despues para un chat embebido.

2. **Puente en el navegador** (`apps/web/src/agent/bridge.ts`)
   - Cliente WebSocket a `ws://127.0.0.1:7801`, autenticado con token, ejecuta llamadas del registro.
   - Activado con `NEXT_PUBLIC_AGENT_BRIDGE=1`; reconexion automatica; indicador en la UI (conectado/desconectado) y log de acciones del agente.

3. **Servidor MCP** (`packages/opencut-mcp`, Node/Bun + `@modelcontextprotocol/sdk`, transporte stdio)
   - WebSocket solo en `127.0.0.1`, token local, expone las herramientas del registro.
   - Sin pestana conectada: error claro "Abre OpenCut en localhost:3000".
   - Timeouts por llamada e ids de correlacion.

### Herramientas v1
- Lectura: `get_project_info`, `get_timeline` (JSON compacto: pistas, clips, tiempos, efectos, textos), `list_media`, `get_selection`, `capture_frame(time)` (devuelve PNG como contenido de imagen).
- Edicion: `import_media(path|url)`, `add_clip`, `split_clip`, `trim_clip`, `move_clip`, `delete_clip`, `add_text`, `update_text`, `apply_effect`, `set_speed`, `set_canvas(9:16|1:1|4:5|16:9)`, `undo`, `redo`, `seek`.
- Salida: `export(format, quality, filename)`.

### Requisitos
- No romper la app ni los tests existentes; tests (vitest) para el registro.
- El editor local no debe requerir login ni base de datos.
- Debe funcionar con `bun dev:web` (3000) y con `docker compose up` (3100; las `NEXT_PUBLIC_*` van como build args).
- Commits pequenos y descriptivos en la rama `feat/agent-mcp`. No hagas push ni abras PRs sin permiso.

## Fase 4: Conectar y probar
1. Registra el MCP en Claude Code:
   ```bash
   claude mcp add opencut -- bun <ruta>/packages/opencut-mcp/src/index.ts
   ```
   y deja lista la config equivalente para Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`), mostrandosela a Vale antes de editarla.
2. Prueba end-to-end con el editor abierto: conectar -> `get_timeline` -> `import_media` -> `add_clip` -> `add_text` -> `capture_frame` -> `undo` -> `export`.
3. Documenta todo en `docs/agent-mcp.md`: como arrancar, como conectar Claude, lista de herramientas, problemas comunes.

## Entrega
Resumen corto para Vale: que se hizo, como usarlo en el dia a dia (3 pasos), y pendientes.

**Siguiente fase (no implementar ahora):** herramienta `create_variant(template, product{name, price_cop, image}, aspect)` con presets Woaly (precio en COP, sello "Original USA", logo, safe zones por formato).
