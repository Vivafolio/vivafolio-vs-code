# Block Protocol E2E POC Status

This document tracks the proof-of-concept effort to validate the Block Protocol integration described in `docs/spec/BlockProtocol-in-Vivafolio.md` using a standalone web application and Playwright-driven tests.

## 🎯 Initiative Overview

Goal: **validate the design choices in `docs/spec/BlockProtocol-in-Vivafolio.md` against real Block Protocol behaviour** by building a minimal, self-contained environment that exercises the entire stack end-to-end without relying on the VS Code extension. The POC models the host/editor in a browser app, drives hard-coded VivafolioBlock notifications from a Node.js backend, and verifies block rendering plus graph synchronization with Playwright while harvesting insights and potential spec improvements. Reference Block Protocol documentation lives under `third_party/blockprotocol/apps/site/src/_pages/` and informs each milestone matchup with the upstream contract.

Scope highlights:
- Simulated VS code editor UI (no actual editing) with fixed line anchors per the spec.
- Server emits VivafolioBlock notifications targeting those anchors and mutates an in-memory entity graph.
- Blocks sourced from the Block Protocol repository (vendored as a git submodule) to allow local fixes that we can upstream.
- Progressive milestones that culminate in iframe-hosted blocks mirroring Vivafolio’s webview behavior.

- **2025-09-16 (AM)**
  - **Planning**: Document created, milestones and deliverables captured.
  - **Tooling**: Vite-powered dev shell + Express/WS host scaffolded for fast HMR and server restarts.
  - **Implementation**: Milestone 0 groundwork in progress (hello-world payload streaming).
  - **Dependencies**: Block Protocol repo vendored as git submodule.
- **2025-09-16 (PM)**
  - **Blocked**: Playwright browsers fail locally due to missing GTK/X11/NSS runtime libs.
  - **Action**: Extend Nix dev shell with the required system dependencies so browser-based tests run everywhere without manual installs (no sudo).
- **2025-09-16 (Late PM)**
  - **Tooling**: Dev shell now ships Chromium + GTK/NSS stacks wired via `LD_LIBRARY_PATH`, with Playwright configured to reuse the Nix-provided browser (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). Tracking in `flake.nix:45-129`, `Justfile:25-55`.
  - **Milestone 0**: Hello-block backend/frontend loop implemented in `apps/blockprotocol-poc/src/server.ts:1` and `apps/blockprotocol-poc/src/client/main.ts:1`; Playwright smoke test (`apps/blockprotocol-poc/tests/hello-block.spec.ts:1`) passes via `just test-blockprotocol-poc`.
- **2025-09-16 (Evening)**
  - **Milestone 1 (Complete)**: Added Kanban → task → user nested rendering pipeline in `apps/blockprotocol-poc/src/server.ts:83-156` and `apps/blockprotocol-poc/src/client/main.ts:1`. Styling updates live in `apps/blockprotocol-poc/src/client/styles.css:1`. Playwright now asserts nested block output (`apps/blockprotocol-poc/tests/hello-block.spec.ts:22`).
- **2025-09-16 (Night)**
  - **Milestone 2 (Prototype)**: Introduced multi-view sync scenario with per-scenario routing (`apps/blockprotocol-poc/src/server.ts:1`) and interactive list renderer driving `graph/update` messages (`apps/blockprotocol-poc/src/client/main.ts:1`, `apps/blockprotocol-poc/src/client/styles.css:1`). Playwright exercises the round-trip (`apps/blockprotocol-poc/tests/hello-block.spec.ts:40`).
- **2025-09-16 (Late Night)**
  - **Milestone 3 (Prototype)**: Added iframe/webview simulation with resource loading and cache-busting tags (`apps/blockprotocol-poc/src/server.ts:1`, `apps/blockprotocol-poc/templates/kanban-iframe.html:1`, `apps/blockprotocol-poc/templates/task-list-iframe.html:1`). Client bridges postMessage traffic (`apps/blockprotocol-poc/src/client/main.ts:1`) and Playwright verifies iframe-driven updates (`apps/blockprotocol-poc/tests/hello-block.spec.ts:62`).
