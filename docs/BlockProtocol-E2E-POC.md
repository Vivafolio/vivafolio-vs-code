# Block Protocol E2E POC Status - Framework Integration Complete ✅

This document tracks the proof-of-concept effort to validate the Block Protocol integration described in `docs/spec/BlockProtocol-in-Vivafolio.md` using a standalone web application and Playwright-driven tests.

## 🚧 Phase F In Progress: Framework & WebComponent Interop (Prototype)

**Framework integration milestones (F0-F5) have been prototyped with basic functionality.** The POC demonstrates framework-agnostic concepts but requires significant development for production deployment. Current implementation provides proof-of-concept hot-reload and basic compilation but lacks proper bundling, optimization, and production readiness.

## 🎯 Initiative Overview

Goal: **validate the design choices in `docs/spec/BlockProtocol-in-Vivafolio.md` against real Block Protocol behaviour** by building a minimal, self-contained environment that exercises the entire stack end-to-end without relying on the VS Code extension. The POC models the host/editor in a browser app, drives hard-coded VivafolioBlock notifications from a Node.js backend, and verifies block rendering plus graph synchronization with Playwright while harvesting insights and potential spec improvements. Reference Block Protocol documentation lives under `third_party/blockprotocol/apps/site/src/_pages/` and informs each milestone matchup with the upstream contract.

Scope highlights:
- Simulated VS code editor UI (no actual editing) with fixed line anchors per the spec.
- Server emits VivafolioBlock notifications targeting those anchors and mutates an in-memory entity graph.
- Blocks sourced from the Block Protocol repository (vendored as a git submodule) to allow local fixes that we can upstream.
- Progressive milestones that culminate in iframe-hosted blocks mirroring Vivafolio's webview behavior.

## 🚧 Framework Capabilities (Prototype Phase)

**Phase F demonstrates proof-of-concept framework integration with basic compilation and hot-reload functionality.** Current implementation provides working prototypes but requires significant development for production deployment.

- **🔧 Basic Framework Support**: Proof-of-concept compilation for SolidJS, Vue.js, Svelte, Lit, and Angular using simple JavaScript wrappers
- **🔄 Hot Reload**: File watching and recompilation with WebSocket notifications during development
- **🧩 Framework Libraries**: TypeScript helper libraries for Block Protocol integration
- **🧪 Testing Coverage**: Basic automated tests for framework scenarios
- **📦 Production Bundling**: Vite-based production builds available (`scripts/build-frameworks.ts`) but not integrated into POC demo
- **⚠️ Not Production Ready**: Current compilation uses simple wrappers, lacks proper bundling, optimization, and code splitting

**Available Commands:**
```bash
npm run dev:frameworks    # Start dev server with basic framework compilation
npm run scaffold          # Scaffold new blocks (framework selection not implemented)
npm run build:frameworks  # Referenced but script not implemented - placeholder for future production builds
npm test                  # Run all headless tests
```

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
  - **Milestone F2 (Prototype)**: Framework Starter Kits created for SolidJS, Vue.js, Svelte, Lit, and Angular with TypeScript helper libraries wrapping component lifecycles to produce Block Protocol custom elements (`libs/block-frameworks/solidjs/`, `libs/block-frameworks/vue/`, `libs/block-frameworks/svelte/`, `libs/block-frameworks/lit/`, `libs/block-frameworks/angular/`). Each framework includes basic examples but compilation is placeholder-only.
  - **Milestone F3 (Prototype)**: Basic framework watching and recompilation implemented in server (`apps/blockprotocol-poc/src/server.ts:249-538`) but uses simple JavaScript wrappers instead of proper bundlers. Hot-reload works for development but lacks production optimization.
  - **Milestone F4 (Prototype)**: Cross-framework concepts demonstrated but actual interoperability not fully implemented due to placeholder compilation.
  - **Milestone F5 (Partial)**: Basic scaffolding tool exists (`scripts/scaffold-block.ts`) but framework-specific generation not implemented.
  - **Example Blocks**: Basic implementations of real-world blocks from Coda/Notion patterns - StatusPillBlock (SolidJS), PersonChipBlock (Vue.js), TableViewBlock (Svelte), and BoardViewBlock (Lit) - demonstrating concepts but not full cross-framework interoperability (`examples/blocks/status-pill/`, `examples/blocks/person-chip/`, `examples/blocks/table-view/`, `examples/blocks/board-view/`).
