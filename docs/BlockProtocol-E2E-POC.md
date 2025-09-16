# Block Protocol E2E POC Status

This document tracks the proof-of-concept effort to validate the Block Protocol integration described in `docs/spec/BlockProtocol-in-Vivafolio.md` using a standalone web application and Playwright-driven tests.

## 🎯 Initiative Overview

Goal: build a minimal, self-contained environment that exercises the Vivafolio Block Protocol stack end-to-end without relying on the VS Code extension. The POC models the host/editor in a browser app, drives hard-coded VivafolioBlock notifications from a Node.js backend, and verifies block rendering plus graph synchronization with Playwright.

Scope highlights:
- Simulated editor UI (no actual editing) with fixed line anchors per the spec.
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
- **Next Target (Milestone 4 – Real Block Protocol Resources)**
  - Integrate the official Block Protocol build output (e.g., `third_party/blockprotocol/blocks/feature-showcase`).
  - Serve those assets through the POC host with proper resource mapping and caching tags.
  - Implement the spec-defined initialization handshake using the Block Protocol libraries.
  - Add Playwright coverage to ensure blocks load via the optimized path and respond to `graph/update` messages.
  - **Current blocker report**: see `docs/BlockProtocol-E2E-POC-milestone4.md` for details on dependency/build issues encountered while installing the upstream Block Protocol workspace.
  - **Next**: Swap placeholder renderer for real Block Protocol resources and start modeling entity mutations for multi-view sync.

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

## 📋 Deliverables
- `docs/BlockProtocol-E2E-POC.md` (this document) maintained alongside progress updates.
- `apps/blockprotocol-poc/` (or similar) containing frontend, backend, and tests.
- Playwright reports archived under `test-results/blockprotocol-poc/`.
- Upstream-ready patches to Block Protocol components when fixes are required.

## 🧭 Next Steps
1. Initialize git submodule for Block Protocol sources.
2. Scaffold the POC app directory with shared tooling (TypeScript, Vite/Express, Playwright config).
3. Implement Milestone 0 host-server loop and Playwright smoke test.
- Upcoming work: adopt the actual Block Protocol loader so iframe blocks can request resources dynamically (Milestone 4 goal).
