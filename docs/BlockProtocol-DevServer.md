# Vivafolio Block Development Architecture

This document defines the **target architecture** for block development, testing, and deployment across different environments. It clarifies the responsibilities of each component in the unified block ecosystem after the refactoring is complete.

## Current State vs. Target State

### Current State (Before Refactoring)
The POC demo server (`apps/blockprotocol-poc/src/server.ts`) currently handles **everything**:
- Framework compilation and hot-reload
- Entity graph management and Block Protocol messaging
- Static asset serving
- Test scenario management
- WebSocket communication

This creates confusion about which component does what and makes it difficult to reuse block development capabilities in other contexts.

### Target State (After Refactoring)
A clean separation of concerns where each component has a single, well-defined responsibility:
- **Block Builder & Server**: Focuses solely on building and serving blocks
- **Demo Application Server**: Orchestrates testing scenarios and delegates to IndexingService
- **IndexingService**: Handles entity graphs and Block Protocol operations
- **VS Code Extension**: Integrates everything in the production runtime

## Target Component Overview

### 1. Block Builder & Server (Block Development Only)
**Location**: `blocks/` directory, `src/dev-server.ts` (new)
**Purpose**: **Build, bundle, and serve block definitions during development**
**Responsibilities** (Target State):
- Framework compilation (SolidJS, Vue, Svelte, Lit, Angular)
- Block packaging and bundling
- Hot-reload development serving
- Cache invalidation hooks for VS Code integration
- REST API for block metadata and health checks

### 2. Demo Application Server (POC Testing Only)
**Location**: `apps/blockprotocol-poc/src/server.ts` (refactored)
**Purpose**: **Provide a web application for testing Block Protocol scenarios**
**Responsibilities** (Target State):
- Serve the demo web application frontend
- Load Block Builder & Server modules for continuous block reloading
- **Delegate entity graph management to IndexingService**
- Provide configurable test scenarios
- Optional WebSocket support for Block Protocol message testing

### 3. IndexingService (Entity Management)
**Location**: `packages/indexing-service/`
**Purpose**: **Manage entity graphs and handle Block Protocol operations**
**Responsibilities** (Current and Target State):
- Entity CRUD operations (`updateEntity`, `createEntity`, `deleteEntity`)
- File watching and synchronization with source code
- LSP integration for `vivafolio_data!()` constructs
- Event-driven architecture for entity changes
- Transport layer for Block Protocol messaging

### 4. VS Code Extension (Production Runtime)
**Location**: `src/extension.ts`
**Purpose**: **Integrate blocks into VS Code IDE**
**Responsibilities** (Current and Target State):
- Initialize IndexingService for entity management
- Render blocks in webviews using MiniHost and BlockResourcesCache
- Handle Block Protocol messaging between webviews hosting blocks and the extension host process
- Optional integration with local Block Builder & Server for development

## 1. Block Builder & Server Capabilities

### Core Duties (Block Building & Serving)
* **Framework compilation** – Hot-reload compilation for SolidJS, Vue, Svelte, Lit, Angular with proper bundling and optimization
* **Block packaging** – Build blocks for both development (hot-reload) and production (optimized bundles)
* **Resource serving** – Host `block-metadata.json`, bundle chunks, stylesheets, HTML entry points under predictable paths
* **Cache invalidation hooks** – Notify BlockResourcesCache when blocks are rebuilt for automatic webview updates

### Integration Duties (VS Code Extension)
* **Development API** – REST endpoints for block metadata, health checks, and development tools
* **Hot reload integration** – Real-time updates to running VS Code instances without restarts

### Testing Duties (POC Scenarios - Optional)
* **Scenario simulation** – Support configurable test scenarios with entity graphs for Block Protocol validation
* **WebSocket communication** – When needed for testing, provide WebSocket support for Block Protocol messages
* **Entity graph helpers** – Optional REST endpoints for graph inspection during development

**Important**: The Block Builder & Server focuses **only** on building and serving blocks. Entity graph management and Block Protocol message handling are **delegated to the IndexingService**.

## 2. Block Builder & Server CLI Contract

The Block Builder & Server executable accepts the following options (with environment variable fallbacks):