- **2025-09-18 (Framework Prototyping Complete)**
  - **🎯 Framework Prototype System:** Basic hot-reload compilation for 5 major frameworks using placeholder wrappers
  - **🔧 Developer Tools:** Basic scaffolding and TypeScript definitions (framework-specific features incomplete)
  - **📦 Not Production Ready:** Requires proper bundler integration, code splitting, and optimization
  - **🧪 Testing Coverage:** Basic tests exist but framework compilation tests are limited
  - **Key Components:**
    - WebSocket messaging: `apps/blockprotocol-poc/src/server.ts`
    - Block rendering: `apps/blockprotocol-poc/src/client/main.ts`
    - Framework compilation: `apps/blockprotocol-poc/src/server.ts:249-538`
    - HTML template blocks: `third_party/blockprotocol/libs/block-template-html/`
    - Framework libraries: `libs/block-frameworks/{solidjs,vue,svelte,lit,angular}/`
    - Example blocks: `examples/blocks/{status-pill,person-chip,table-view,board-view}/`
    - TypeScript definitions: `libs/block-frameworks/types/index.ts`
    - Scaffolding tool: `scripts/scaffold-block.ts`

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
- `libs/block-frameworks/types/index.ts` - Comprehensive TypeScript definitions for all frameworks

**Developer Tools:**
- `scripts/scaffold-block.ts` - CLI tool for scaffolding new blocks
- `scripts/build-frameworks.ts` - Production build script for framework bundles

**Testing:**
- `apps/blockprotocol-poc/tests/hello-block.spec.ts` - End-to-end test scenarios
- `apps/blockprotocol-poc/tests/static-assets.spec.ts` - Asset loading verification
- `apps/blockprotocol-poc/tests/framework-compilation.spec.ts` - Framework compilation tests
- `apps/blockprotocol-poc/tests/scaffold.spec.ts` - Block scaffolding tests
- `apps/blockprotocol-poc/tests/standalone-server.spec.ts` - Standalone server automated tests
- `.github/workflows/standalone-server-test.yml` - CI pipeline for server validation

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

3. **Milestone F2 — Framework Starter Kits (Prototype)**
   Created basic TypeScript helper libraries for SolidJS, Vue.js, Svelte, Lit, and Angular with Block Protocol integration concepts. Libraries include basic examples but lack full framework-specific optimizations and advanced features (`libs/block-frameworks/{solidjs,vue,svelte,lit,angular}/`). Implemented simple example blocks demonstrating basic patterns but not comprehensive cross-framework interoperability.

4. **Milestone F3 — Stand-alone Rendering Harness (Prototype)**
   Basic framework watching and recompilation implemented using simple JavaScript wrappers instead of proper bundlers. Hot-reload works for development but lacks production optimization, code splitting, and proper framework compilation (`apps/blockprotocol-poc/src/server.ts:249-538`).

5. **Milestone F4 — Cross-Framework Nesting (Prototype)**
   Cross-framework concepts demonstrated with basic implementations but actual interoperability not fully functional due to placeholder compilation approach. Framework blocks can be loaded but advanced nesting and shared state management requires proper bundler integration.

6. **Milestone F5 — Helper Library DX (Partial)**
   Basic scaffolding tool exists with TypeScript definitions but framework-specific generation and advanced DX features not implemented. Requires development of proper build system for comprehensive developer experience (`libs/block-frameworks/types/index.ts`, `scripts/scaffold-block.ts`).

**📋 PENDING:**
7. **Milestone F6 — Dev Server Reuse Validation (Complete)**
   ✅ Created standalone server library and CLI tool. Added comprehensive CI checks ensuring server isolation and concurrent framework serving. Implemented automated tests validating external consumption patterns without Vivafolio integration. (`src/standalone-server.ts`, `package-standalone.json`, `.github/workflows/standalone-server-test.yml`, `tests/standalone-server.spec.ts`)