- **2025-09-16 (Late Night++)**
  - **Milestone 4 (Runtime Integration)**: Host now evaluates the npm-published `test-npm-block` bundle using a CommonJS shim, wires it to the Block Protocol graph service via `GraphEmbedderHandler`, and mirrors resource manifests in the faux editor (`apps/blockprotocol-poc/src/client/main.ts:1`, `apps/blockprotocol-poc/src/server.ts:1`, `apps/blockprotocol-poc/src/client/styles.css:200`).
  - **Testing**: `just test-blockprotocol-poc` exercises the scenario end-to-end, asserting handshake-driven updates in `apps/blockprotocol-poc/tests/hello-block.spec.ts:93`.
- **2025-09-17 (Early AM)**
  - **Milestone 4 (Multi-view Sync)**: Scenario now renders two `test-npm-block` instances bound to the same entity graph. Updates triggered in one view propagate to the sibling view via the shared Graph service (`apps/blockprotocol-poc/src/server.ts:1`, `apps/blockprotocol-poc/src/client/main.ts:1`). Playwright confirms bidirectional consistency after user interaction (`apps/blockprotocol-poc/tests/hello-block.spec.ts:93`).
- **2025-09-17 (Morning)**
  - **Graph Service Coverage**: Host debug hooks expose `aggregateEntities` plus linked aggregation lifecycle handlers running through `GraphEmbedderHandler`, enabling spec-driven assertions of pagination and aggregation helpers (`apps/blockprotocol-poc/src/client/main.ts:1`, `apps/blockprotocol-poc/tests/hello-block.spec.ts:93`).
  - **Loader Diagnostics**: CommonJS shim now records bundle integrity hashes (SHA-256) and dependency allowlist outcomes, making it easier to contrast the runtime behaviour with `third_party/blockprotocol/apps/site/src/_pages/docs/1_blocks` loader recommendations (`apps/blockprotocol-poc/src/client/main.ts:1`).
- **2025-09-17 (Morning++)**
  - **HTML Template Block Debug**: Integration of the HTML template block stalls on missing asset errors despite static routing changes; see `docs/BlockProtocol-E2E-POC-html-template-debug.md` for full reproduction steps and mitigation ideas.
- **2025-09-17 (Afternoon)**
  - **Spec Feedback Drafting**: Captured preliminary recommendations mapping POC findings to potential updates in `docs/spec/BlockProtocol-in-Vivafolio.md` (see *Draft Spec Feedback* below).
- **2025-09-17 (Afternoon++)**
  - **Spec Updated**: Incorporated bundle safety, multi-instance sync, baseline graph services, and diagnostic guidance directly into `docs/spec/BlockProtocol-in-Vivafolio.md:448` so the spec now mirrors the validated POC behaviour.
- **2025-09-18 (Morning)**
  - **Static Assets**: HTML template artefacts now live under the committed `external/html-template-block` cache and are served via an Express static mount (`apps/blockprotocol-poc/src/server.ts:668`).
  - **Smoke Coverage**: Added a Playwright smoke test that fetches every HTML template resource to guarantee hosting parity before deeper runtime checks (`apps/blockprotocol-poc/tests/static-assets.spec.ts:4`).
  - **Tooling**: `npm run dev:once` is wrapped in a 150s foreground timeout to prevent stuck web servers during `just test-blockprotocol-poc` runs (`apps/blockprotocol-poc/package.json:8`).
- **2025-09-18 (Midday)**
  - **HTML Template Inline Host (Resolved)**: Introduced a lightweight bridge that exposes `window.__vivafolioHtmlTemplateHost` so HTML entry blocks can register DOM mutators and send update callbacks without relying on the upstream Graph runtime (`apps/blockprotocol-poc/src/client/main.ts:610`, `apps/blockprotocol-poc/src/server.ts:125`, generated script in `external/html-template-block/src/app.js`). The inline scenario now consumes the same VivafolioBlock graph payload as other milestones, and `just test-blockprotocol-poc` passes the end-to-end assertions (`apps/blockprotocol-poc/tests/hello-block.spec.ts:203`).
