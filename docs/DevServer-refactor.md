# BlockProtocol POC DevServer Refactor Notes

Purpose: map the current `apps/blockprotocol-poc/src/server.ts` to the target split described in `docs/BlockProtocol-DevServer.md`, and call out code that can be removed or reshaped. The goal is to leave the Demo Application Server focused on UI + scenario orchestration while delegating build/serve to the Block Builder & Server and entity management to the IndexingService.

## What to Remove Outright
- **Inline framework compilers & watchers** (`compileSolidJSBlock`/`compileVueBlock`/etc., `setupFrameworkWatchers`, `/api/frameworks` endpoints, `dist/frameworks` static mounts, `framework-compilation-demo` scenario) duplicate the Block Builder & Server duties. Delete these and import/use `BlockServer` (or `startBlockServer`) from `blocks/src/server.ts` when you need compiled assets.
- **Local block directory watchers/cachers** (LOCAL_BLOCK_DIRS handling, `broadcastLocalBlockUpdate`, `/cache/:package/:version/*` cache middleware) should move behind the Block Builder & Server + BlockResourcesCache combination. The demo server should consume already-served resources, not mirror cache logic.
- **POC-only asset copying** (`ensureHtmlTemplateAssets`, HTML template string injection) belongs in build tooling. Keep only the static serve path that points at builder output or checked-in fixtures.
- **Ad-hoc persistence hacks** for Status Pill CSV writes and `graph/update` fallbacks bypass the IndexingService editing modules (`packages/indexing-service/README.md`). Remove once CSV editing is implemented properly.
- **Legacy milestone scenarios** that are not needed for target UX: `hello-world`, `custom`, `nested-kanban`, `multi-view-sync`, `iframe-webviews`, `feature-showcase-block`, `resource-loader`, `custom-element-baseline`, `solidjs-task-baseline`, `framework-compilation-demo`, `cross-framework-nesting`, `person-chip-example`, `table-view-example`, `board-view-example`. They encode mock graphs and manual applyUpdate logic rather than exercising the IndexingService + Block Loader contract.

## How to Drive the Demo Server with the Block Builder/Server (`blocks/src`)
- Start the builder/server as a sibling process, not inline compilers:
  - Import `BlockServer`/`startBlockServer` from `blocks/src/server.ts` in `apps/blockprotocol-poc/src/server.ts`.
  - Instantiate once during startup with `blocksDir` pointing to `<repo>/blocks`, `enableHotReload=true`, `enableFrameworkBuilder=false` (we are deleting in-demo framework compilers).
  - Keep a handle so you can `await blockServer.stop()` inside the demo server’s `close()` path.
- Route block assets through the block server:
  - Replace Express static mounts for `/blocks/*`, `/external/*`, `/frameworks/*`, `/examples/*` with URLs that hit the block server (`http://{blockHost}:{blockPort}/blocks/<blockName>/<file>`).
  - When emitting `resources` in VivafolioBlock notifications, populate `physicalPath` with block-server URLs; do not re-serve the same files from the demo server.
- Reuse block server APIs instead of duplicating metadata and bundle lists:
  - Proxy `/api/blocks` and `/api/blocks/:blockName` to the block server if the POC UI needs them.
  - Use `/healthz` from the block server for block-serving health; keep the demo server’s `/healthz` focused on its own process.
- WebSocket/cache invalidation:
  - The block server already emits `cache:invalidate` when hot reloads occur. Forward these to clients if needed; delete duplicate cache middleware (`/cache/:package/:version/*`) and local block watcher broadcasts.
  - Do not enable `enableFrameworkBuilder`—framework bundles should come from the block server’s build/watch, not ad-hoc compilers in the demo server.
- Startup ordering:
  - Start `BlockServer` first, capture host/port.
  - Inject those URLs into scenario definitions or a small helper that formats block resource URLs, so the demo server never hardcodes disk paths.