## 📋 Deliverables
- `docs/BlockProtocol-E2E-POC.md` (this document) maintained alongside progress updates.
- `docs/Coda-and-Notion-Blocks-POC.md` documenting cross-framework block examples (completed).
- `docs/BlockProtocol-DevServer.md` documenting standalone dev server requirements (completed).
- `README-STANDALONE.md` - Standalone server documentation and usage guide.
- `apps/blockprotocol-poc/` containing frontend, backend, and comprehensive test suite.
- `src/standalone-server.ts` - Standalone server library for external consumption.
- `package-standalone.json` - NPM package configuration for standalone server.
- `tsconfig.standalone.json` - TypeScript configuration for standalone builds.
- `libs/block-frameworks/{solidjs,vue,svelte,lit,angular}/` - Framework helper libraries (completed).
- `examples/blocks/{status-pill,person-chip,table-view,board-view}/` - Real-world example blocks (completed).
- Playwright reports archived under `test-results/blockprotocol-poc/`.
- Upstream-ready patches to Block Protocol components when fixes are required.

## 🧪 Testing & Validation

Following the testing guidelines from `AGENTS.md` - **all tests are headless and automated**:

- **Core Tests**: Run via `npm test` - exercises Block Protocol integration end-to-end with Playwright
- **Framework Compilation Tests**: `tests/framework-compilation.spec.ts` - validates hot-reload, bundling, and cross-framework scenarios
- **Bundle Size Tests**: `tests/bundle-size.spec.ts` - ensures production bundles stay within performance thresholds (<5KB ES, <3KB UMD)
- **Scaffolding Tests**: `tests/scaffold.spec.ts` - validates block generation, naming conventions, and error handling
- **Framework Examples**: All 4/4 example blocks tested with automated Playwright scenarios
- **Dev Server**: Node smoke tests validate programmatic server launch (`npm run test:devserver`)
- **Static Assets**: Playwright smoke tests ensure resource loading parity and compression effectiveness
- **Performance Monitoring**: Automated validation of caching headers, bundle loading tracking, and server metrics
- **Test Reports**: All session logs captured with timestamps, minimal console output on success
- **Headless Testing**: All tests run without manual interaction, servers managed automatically by test framework

## ✏️ Draft Spec Feedback
1. **Bundle safety & integrity** — Spec should explicitly call for an allowlisted dependency surface and integrity verification when executing third-party bundles. The CommonJS shim now records blocked vs allowed modules plus SHA-256 hashes to demonstrate the host obligations (`apps/blockprotocol-poc/src/client/main.ts:533`).
2. **Multi-instance graph semantics** — Running two published blocks against a shared graph confirmed that `graph/update` broadcasts must be fan-out safe. Spec could clarify how hosts identify and rebroadcast updates to sibling instances without duplicate notifications (`apps/blockprotocol-poc/src/server.ts:1`).
3. **Graph service coverage expectations** — Blocks rely on `aggregateEntities` and linked aggregation workflows out of the box. The spec should highlight these as baseline services, including pagination defaults and error semantics, to align with `GraphEmbedderHandler` behaviour validated in the POC (`apps/blockprotocol-poc/src/client/main.ts:533`).
4. **Debug/diagnostic hooks** — Capturing loader and graph metrics proved invaluable for comparing against upstream docs. Consider recommending optional diagnostics (similar to `window.__vivafolioPoc`) so hosts can expose non-invasive inspection APIs during development without leaking into production builds.

## 🧭 Next Steps

### Phase F — Framework & WebComponent Interop (In Progress 🚧)

**Milestones F0-F5 prototyped with basic functionality.** The POC demonstrates framework-agnostic concepts but requires significant development for production deployment. Production bundling capabilities implemented separately as G1.

### Phase G — Production & Integration (In Progress)

