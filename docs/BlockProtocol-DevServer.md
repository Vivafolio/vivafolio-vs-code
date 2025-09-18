# Vivafolio Block Protocol Dev Server Blueprint

This document defines the reusable development server that underpins Phase F. The goal is to expose a standalone tool that authors can run while building blocks (SolidJS, Svelte, Vue, Lit, Angular, vanilla custom elements) without launching the full Vivafolio extension.

## 1. Capabilities

* **Serve manifest + resources** – host `block-metadata.json`, bundle chunks, stylesheets, HTML entry points and downloadable assets under a predictable `/external/<block-id>/` prefix. Preserve cache-busting query tags from VivafolioBlock notifications.
* **Broadcast VivafolioBlock notifications** – simulate the websocket feed used by the POC so the dev app (and later the extension) can drive scenarios and replay updates. Support multi-instance sync out of the box.
* **Graph mutation hooks** – expose an in-memory entity graph, handle `graph/update` traffic, and fan out updated notifications. Provide REST helpers (`/api/graph`, `/healthz`) for debugging and automated tests.
* **Framework-agnostic hot reload** – plug in Vite middleware when available; fall back to prebuilt static assets when frameworks need their own bundlers. The server never assumes a particular framework runtime.

## 2. CLI Contract

The executable should accept the following options (with environment variable fallbacks):

| Flag | Env | Default | Description |
| --- | --- | --- | --- |
| `--port <number>` | `PORT` | `4173` | TCP port for HTTP + WS endpoints. Use `0` for an ephemeral port when embedding in tests. |
| `--host <string>` | `HOST` | `0.0.0.0` | Bind address; the console banner should print the resolved host (`localhost` when unspecified). |
| `--no-vite` | `DEVSERVER_NO_VITE=1` | Enabled when `NODE_ENV !== production` | Disables Vite middleware and serves prebuilt assets. Useful for unit tests or when another bundler handles compilation. |
| `--log-routes` | `DEVSERVER_LOG_ROUTES=1` | Off | Emits `dumpExpressStack(app)` output after middleware registration. |

Future extensions (not required in Phase F0) include pointing at an alternate scenarios JSON, opting into mock latency, and persisting the entity graph between restarts.

## 3. Programmatic API

```ts
import { startServer } from './src/server.ts'

const { httpServer, close } = await startServer({
  port: 0,
  attachSignalHandlers: false,
  enableVite: false,
})

// use httpServer.address() to discover listening port
await close()
```

* `startServer()` returns `{ app, httpServer, wss, close }`. Call `close()` to tear down sockets, the websocket server, and any Vite middleware.
* Flag `attachSignalHandlers=false` keeps the helper from registering process-wide SIGINT/SIGTERM handlers (essential for smoke tests).

## 4. Test Hooks

* `/healthz` – returns `{ ok: true, timestamp }` when the process is healthy.
* `/api/graph` – dumps the in-memory entity graph for assertions.
* Websocket endpoint `/ws?scenario=<id>` – accepts `graph/update` payloads and rebroadcasts notifications defined in the scenario catalog.

A Node smoke test (`npm run test:devserver`) must launch the server programmatically, assert the health endpoint, and shut it down cleanly. Playwright e2e tests continue to use the CLI path through `npm run dev:once`.

## 5. Block Examples

When implementing Phase F milestones, refer to `docs/Coda-and-Notion-Blocks-POC.md` for concrete view/property blocks (TableView, BoardView, PersonChip, RelationCell, etc.). Each framework helper library should target that suite so the development server exercises realistic workloads.

## 6. Out of Scope (Phase F0)

* Integrating with the Vivafolio extension.
* Persisting scenarios or entity graphs to disk.
* Authentication/authorization.
* Multi-process clustering.

These can be layered on once the POC proves the development workflow.