## Current Progress (docs tracking)
- The demo server now boots a sibling block server once and stops it during shutdown, wiring the origin into resource helpers (apps/blockprotocol-poc/src/server.ts).
- VivafolioBlock notifications for `status-pill`, `d3-line-graph-example`, and custom local blocks now emit block-server URLs via `buildBlockResources`/`buildBlockResource` (apps/blockprotocol-poc/src/server.ts).
- Block metadata and framework bundle APIs are proxied to the block server, and performance/manifest routes read from those upstreams instead of local compilers (apps/blockprotocol-poc/src/server.ts).
 BlockLoader keeps full-origin resource URLs and accepts any JS bundle name so cross-origin block-server assets resolve correctly (packages/block-loader/src/BlockLoader.ts).

## TODO (still missing)
- [x] Cache invalidation hooks – Notify BlockResourcesCache when blocks are rebuilt for automatic webview updates
- [ ] Forward block-server `cache:invalidate` events over WebSocket to clients and drop legacy cache middleware/watchers entirely (apps/blockprotocol-poc/src/server.ts).
- [ ] Make `/healthz` surface block-server health instead of just echoing its origin (apps/blockprotocol-poc/src/server.ts).
- [ ] Consume block-server APIs for metadata/framework bundles instead of reading `blocks/<name>/dist/block-metadata.json` directly (apps/blockprotocol-poc/src/server.ts).
- [ ] Move all blocks under `blocks/` and have scenarios call `buildBlockResources()` so every block flows through the block server + cache paths.

## What to Refactor to Target State
- **Scenario data source**: the remaining scenarios should build their `entityGraph` from IndexingService results (e.g., `indexing-service`, `d3-line-graph-example`). Replace in-memory `create*Graph()` helpers with calls to `indexingService.getAllEntities()` plus per-scenario filters. That aligns with `docs/block-loader-design.md` where the host owns graph provisioning.
- **Graph updates path**: WebSocket `graph/update` handling currently mutates local scenario state and only then calls `indexingService.updateEntity`. Invert this—let IndexingService be the source of truth, and rebuild notifications from fresh IndexingService snapshots. Drop `scenario.applyUpdate` once all scenarios rely on IndexingService.
- **Resource serving**: instead of static mounts under `/external/*` and `/blocks/*`, resolve block resources via the Block Builder & Server REST API and hand those URLs to the loader. Keep Express static only for the demo front-end.
- **WebSocket messaging shape**: use the block server’s built-in `cache:invalidate` notifications (emitted on hot reload) instead of custom ones. Broadcast VivafolioBlock notifications driven by IndexingService events (entity changes) rather than scenario timers.
- **Health/performance endpoints**: trim `/api/performance` and `/api/performance/bundle-load` once framework compilation is externalized. Keep `/healthz` minimal per `docs/BlockProtocol-DevServer.md`.
- **Vite usage**: if the demo UI still needs Vite middleware, keep it, but decouple it from block asset serving so the dev server lifecycle no longer starts/stops compiler pipelines.

## Suggested End State (Demo Server)
- Imports `startBlockServer` (or holds a `BlockServer` instance) and consumes its resource URLs; no inline compilers or watchers.
- Starts IndexingService, subscribes to its entity events, and publishes VivafolioBlock notifications derived from real graphs.
- Keeps only scenarios that map to real data paths (`indexing-service`, `d3-line-graph-example` after CSV module support); others are dropped.
- WebSocket layer only routes Block Protocol messages to/from IndexingService transports; no scenario-local apply/update logic.
- Express only serves the demo UI, healthz, and the proxy endpoints strictly needed to reach the Block Builder & Server.

## Quick Implementation Order
1) Delete framework compilation/watch code + related routes and scenarios; wire in `startBlockServer` consumption.  
2) Remove CSV/status and other ad-hoc persistence paths; rely on IndexingService editing modules.  
3) Prune legacy scenarios and rebuild remaining ones around IndexingService snapshots.  
4) Simplify WebSocket handlers to use IndexingService transports only, then drop scenario-local state.  
5) Trim Express routes to UI + proxy; remove cache middleware duplication.