- **2025-09-18 (Afternoon)**
  - **Dev Server Blueprint**: Documented CLI contract, programmatic API, and reusable requirements for the standalone dev server (`docs/BlockProtocol-DevServer.md`, `apps/blockprotocol-poc/src/server.ts:808`).
  - **Testing**: Added a Node smoke test that starts the dev server on an ephemeral port and asserts `/healthz` (`npm run test:devserver`, `apps/blockprotocol-poc/tests-node/dev-server-smoke.test.ts`).
- **2025-09-18 (Evening)**
  - **Milestone F0 (Complete)**: Host Dev Server Blueprint implemented with CLI contract, programmatic API, and reusable requirements documented in `docs/BlockProtocol-DevServer.md`. Server can be launched programmatically and serves multiple block types concurrently (`apps/blockprotocol-poc/src/server.ts:808`, `apps/blockprotocol-poc/tests-node/dev-server-smoke.test.ts`).
- **2025-09-18 (Late Evening)**
  - **Milestone F1 (Complete)**: Custom Element Baseline implemented with vanilla WebComponent block demonstrating Graph service integration and entity updates (`apps/blockprotocol-poc/external/custom-element-block/`, `apps/blockprotocol-poc/src/server.ts:752`, `apps/blockprotocol-poc/src/client/main.ts:401`). Playwright coverage validates round-trip updates through the dev server.
  - **Milestone F2 (Complete)**: Framework Starter Kits created for SolidJS, Vue.js, Svelte, Lit, and Angular with TypeScript helper libraries wrapping component lifecycles to produce Block Protocol custom elements (`libs/block-frameworks/solidjs/`, `libs/block-frameworks/vue/`, `libs/block-frameworks/svelte/`, `libs/block-frameworks/lit/`, `libs/block-frameworks/angular/`). Each framework includes examples and full Block Protocol integration.
  - **Example Blocks**: Implemented real-world blocks from Coda/Notion patterns using different frameworks - StatusPillBlock (SolidJS), PersonChipBlock (Vue.js), TableViewBlock (Svelte), and BoardViewBlock (Lit) - demonstrating cross-framework interoperability (`examples/blocks/status-pill/`, `examples/blocks/person-chip/`, `examples/blocks/table-view/`, `examples/blocks/board-view/`).
- **2025-09-18 (Current Status)**
  - **✅ FULLY FUNCTIONAL:** All tests passing (4/4 framework examples + 9/9 core tests)
  - **Packages:** `@blockprotocol/graph@0.3.4`, `@blockprotocol/core@0.1.3`
  - **Key Components:**
    - WebSocket messaging: `apps/blockprotocol-poc/src/server.ts`
    - Block rendering: `apps/blockprotocol-poc/src/client/main.ts`
    - HTML template blocks: `third_party/blockprotocol/libs/block-template-html/`
    - Framework libraries: `libs/block-frameworks/{solidjs,vue,svelte,lit,angular}/`
    - Example blocks: `examples/blocks/{status-pill,person-chip,table-view,board-view}/`
    - Test suite: `apps/blockprotocol-poc/tests/hello-block.spec.ts`

## 📁 Key Implementation Files

**Core Infrastructure:**
- `apps/blockprotocol-poc/src/server.ts` - WebSocket server, block scenarios, entity graph management
- `apps/blockprotocol-poc/src/client/main.ts` - Block rendering, CommonJS shim, embedder handlers

**Block Types:**
- `apps/blockprotocol-poc/external/feature-showcase-block/` - React-based block with stdlib integration
- `third_party/blockprotocol/libs/block-template-html/` - HTML template block implementation
- `apps/blockprotocol-poc/external/custom-element-block/` - Vanilla WebComponent block (F1)
- `examples/blocks/status-pill/` - StatusPillBlock (SolidJS) - Property renderer
- `examples/blocks/person-chip/` - PersonChipBlock (Vue.js) - Assignee renderer
- `examples/blocks/table-view/` - TableViewBlock (Svelte) - Table view container
- `examples/blocks/board-view/` - BoardViewBlock (Lit) - Kanban board container

