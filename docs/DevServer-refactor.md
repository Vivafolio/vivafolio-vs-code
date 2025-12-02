# BlockProtocol POC DevServer Refactor Notes

Purpose: map the current `apps/blockprotocol-poc/src/server.ts` to the target split described in `docs/BlockProtocol-DevServer.md`, and call out code that can be removed or reshaped. The goal is to leave the Demo Application Server focused on UI + scenario orchestration while delegating build/serve to the Block Builder & Server and entity management to the IndexingService.

## What to Remove Outright
- **Inline framework compilers & watchers** (`compileSolidJSBlock`/`compileVueBlock`/etc., `setupFrameworkWatchers`, `/api/frameworks` endpoints, `dist/frameworks` static mounts, `framework-compilation-demo` scenario) duplicate the Block Builder & Server duties. Delete these and import/use `startBlockBuilderServer` from `blocks/dev-server.ts` when you need compiled assets.
- **Local block directory watchers/cachers** (LOCAL_BLOCK_DIRS handling, `broadcastLocalBlockUpdate`, `/cache/:package/:version/*` cache middleware) should move behind the Block Builder & Server + BlockResourcesCache combination. The demo server should consume already-served resources, not mirror cache logic.
- **POC-only asset copying** (`ensureHtmlTemplateAssets`, HTML template string injection) belongs in build tooling. Keep only the static serve path that points at builder output or checked-in fixtures.
- **Ad-hoc persistence hacks** for Status Pill CSV writes and `graph/update` fallbacks bypass the IndexingService editing modules (`packages/indexing-service/README.md`). Remove once CSV editing is implemented properly.
- **Legacy milestone scenarios** that are not needed for target UX: `hello-world`, `custom`, `nested-kanban`, `multi-view-sync`, `iframe-webviews`, `feature-showcase-block`, `resource-loader`, `custom-element-baseline`, `solidjs-task-baseline`, `framework-compilation-demo`, `cross-framework-nesting`, `person-chip-example`, `table-view-example`, `board-view-example`. They encode mock graphs and manual applyUpdate logic rather than exercising the IndexingService + Block Loader contract.

## What to Refactor to Target State
- **Scenario data source**: the remaining scenarios should build their `entityGraph` from IndexingService results (e.g., `indexing-service`, `d3-line-graph-example`). Replace in-memory `create*Graph()` helpers with calls to `indexingService.getAllEntities()` plus per-scenario filters. That aligns with `docs/block-loader-design.md` where the host owns graph provisioning.
- **Graph updates path**: WebSocket `graph/update` handling currently mutates local scenario state and only then calls `indexingService.updateEntity`. Invert this—let IndexingService be the source of truth, and rebuild notifications from fresh IndexingService snapshots. Drop `scenario.applyUpdate` once all scenarios rely on IndexingService.
- **Resource serving**: instead of static mounts under `/external/*` and `/blocks/*`, resolve block resources via the Block Builder & Server REST API and hand those URLs to the loader. Keep Express static only for the demo front-end.
- **WebSocket messaging shape**: use `startBlockBuilderServer` cache invalidation hooks instead of custom `cache:invalidate` messages. Broadcast VivafolioBlock notifications driven by IndexingService events (entity changes) rather than scenario timers.
- **Health/performance endpoints**: trim `/api/performance` and `/api/performance/bundle-load` once framework compilation is externalized. Keep `/healthz` minimal per `docs/BlockProtocol-DevServer.md`.
- **Vite usage**: if the demo UI still needs Vite middleware, keep it, but decouple it from block asset serving so the dev server lifecycle no longer starts/stops compiler pipelines.

## Suggested End State (Demo Server)
- Imports `startBlockBuilderServer` and consumes its resource URLs; no inline compilers or watchers.
- Starts IndexingService, subscribes to its entity events, and publishes VivafolioBlock notifications derived from real graphs.
- Keeps only scenarios that map to real data paths (`indexing-service`, `d3-line-graph-example` after CSV module support); others are dropped.
- WebSocket layer only routes Block Protocol messages to/from IndexingService transports; no scenario-local apply/update logic.
- Express only serves the demo UI, healthz, and the proxy endpoints strictly needed to reach the Block Builder & Server.

## Quick Implementation Order
1) Delete framework compilation/watch code + related routes and scenarios; wire in `startBlockBuilderServer` consumption.  
2) Remove CSV/status and other ad-hoc persistence paths; rely on IndexingService editing modules.  
3) Prune legacy scenarios and rebuild remaining ones around IndexingService snapshots.  
4) Simplify WebSocket handlers to use IndexingService transports only, then drop scenario-local state.  
5) Trim Express routes to UI + proxy; remove cache middleware duplication.
