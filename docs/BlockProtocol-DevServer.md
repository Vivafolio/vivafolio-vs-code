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
**Location**: `blocks/dev-server.ts` (new)  
**Purpose**: **Build, bundle, and serve block definitions during development**
**Responsibilities** :
- Supports block building in different frameworks (SolidJS, Vue, Svelte, Lit, Angular)
- Block packaging and bundling
- Hot-reload development serving
- Cache invalidation hooks for VS Code integration
- REST API for block metadata and health checks

**Current limitations vs. target:**
- No framework auto-detection/compilation pipeline; relies on each block’s `npm run build`.
- No cross-process cache invalidation broadcast to VS Code; consumers refresh or watch on their own.

### 2. Demo Application Server (POC Testing Only)
**Location**: `apps/blockprotocol-poc/src/server.ts` (refactored)
**Purpose**: **Provide a web application for testing Block Protocol scenarios**
**Responsibilities** (Target State):
- Serve the demo web application frontend
- Load Block Builder & Server modules for continuous block reloading
- **Delegate entity graph management to IndexingService**
- Provide configurable test scenarios
- Optional WebSocket support for Block Protocol message testing

**Current implementation notes (server.ts):**
- Can enable framework watch/compile pipelines (SolidJS/Vue/Svelte/Lit/Angular) via `ENABLE_FRAMEWORK_WATCH=true` and uses Vite middleware when `NODE_ENV !== 'production'`.
- Starts a WebSocket server and dispatches scenario-driven VivafolioBlock notifications; `connection_ack` and notifications include the current `entityGraph`.
- Uses `IndexingService` for entity discovery/updates; some scenarios (e.g., D3 line graph) include CSV fallback parsing when the index is empty.
- Serves external/demo blocks and example bundles via Express static routes; in production adds compression and stricter cache headers.
- Exposes health (`/healthz`) and performance endpoints used by the POC UI.

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

### Core Duties (Target Implementation)
* **Framework compilation** – Hot-reload compilation for SolidJS, Vue, Svelte, Lit, Angular with proper bundling and optimization
* **Block packaging** – Build blocks for both development (hot-reload) and production (optimized bundles)
* **Resource serving** – Host `block-metadata.json`, bundle chunks, stylesheets, HTML entry points under predictable paths
* **Cache invalidation hooks** – Notify BlockResourcesCache when blocks are rebuilt for automatic webview updates

### Core Duties (Current Implementation)
* **Block loading** – Scan directories for blocks with `block-metadata.json` and load metadata
* **File watching** – Monitor `*/src/**/*` for changes and trigger rebuilds via `npm run build`
* **Resource serving** – Host built block files from `dist/` directories via HTTP
* **API endpoints** – Provide REST APIs for block metadata and health checks
* **Static serving** – Serve static assets for development

### Integration Duties (VS Code Extension)
* **Development API** – REST endpoints for block metadata, health checks, and development tools
* **Hot reload integration** – Real-time updates to running VS Code instances without restarts

### Testing Duties (POC Scenarios - Optional)
* **Scenario simulation** – Support configurable test scenarios with entity graphs for Block Protocol validation
* **WebSocket communication** – When needed for testing, provide WebSocket support for Block Protocol messages
* **Entity graph helpers** – Optional REST endpoints for graph inspection during development

**Important**: The Block Builder & Server focuses **only** on building and serving blocks. Entity graph management and Block Protocol message handling are **delegated to the IndexingService**.

## 2. Block Builder & Server CLI Usage

The Block Builder & Server is a Node.js script that can be run directly:

```bash
node blocks/dev-server.js
```

It starts on port 3001 by default (configurable via flags/env).

Supported flags and env vars (current implementation):

| Flag | Env | Default | Description |
| --- | --- | --- | --- |
| `--port <number>` | `BLOCK_DEV_SERVER_PORT` or `PORT` | `3001` | TCP port for HTTP endpoints. |
| `--host <string>` | `BLOCK_DEV_SERVER_HOST` or `HOST` | `0.0.0.0` | Bind address; banner prints `localhost` when binding to all interfaces. |

## 3. Block Builder & Server Programmatic API
# Current implementation:  
```javascript
const { startServer } = require('./blocks/dev-server.js');

startServer().catch(console.error);
```

The `startServer` function initializes blocks, sets up file watching, and starts the HTTP server.

# Target implementation:  