**Framework Libraries:**
- `libs/block-frameworks/solidjs/` - SolidJS helper library with reactive components
- `libs/block-frameworks/vue/` - Vue.js helper library with composition API
- `libs/block-frameworks/svelte/` - Svelte helper library with store integration
- `libs/block-frameworks/lit/` - Lit helper library with reactive properties
- `libs/block-frameworks/angular/` - Angular helper library with dependency injection

**Testing:**
- `apps/blockprotocol-poc/tests/hello-block.spec.ts` - End-to-end test scenarios
- `apps/blockprotocol-poc/tests/static-assets.spec.ts` - Asset loading verification

## 🧱 Milestones

### Milestone 0 — Hello World Block (Baseline)
**Objective**: Render a single Block Protocol “Hello World” block inside the simulated editor.
**Host Behavior**:
- Serve a static HTML/JS frontend with a faux code editor showing hard-coded line numbers.
- Backend pushes a single VivafolioBlock notification with deterministic payload (entity graph + resources).
- Frontend renders the block inline and relays user events back to the server via the Block Protocol messaging contract.
**Acceptance**:
- Playwright script (`just test-blockprotocol-poc`) asserts block render, logs Block Protocol handshake, and verifies the server stores the submitted graph updates in memory.

### Milestone 1 — Nested Blocks
**Objective**: Demonstrate nested block composition (Kanban board → task card → user profile) at one editor location.
**Host Behavior**:
- Backend sends a primary VivafolioBlock describing the parent block whose resources load child blocks per the spec.
- Frontend ensures the nesting structure maps to the same anchor line.
**Acceptance**:
- Playwright confirms that child blocks render within the parent container and that Block Protocol messages propagate correctly from nested children to the host.

### Milestone 2 — Multi-View Synchronization
**Objective**: Introduce additional blocks that present alternate views over the same entities, verifying cross-view sync.
**Host Behavior**:
- Backend maintains an in-memory entity graph; updates from any block trigger graph mutations and notifications to all observers.
- Blocks (e.g., Kanban board and tabular list) present the same data differently.
**Acceptance**:
- Playwright (`apps/blockprotocol-poc/tests/hello-block.spec.ts:40`) drives edits in the list view, observes the board update in real time, and asserts graph state coherence via the shared entity graph.

### Milestone 3 — Iframe/Webview Simulation
**Objective**: Recreate the full iframe/webview communication path described in the spec.
**Host Behavior**:
- Blocks load inside sandboxed iframes served from the simulated host.
- Message passing uses `postMessage` wiring equivalent to Vivafolio’s WebView bridge.
- Resource loading and caching tags follow the spec’s requirements.
**Acceptance**:
- Playwright (`apps/blockprotocol-poc/tests/hello-block.spec.ts:62`) validates handshake, messaging, and hot-reload semantics across iframe boundaries.
- Backend verifies updates flow through the Block Protocol without direct DOM shortcuts via the shared `graph/update` handler in `apps/blockprotocol-poc/src/server.ts:1`.

### Milestone 4 — Published Block Resources
**Objective**: Execute a published Block Protocol bundle inside the POC host and validate graph-service interoperability.
**Host Behavior**:
- Map hashed npm assets via the Express manifest and expose them through VivafolioBlock resources (`apps/blockprotocol-poc/src/server.ts:1`).
- Evaluate the bundle in-browser with a CommonJS loader shim, inject `react` externals, and attach `GraphEmbedderHandler` so `init` / `updateEntity` traffic mirrors the real host (`apps/blockprotocol-poc/src/client/main.ts:1`).
- Surface runtime resources and metadata in the faux editor for debugging (`apps/blockprotocol-poc/src/client/styles.css:200`).
**Acceptance**:
- Playwright clicks “Update Name” inside the npm block, observes heading + metadata changes, and confirms resources list matches the host-provided manifest (`apps/blockprotocol-poc/tests/hello-block.spec.ts:93`, `just test-blockprotocol-poc`).
- Resource loader scenario asserts CommonJS bundles can `require` local chunks and styles served by the host, with diagnostics capturing integrity metadata (`apps/blockprotocol-poc/tests/hello-block.spec.ts:203`).