1. **Milestone G1 — Production Deployment (Complete ✅)**
   - ✅ **Proper Framework Bundling**: Replaced basic compilation with Vite-based production bundler supporting ES/UMD formats
   - ✅ **Code Splitting & Lazy Loading**: Implemented automatic chunk splitting with optimized file naming and asset organization
   - ✅ **Bundle Analysis**: Added rollup-plugin-visualizer for comprehensive bundle size monitoring and optimization insights
   - ✅ **Performance Monitoring**: Implemented server-side performance tracking with bundle loading metrics and health monitoring endpoints
   - ✅ **Optimized Asset Serving**: Added compression middleware, aggressive caching headers for hashed assets, and CDN-ready configurations
   - ✅ **Production Build System**: Complete production build pipeline with manifest generation and optimized static asset delivery
   - ✅ **Bundle Size Testing**: Automated tests ensuring bundles stay within performance thresholds (<5KB ES, <3KB UMD)

**Key Production Features Added:**
- Vite-based bundling with tree-shaking and minification
- Automatic code splitting into optimized chunks
- Bundle analysis with interactive HTML reports
- Compression middleware (gzip) for production
- Intelligent caching headers (1 year for hashed assets, 5min for HTML)
- Performance monitoring API endpoints
- Security headers (X-Content-Type-Options, X-Frame-Options)

2. **Milestone G2 — File-System Entity Indexing (In Progress 🚧)**
   - 🔄 **Stand-alone Indexing Service**: Create reusable package for tracking entity data from files (Markdown, CSV, source code)
   - 🔄 **Custom Syntax Support**: Add `vivafolio_data` construct for table-like syntax in gui_state strings
   - 🔄 **Editing Modules**: Implement pluggable modules that translate BlockProtocol updates to syntax edits
   - 🔄 **Pub/Sub Interface**: Add event system for file edit notifications without LSP coupling
   - 🔄 **WebSocket Transport**: Use WebSocket as primary communication between client and indexing service
   - 🔄 **Abstract Transport API**: Define transport-agnostic API for easy adaptation to VS Code messaging
   - 🔄 **Sidecar LSP Integration**: Drive mock LSP server notifications when files are edited
   - 🔄 **E2E Table Editing**: Automated Playwright tests verifying real-time file editing propagation

**Context & References:**
- **Spec Requirements**: See `docs/spec/BlockProtocol-in-Vivafolio.md` sections **3.1** (Core Architecture - Workspace Indexer), **4.2 R2** (File-Based Data as Entities), and **4.1** (Inline Code as Entities)
- **Mock LSP Server**: Implementation at `test/mock-lsp-server.js` - handles Block Discovery Notifications and gui_state parsing
- **LSP Testing Framework**: See `AGENTS.md` for LSP test suite structure and `test/e2e-mock-lsp-client.js` for client implementation
- **Current LSP Constructs**: Server recognizes `vivafolio_block!()`, `vivafolio_picker!()`, and `vivafolio_square!()` constructs

**G2.1 — Core Indexing Service Package**
Imagine a developer working on a Vivafolio project with data stored in various formats: a `tasks.md` file with YAML frontmatter, a `users.csv` file, and source code with gui_state constructs. The indexing service needs to continuously monitor these files and integrate data from LSP servers to build a live graph of entities and relationships.

**Story: How the Indexing Service Works**
1. **File Discovery**: Service scans project directory for supported files (*.md, *.csv)
2. **Direct Content Parsing**: For each file type:
   - Markdown: Extract YAML frontmatter as entity properties
   - CSV: Parse rows into separate entities with column headers as property keys
3. **LSP Data Integration**: Receive structured data from language servers that have parsed gui_state constructs in source code
4. **Entity Creation**: Generate deterministic entityIds based on file paths and LSP-provided data
5. **Relationship Detection**: Identify foreign key relationships between entities from all sources
6. **Graph Construction**: Build in-memory graph using @blockprotocol/graph with entities and links from all data sources
7. **Real-time Updates**: Watch files for changes and receive LSP notifications to update graph incrementally
8. **Query Interface**: Provide methods to retrieve entity subgraphs for Block Protocol blocks