```ts
import { startBlockBuilderServer } from './blocks/dev-server.js'

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

## 4. Block Builder & Server API Endpoints

* `/healthz` – Returns `{ ok: true, timestamp, blocks: <count> }` when the server is healthy.
* `/api/blocks` – Lists all available blocks with basic metadata (name, displayName, version).
* `/api/blocks/:blockName` – Returns detailed metadata for a specific block.
* `/blocks/:blockName/:fileName` – Serves built block resources from the `dist/` directory.

## 5. Implementation Roadmap

### Current State (Phase G5.1 - Complete ✅)
- ✅ G5.1.1 - Architecture Foundation completed
- ✅ G5.1.2 - Block Builder & Server as Reusable Library completed
- ✅ G5.1.3 - Demo Application Server Refactor completed
- ✅ G5.1.4 - Production Local Development Mode completed
- ✅ G5.1.5 - Unified Development Experience completed

### 🎉 Unified Development Experience Complete ✅

**Achievement**: A complete block development workflow is now possible. A developer creates a new block type, tests it in the POC demo with real entity data, iterates on the design using local development mode in VS Code, and deploys it to production - all using the same underlying Block Builder & Server. The experience is seamless: blocks built for testing automatically work in production, local development provides instant feedback, and the entire workflow uses consistent tooling and APIs.

**Block Definition Edit Flow**:
1. Developer edits `blocks/color-picker/src/index.html`
2. Block Builder detects change and recompiles the block
3. Cache invalidation notifies all connected clients (demo app, VS Code)
4. Demo application reloads the updated block instantly
5. VS Code extension updates block webviews without restart
6. Developer sees visual changes immediately across all environments

**Source Code Edit Flow**:
1. Developer edits `gui_state("#ff0000")` in source file
2. LSP server detects change and sends VivafolioBlock notification
3. IndexingService receives notification and updates entity graph
4. Entity change events propagate to connected block webviews
5. Color picker block updates its displayed color
6. Bidirectional sync: block changes can update source code via LSP

**Remaining Tasks (Post-G5.1.5)**:
1. **Documentation Updates**
   - Update development guides with unified workflow
   - Create troubleshooting documentation for common issues
   - Write migration guide from current architecture to unified system

2. **Performance Optimization**
   - Performance benchmarks and optimization guidelines
   - Memory usage analysis for long-running development sessions
   - Bundle size monitoring and optimization

**Key Implementation Files**:
- `apps/blockprotocol-poc/tests/hello-block.spec.ts` - Comprehensive E2E test suite for local block development
- `apps/blockprotocol-poc/src/server.ts` - POC server with local block development and priority resolution
- `src/extension.ts` - VS Code extension with local block development settings
- `blocks/src/builder.ts` - BlockBuilder library for framework compilation
- `blocks/src/server.ts` - HTTP server component for block serving

### Completed Integration Points (Phase G5.1.3 - Demo Application Server Refactor)
**Location**: `apps/blockprotocol-poc/src/server.ts` (refactored)

1. Remove all `applyUpdate` functions from POC server scenarios
2. Replace embedded entity graphs with IndexingService queries
3. Add Block Builder module loading with proper TypeScript imports
4. Make Block Protocol WebSocket features optional/configurable
5. Verify all existing demo scenarios work with IndexingService backend

### Completed: Production Development Mode (Phase G5.1.4 - VS Code Local Development) ✅
**Location**: `src/extension.ts` (enhanced), `apps/blockprotocol-poc/src/server.ts` (local dev support)

**Completed Implementation:**
1. ✅ Add VS Code extension setting: `"vivafolio.localBlockDirs": ["/path/to/blocks1", "/path/to/blocks2"]`
2. ✅ Extension conditionally loads Block Builder modules when setting enabled
3. ✅ Implement priority-based block resolution: local directories override remote sources
4. ✅ Support multiple local block directories with configurable priority ordering
5. ✅ File watching across all configured directories with cache invalidation

**Key Implementation Files:**
- `src/extension.ts` - VS Code extension with local block development settings and BlockBuilder integration
- `apps/blockprotocol-poc/src/server.ts` - POC server with local block development support and priority resolution
- `apps/blockprotocol-poc/tests/hello-block.spec.ts` - E2E tests for local block development workflow
- `packages/blocks/dist/builder.js` - BlockBuilder library for framework compilation and hot reload
- `packages/blocks/src/builder.ts` - Core BlockBuilder implementation
- `packages/blocks/src/server.ts` - HTTP server component for block serving

### ✅ Unified Development Experience Complete (Phase G5.1.5 - Complete Workflow) ✅

**Completed Tasks:**
- ✅ Comprehensive E2E tests covering all interaction patterns (fully implemented)
- ✅ Local block development tests integrated into `just test-blockprotocol-poc` target
- ✅ All existing tests passing (46 passed, 3 skipped for future implementation)
- ✅ Local block development infrastructure fully operational
- ✅ Priority-based block resolution working in POC demo app

**Remaining Tasks (Post-G5.1.5):**
- Updated development guides with unified workflow
- Troubleshooting documentation for common issues
- Migration guide from current architecture to unified system
- Performance benchmarks and optimization guidelines
- Memory usage analysis for long-running development sessions
- Bundle size monitoring and optimization

**Key Implementation Files for Current Work:**
- `apps/blockprotocol-poc/tests/hello-block.spec.ts` - Test framework ready for full E2E implementation
- `docs/BlockProtocol-E2E-POC.md` - Main status document with milestone tracking
- `docs/BlockProtocol-DevServer.md` - Architecture documentation (this file)

## 6. Block Examples

When implementing the Block Builder & Server, refer to `docs/Coda-and-Notion-Blocks-POC.md` for concrete view/property blocks (TableView, BoardView, PersonChip, RelationCell, etc.). Each framework compilation pipeline should target that suite so the Block Builder & Server exercises realistic workloads.

## 7. Migration Notes

* **Entity Graph Management**: Currently handled by POC server, will be delegated to IndexingService
* **Framework Compilation**: Currently embedded in POC server, will be extracted to Block Builder & Server
* **Block Serving**: Currently embedded in POC server, will be extracted to Block Builder & Server
* **Test Scenarios**: Currently embedded in POC server, will remain but delegate entity operations

See `docs/BlockProtocol-E2E-POC.md` Phase G5.1 milestones for detailed implementation steps.