| Flag | Env | Default | Description |
| --- | --- | --- | --- |
| `--port <number>` | `PORT` | `4173` | TCP port for HTTP endpoints. Use `0` for an ephemeral port when embedding in tests. |
| `--host <string>` | `HOST` | `0.0.0.0` | Bind address; the console banner should print the resolved host (`localhost` when unspecified). |
| `--no-vite` | `DEVSERVER_NO_VITE=1` | Enabled when `NODE_ENV !== production` | Disables Vite middleware and serves prebuilt assets. Useful for unit tests or when another bundler handles compilation. |
| `--log-routes` | `DEVSERVER_LOG_ROUTES=1` | Off | Emits `dumpExpressStack(app)` output after middleware registration. |

## 3. Block Builder & Server Programmatic API

```ts
import { startBlockBuilderServer } from './src/dev-server.ts'

const { httpServer, close } = await startBlockBuilderServer({
  port: 0,
  attachSignalHandlers: false,
  enableVite: false,
})

// use httpServer.address() to discover listening port
await close()
```

* `startBlockBuilderServer()` returns `{ app, httpServer, close }`. Call `close()` to tear down sockets and any Vite middleware.
* Flag `attachSignalHandlers=false` keeps the helper from registering process-wide SIGINT/SIGTERM handlers (essential for smoke tests).

## 4. Block Builder & Server Test Hooks

* `/healthz` – returns `{ ok: true, timestamp }` when the process is healthy.
* `/api/blocks` – lists available blocks and their metadata.
* `/api/blocks/{blockId}` – serves block metadata and resources.

A Node smoke test must launch the Block Builder & Server programmatically, assert the health endpoint, and shut it down cleanly.

## 5. Implementation Roadmap

### Current State (Phase G5.1.1 - Architecture Foundation)
- ✅ Component responsibilities clarified
- ✅ Clear separation of concerns defined
- ✅ Component renaming established

### Next Steps (Phase G5.1.2 - Block Builder & Server as Reusable Library)
**Location**: `blocks/src/builder.ts`, `blocks/src/server.ts` (new files)

1. Extract framework compilation logic from POC server into `blocks/src/builder.ts`
2. Create `blocks/src/server.ts` as the HTTP serving component
3. Implement TypeScript interfaces for framework detection and compilation
4. Add cache invalidation WebSocket/events for real-time updates
5. Support loading as ESM modules by Demo Application Server and VS Code extension

### Integration Points (Phase G5.1.3 - Demo Application Server Refactor)
**Location**: `apps/blockprotocol-poc/src/server.ts` (refactored)

1. Remove all `applyUpdate` functions from POC server scenarios
2. Replace embedded entity graphs with IndexingService queries
3. Add Block Builder module loading with proper TypeScript imports
4. Make Block Protocol WebSocket features optional/configurable
5. Verify all existing demo scenarios work with IndexingService backend

### Production Development Mode (Phase G5.1.4 - VS Code Local Development)
**Location**: `src/extension.ts` (enhanced)

1. Add VS Code extension setting: `"vivafolio.localBlockDirs": ["/path/to/blocks1", "/path/to/blocks2"]`
2. Extension conditionally loads Block Builder modules when setting enabled
3. Implement priority-based block resolution: local directories override remote sources
4. Support multiple local block directories with configurable priority ordering
5. File watching across all configured directories with cache invalidation

### Unified Development Experience (Phase G5.1.5 - Complete Workflow)
- Comprehensive E2E tests covering all interaction patterns
- Updated development guides with unified workflow
- Troubleshooting documentation for common issues

## 6. Block Examples

When implementing the Block Builder & Server, refer to `docs/Coda-and-Notion-Blocks-POC.md` for concrete view/property blocks (TableView, BoardView, PersonChip, RelationCell, etc.). Each framework compilation pipeline should target that suite so the Block Builder & Server exercises realistic workloads.

## 7. Migration Notes

* **Entity Graph Management**: Currently handled by POC server, will be delegated to IndexingService
* **Framework Compilation**: Currently embedded in POC server, will be extracted to Block Builder & Server
* **Block Serving**: Currently embedded in POC server, will be extracted to Block Builder & Server
* **Test Scenarios**: Currently embedded in POC server, will remain but delegate entity operations

See `docs/BlockProtocol-E2E-POC.md` Phase G5.1 milestones for detailed implementation steps.