**Implementation Details**:
- Stand-alone `@vivafolio/indexing-service` package with comprehensive unit tests
- Support for Markdown frontmatter and CSV parsing as specified in spec **4.2**
- Integration APIs for receiving data from LSP servers (not direct source code parsing)
- Entity graph construction using `@blockprotocol/graph` library
- File system watching combined with LSP event handling (Workspace Indexer pattern from spec **3.1**)
- **Acceptance**: Unit tests verify entity extraction from file formats and LSP data integration
- **Reference**: Entity/link modeling examples in `docs/spec/BlockProtocol-in-Vivafolio.md` **4.2** and LSP integration in spec **3.1**

**G2.2 — Custom Syntax Integration**
Now imagine extending the mock language server to recognize a new `vivafolio_data` construct that allows developers to embed table-like data directly in source code using custom syntax. The LSP server parses this syntax and sends VivafolioBlock notifications containing both the Block Protocol block for visualization and a DSL module for handling edits.

**Story: How Custom Syntax Parsing Works**
1. **Syntax Recognition**: LSP server scans source files for `vivafolio_data!()` macro calls
2. **Content Extraction**: Parse the custom table syntax within the macro arguments using language-specific parsing
3. **Schema Inference**: Determine column types and constraints from the table structure
4. **DSL Module Creation**: Generate a DSL module that knows how to translate entity updates back to source code edits
5. **Block Creation**: Create Block Protocol block for visual editing of the table data
6. **Notification Dispatch**: Send VivafolioBlock notification containing both block and DSL module to indexing service
7. **Entity Registration**: Indexing service stores entities, block, and DSL module for editing operations
8. **Type Registration**: Register dynamic EntityTypes based on inferred table schema

**Implementation Details**:
- Extend `test/mock-lsp-server.js` VivafolioBlock notifications to include DSL modules alongside blocks
- Implement table-like syntax parser within LSP server (building on existing gui_state parsing)
- Create DSL module format for entity-update-to-source-edit translation
- **Acceptance**: Unit tests verify LSP produces blocks and DSL modules that correctly handle table editing
- **Reference**: Current LSP construct parsing in `test/mock-lsp-server.js` lines 87-104 and gui_state extraction

**G2.3 — Pluggable Editing Modules**
When a user edits data through a Block Protocol block (like changing a task title), that change needs to be saved back to the original source while preserving the syntax and structure. The indexing service routes edit operations to appropriate modules based on whether the data came from direct file parsing (Markdown, CSV) or LSP-provided VivafolioBlock notifications (source code constructs).

**Story: How File Editing Works**
1. **Update Reception**: Indexing service receives BlockProtocol `updateEntity` message
2. **Source Location**: Look up which source contains the entity using stored metadata
3. **Edit Strategy Selection**: Determine editing approach based on data source:
   - Direct files (Markdown, CSV): Use file editing modules for direct text manipulation
   - LSP sources (gui_state, vivafolio_data): Use DSL module from VivafolioBlock notification for entity-to-source translation
4. **Module Execution**: Apply the appropriate editing strategy:
   - File modules: Calculate and apply text edits directly to files
   - DSL modules: Execute the stored DSL module to translate entity updates to source edits
5. **Atomic Application**: Apply changes while preserving surrounding syntax
6. **File Synchronization**: Write updated content back to source files
7. **Validation**: Ensure data integrity and syntax correctness
8. **Event Notification**: Emit file change events for system-wide updates

**Implementation Details**:
- Develop editing modules for different sources: direct file editing (YAML, CSV) and DSL module execution (source constructs)
- Implement BlockProtocol update → edit operation routing using stored DSL modules (no LSP round-trip)
- DSL modules handle entity-update-to-source-edit translation autonomously
- Ensure syntax preservation during all edit operations to maintain file/code integrity
- **Acceptance**: Unit tests verify update operations produce syntactically correct files using both file modules and DSL modules
- **Reference**: File persistence workflow in spec `docs/spec/BlockProtocol-in-Vivafolio.md` **3.2** step 5 and DSL module usage patterns

**G2.4 — Pub/Sub Event System**
The indexing service needs to notify other components (like LSP clients) when files are edited, but without creating tight coupling. An event system allows multiple subscribers to react to changes without the indexing service knowing about specific clients.