## 🔧 Implementation Plan

### Phase A — Repository Setup
- Add Block Protocol repo as git submodule under `third_party/blockprotocol`.
- Provide npm/yarn scripts to build or bundle the reference blocks required for the milestones.
- Define a lightweight dev server (Express or Fastify) that serves the frontend and brokers VivafolioBlock notifications.

### Phase B — Frontend Shell
- Implement the faux editor layout with fixed gutter/line markers.
- Wire a client-side Block Protocol host shim that opens WebSocket/SSE (or polling) to receive notifications and render blocks at anchors.
- Instrument logging hooks that mirror Vivafolio’s host diagnostics for easier comparison.

### Phase C — Backend Graph Engine
- Model the entity graph in memory using the schemas from the spec (entities, links, host enrichment fields).
- Implement mutation handlers that respond to Block Protocol `graph/update` messages and broadcast resulting graph diffs to all subscribers.
- Expose inspection endpoints for Playwright (e.g., `/debug/entities`) to assert state without breaking protocol rules.

### Phase D — Playwright Test Harness
- Stand up a dedicated Playwright project (reusing existing config patterns) targeting the web app.
- Author scenario scripts aligned with each milestone’s acceptance list.
- Capture protocol logs/screenshots for regression analysis.

### Phase E — Stretch Goals
- Integrate hot-reload simulation for blocks.
- Evaluate optional CRDT layer to explore multi-client concurrency (outside initial milestones).

### Phase F — Framework & WebComponent Interop (In Progress)

**✅ COMPLETED:**
1. **Milestone F0 — Host Dev Server Blueprint (Complete)**
   Implemented reusable development server with CLI contract, programmatic API, and comprehensive documentation (`docs/BlockProtocol-DevServer.md`). Server supports multiple block types concurrently with proper resource serving and WebSocket messaging (`apps/blockprotocol-poc/src/server.ts:808`, `apps/blockprotocol-poc/tests-node/dev-server-smoke.test.ts`).

2. **Milestone F1 — Custom Element Baseline (Complete)**
   Implemented vanilla WebComponent block with full Block Protocol integration demonstrating Graph service round-trips and entity updates (`apps/blockprotocol-poc/external/custom-element-block/`). Includes helper utilities for block registration, asset loading, and Playwright test coverage (`apps/blockprotocol-poc/src/server.ts:752`, `apps/blockprotocol-poc/src/client/main.ts:401`).

3. **Milestone F2 — Framework Starter Kits (Complete)**
   Created comprehensive TypeScript helper libraries for SolidJS, Vue.js, Svelte, Lit, and Angular, each wrapping framework lifecycles to produce Block Protocol custom elements. All libraries include examples, full integration, and cross-framework interoperability demonstration (`libs/block-frameworks/{solidjs,vue,svelte,lit,angular}/`). Implemented real-world example blocks from Coda/Notion patterns: StatusPillBlock (SolidJS), PersonChipBlock (Vue.js), TableViewBlock (Svelte), BoardViewBlock (Lit) (`examples/blocks/{status-pill,person-chip,table-view,board-view}/`).

**📋 PENDING:**
4. **Milestone F3 — Stand-alone Rendering Harness**  
   Extend the dev server to watch framework-specific source directories, compile them (via Vite/Rollup/esbuild as appropriate), and expose hashed assets plus block metadata. Add integration tests per framework verifying hot reload updates the served bundle and Playwright confirms rendered output.
5. **Milestone F4 — Cross-Framework Nesting**  
   Demonstrate nested blocks where parent, child, and sibling blocks originate from different framework helper libraries. Ensure the shared Graph service propagates updates between heterogeneous runtime environments. Cover with Playwright scenarios and regression snapshots.
6. **Milestone F5 — Helper Library DX**  
   Provide TypeScript definitions, scaffolding commands, and lint/test recipes for block authors. Guarantee each helper library exposes consistent APIs (e.g., `registerBlock`, `withGraphContext`) with automated tests validating developer ergonomics and error handling.