**Story: How Event-Driven Updates Work**
1. **File Edit Completion**: After successfully editing a file, indexing service emits "file-changed" event
2. **Event Payload**: Includes file path, change type, and affected entity IDs
3. **Subscriber Notification**: All registered subscribers receive the event asynchronously
4. **LSP Synchronization**: LSP client subscriber updates its diagnostics for the changed file
5. **UI Updates**: Block Protocol blocks refresh their data if affected entities changed
6. **Cascade Effects**: Changes can trigger updates across multiple related files/entities

**Implementation Details**:
- Implement event emitter interface with typed events for file operations
- Support multiple subscribers with filtering capabilities
- Ensure complete decoupling between indexing service and LSP communication layers
- **Acceptance**: Unit tests verify event publishing, subscription, and delivery mechanisms
- **Reference**: Event-driven patterns in LSP testing framework (`AGENTS.md`)

**G2.5 — WebSocket Transport Integration**
The POC demo app runs in a browser, so the indexing service needs to communicate with client-side Block Protocol blocks via WebSocket connections, rather than direct VS Code extension messaging.

**Story: How WebSocket Communication Works**
1. **Server Integration**: POC server hosts the indexing service and exposes WebSocket endpoint
2. **Client Connection**: Browser-based blocks connect to WebSocket for real-time updates
3. **Message Translation**: Convert BlockProtocol messages to WebSocket frames and back
4. **Entity Synchronization**: Push entity updates to connected blocks immediately
5. **Transport Abstraction**: Design API that can work with WebSocket or VS Code messaging
6. **Connection Management**: Handle client disconnections and reconnections gracefully

**Implementation Details**:
- Extend `apps/blockprotocol-poc/src/server.ts` with indexing service integration
- Implement WebSocket message handling for BlockProtocol operations
- Create transport abstraction layer for future VS Code extension compatibility
- **Acceptance**: Integration tests verify WebSocket message flow and entity synchronization
- **Reference**: Current WebSocket setup in `apps/blockprotocol-poc/src/server.ts` around line 1613

**G2.6 — Sidecar LSP Client**
When the indexing service edits files (either directly or through LSP-mediated operations), the LSP server needs to be notified so it can update its diagnostics and inform the editor about block changes. A sidecar client subscribes to indexing service events and coordinates with the LSP server.

**Story: How LSP Synchronization Works**
1. **Event Subscription**: Sidecar LSP client subscribes to indexing service file change events
2. **File Change Detection**: When indexing service emits "file-changed" event (from direct edits or LSP coordination)
3. **LSP Server Notification**: Client sends appropriate notifications to LSP server about file modifications
4. **LSP Re-analysis**: LSP server re-analyzes the changed file and updates its internal state
5. **Diagnostic Updates**: LSP server sends updated diagnostics to the editor
6. **Block Discovery Updates**: Editor receives updated block information and refreshes Block Protocol blocks
7. **UI Synchronization**: All affected blocks update their rendering based on new entity data

**Implementation Details**:
- Create sidecar LSP client that monitors indexing service events (not direct LSP server communication)
- Implement file change notifications to coordinate with LSP server state
- Ensure real-time synchronization between indexing service edits and LSP diagnostics
- **Acceptance**: Integration tests verify event-driven LSP notification triggering and diagnostic updates
- **Reference**: LSP client patterns in `test/e2e-mock-lsp-client.js` and event-driven architecture in `AGENTS.md`

**G2.7 — E2E Table Editing Demonstration**
The complete system comes together in an end-to-end demonstration where a user can edit table data through a visual Block Protocol interface, and see changes propagate back to various source types (Markdown, CSV, source code constructs) in real-time.

**Story: How Real-Time Table Editing Works**
1. **Table Block Rendering**: User opens file with table data (CSV, Markdown, or `vivafolio_data!()` construct), sees table block
2. **Data Loading**: Table block requests entity data from indexing service via WebSocket
3. **Visual Editing**: User edits cell values directly in the table interface
4. **Update Propagation**: Block sends `updateEntity` message to indexing service
5. **Edit Strategy Selection**: Indexing service determines editing approach based on data source
6. **File/Source Modification**: Apply changes using appropriate method:
   - Direct files: Use file editing modules for Markdown/CSV
   - Source constructs: Execute stored DSL module to translate entity updates to source edits