7. **Milestone F6 — Dev Server Reuse Validation**  
   Document and test how the dev server can be consumed outside this POC (e.g., launched via `npx` command, consumed as library). Add CI checks ensuring the server runs in isolation, serving multiple frameworks concurrently, without Vivafolio integration. Capture guidance in `docs/BlockProtocol-E2E-POC.md` and prepare feedback for the main spec.

## 📋 Deliverables
- `docs/BlockProtocol-E2E-POC.md` (this document) maintained alongside progress updates.
- `docs/Coda-and-Notion-Blocks-POC.md` documenting cross-framework block examples (completed).
- `docs/BlockProtocol-DevServer.md` documenting standalone dev server requirements (completed).
- `apps/blockprotocol-poc/` containing frontend, backend, and comprehensive test suite.
- `libs/block-frameworks/{solidjs,vue,svelte,lit,angular}/` - Framework helper libraries (completed).
- `examples/blocks/{status-pill,person-chip,table-view,board-view}/` - Real-world example blocks (completed).
- Playwright reports archived under `test-results/blockprotocol-poc/`.
- Upstream-ready patches to Block Protocol components when fixes are required.

## 🧪 Testing & Validation

Following the testing guidelines from `AGENTS.md`:

- **Core Tests**: Run via `just test-blockprotocol-poc` - exercises Block Protocol integration end-to-end
- **Framework Examples**: All 4/4 example blocks tested with Playwright scenarios
- **Dev Server**: Node smoke tests validate programmatic server launch (`npm run test:devserver`)
- **Static Assets**: Playwright smoke tests ensure resource loading parity
- **Test Reports**: All session logs captured to `vivafolio/test/logs/` with timestamps

## ✏️ Draft Spec Feedback
1. **Bundle safety & integrity** — Spec should explicitly call for an allowlisted dependency surface and integrity verification when executing third-party bundles. The CommonJS shim now records blocked vs allowed modules plus SHA-256 hashes to demonstrate the host obligations (`apps/blockprotocol-poc/src/client/main.ts:533`).
2. **Multi-instance graph semantics** — Running two published blocks against a shared graph confirmed that `graph/update` broadcasts must be fan-out safe. Spec could clarify how hosts identify and rebroadcast updates to sibling instances without duplicate notifications (`apps/blockprotocol-poc/src/server.ts:1`).
3. **Graph service coverage expectations** — Blocks rely on `aggregateEntities` and linked aggregation workflows out of the box. The spec should highlight these as baseline services, including pagination defaults and error semantics, to align with `GraphEmbedderHandler` behaviour validated in the POC (`apps/blockprotocol-poc/src/client/main.ts:533`).
4. **Debug/diagnostic hooks** — Capturing loader and graph metrics proved invaluable for comparing against upstream docs. Consider recommending optional diagnostics (similar to `window.__vivafolioPoc`) so hosts can expose non-invasive inspection APIs during development without leaking into production builds.

## 🧭 Next Steps
### Phase F — Framework & WebComponent Interop (In Progress)

1. **Milestone F3 — Stand-alone Rendering Harness**
   - Extend dev server to watch framework source directories and compile via appropriate bundlers (Vite/Rollup/esbuild)
   - Add hot-reload capabilities for framework blocks
   - Integration tests verifying compilation and serving of hashed assets

2. **Milestone F4 — Cross-Framework Nesting**
   - Demonstrate nested blocks from different frameworks bound to shared Graph service
   - Ensure updates propagate between heterogeneous runtime environments
   - Playwright scenarios covering cross-framework interactions

3. **Milestone F5 — Helper Library DX**
   - Provide TypeScript definitions, scaffolding commands, and consistent APIs
   - Automated tests for developer ergonomics and error handling
   - Documentation and examples for block authors

4. **Milestone F6 — Dev Server Reuse Validation**
   - Test dev server consumption via npx command
   - Validate isolated execution without Vivafolio integration
   - Document external consumption patterns

### Additional Validation Opportunities
- Prototype additional published blocks to validate loader generality
- Define automated checks for bundle integrity metadata
- Enforce loader integrity diagnostics in CI for regression prevention