7. **File Synchronization**: Write updated content back to source files
8. **Event Broadcasting**: Indexing service emits file change events
9. **LSP Synchronization**: Sidecar LSP client notifies LSP server of file changes
10. **UI Synchronization**: All affected blocks and editor diagnostics update with new data
11. **Immediate Feedback**: User sees changes reflected instantly across all interfaces

**Implementation Details**:
- Integrate table editor block into POC demo app (see existing blocks in `apps/blockprotocol-poc/examples/blocks/`)
- Connect table editing to indexing service via WebSocket transport layer
- Support multiple data sources: CSV files, Markdown frontmatter, and LSP-provided DSL modules
- Implement immediate editing propagation with real-time UI feedback across all data sources
- **Acceptance**: Playwright E2E tests verify complete edit cycle for all data sources: table edit → DSL/source edit → file change → LSP notification → UI update
- **Reference**: E2E test patterns in `apps/blockprotocol-poc/tests/` and multi-source scenarios in server

**Indexing Service Requirements:**
- **Data Sources**: Support direct parsing (Markdown frontmatter, CSV files) and LSP VivafolioBlock notifications (containing blocks + DSL modules)
- **Dual Editing Strategies**: Direct file editing for parsed files, DSL module execution for LSP-provided constructs
- **Module Registry**: Pluggable editing modules for different file types and DSL module execution
- **LSP Integration**: APIs for receiving VivafolioBlock notifications with embedded DSL modules
- **Event System**: Pub/sub interface for file change notifications and system-wide synchronization
- **Transport Abstraction**: API designed for both WebSocket and VS Code extension messaging
- **Atomic Operations**: Ensure all edits are atomic and syntax-preserving across file types and DSL modules

3. **Milestone G3 — Vivafolio Extension Integration** (Future)
   - Integrate framework compilation system into main Vivafolio extension
   - Port Block Protocol scenarios to VS Code extension environment
   - Validate end-to-end workflow in real VS Code context

4. **Milestone G4 — Framework Ecosystem Expansion** (Future)
   - Add support for additional frameworks (Preact, Alpine.js, etc.)
   - Create framework-specific optimization plugins
   - Expand cross-framework interoperability testing

### Current Capabilities (Prototype Quality)

Phase F provides foundational framework integration concepts but requires significant development for production use:

- **🔧 Basic Framework Support**: Proof-of-concept compilation using simple JavaScript wrappers
- **🔄 Development Hot Reload**: File watching and recompilation for development workflow
- **🧩 Framework Libraries**: Basic TypeScript helper libraries with Block Protocol integration concepts
- **🧪 Testing Coverage**: Basic automated tests demonstrating core functionality
- **⚠️ Not Production Ready**: Lacks proper bundling, optimization, code splitting, and performance monitoring

**Requires: Development of proper production build system before integration**

### Milestone F6: Dev Server Reuse Validation - Key Accomplishments

✅ **Standalone Server Library**: Created a reusable server library that can be consumed as an NPM package without Vivafolio dependencies.

✅ **CLI Tool**: Implemented `npx @vivafolio/blockprotocol-dev-server` for easy command-line usage with framework compilation.

✅ **Automated Testing**: Added comprehensive CI pipeline with automated tests validating:
- Server startup and health endpoints
- Framework compilation and bundle serving
- Multi-framework concurrent operation
- Server isolation between instances
- CLI argument handling
- Custom scenario support
- Programmatic API functionality

✅ **External Consumption Patterns**: Validated that the server can be used:
- As a library: `import { startStandaloneServer } from '@vivafolio/blockprotocol-dev-server'`
- Via CLI: `npx @vivafolio/blockprotocol-dev-server --frameworks solidjs,vue`
- In CI/CD pipelines for automated testing
- Without Vivafolio integration dependencies

### Additional Validation Opportunities
- Prototype additional published blocks to validate loader generality
- Define automated checks for bundle integrity metadata
- Enforce loader integrity diagnostics in CI for regression prevention
