# Vivafolio Block Loader Design Document

## 1. Overview

The `@vivafolio/block-loader` package implements a secure Block Protocol loader that runs inside VS Code webviews. It provides the execution environment for third-party Block Protocol blocks while enforcing strict security controls and maintaining full compliance with the Block Protocol specification.

This document details the loader's functionality, design rationale, and the responsibilities expected from applications that use the loader.

## 2. Core Functionality

### 2.1 Block Execution Environment

The loader creates a sandboxed execution environment for Block Protocol blocks with the following capabilities:

#### **Bundle Block Execution**
- **CommonJS Module Resolution**: Implements a secure `require()` shim that only allows explicitly approved dependencies
- **Local Resource Loading**: Handles bundled JavaScript and CSS files with integrity verification
- **React Component Rendering**: Supports both direct React components and custom element factories
- **Dynamic Component Detection**: Automatically determines block type (React component vs custom element factory)

#### **HTML Template Block Execution**
- **DOM Integration**: Provides `window.blockprotocol.getBlockContainer()` API for HTML blocks
- **Host Bridge Communication**: Enables bidirectional communication between HTML blocks and the host
- **Script Execution**: Safely executes inline JavaScript within HTML templates
- **Entity State Management**: Handles entity data injection and readonly state management

### 2.2 Security Implementation

The loader implements the security model defined in the BlockProtocol-in-Vivafolio.md specification (Section 5.4):

#### **Dependency Allowlist Enforcement**
```typescript
const DEFAULT_ALLOWED_DEPENDENCIES = new Set([
  'react', 'react/jsx-runtime', 'react/jsx-dev-runtime',
  'react-dom', 'react-dom/client',
  '@blockprotocol/graph', '@blockprotocol/graph/stdlib',
  '@blockprotocol/graph/custom-element'
])
```
**Rationale**: Third-party blocks should only access approved libraries to prevent supply chain attacks and maintain sandbox integrity.

#### **Bundle Integrity Checking**
- SHA-256 hash computation for all loaded code
- Integrity verification for local resources (JS/CSS files)
- Audit logging of all loaded content
**Rationale**: Ensures blocks haven't been tampered with during distribution or storage.

#### **Execution Sandboxing**
- Isolated CommonJS execution context
- Controlled access to browser APIs
- No direct filesystem or network access
**Rationale**: Prevents malicious blocks from accessing sensitive host resources.

### 2.3 Block Protocol Compliance

#### **BlockEntitySubgraph Provisioning**
The loader constructs the Block Protocol `blockEntitySubgraph` from the `VivafolioBlockNotification`:

```typescript
interface BlockEntitySubgraph {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
  linkedEntities: Array<{
    linkEntity: { entityId: string; sourceEntityId: string; destinationEntityId: string; properties: Record<string, unknown> }
    destinationEntity: { entityId: string; entityTypeId: string; properties: Record<string, unknown> }
  }>
}
```

#### **Update Propagation**
- Forwards `updateEntity` calls from blocks to the host application
- Supports both direct entity updates and linked entity modifications
- Maintains consistency between block state and host graph

#### **Graph Service Compatibility**
Implements hooks for future Block Protocol graph operations:
- `getEntity` for retrieving entity snapshots
- `aggregateEntities` for paginated entity queries
- `createLinkedAggregation` for relationship management

## 3. Design Rationale

### 3.1 Security-First Architecture

**Why strict dependency allowlisting?**
- Block Protocol blocks are third-party code that could be malicious
- Open-ended `require()` would allow loading arbitrary Node.js modules
- Controlled dependency set ensures predictable security surface
- Aligns with Block Protocol's principle of "secure by default"

**Why integrity checking?**
- Published blocks are distributed via npm/CDNs
- Man-in-the-middle attacks could modify bundles in transit
- SHA-256 provides cryptographic assurance of code authenticity
- Audit trail enables compliance and debugging

**Why sandboxed execution?**
- Blocks run in webviews with access to browser APIs
- Malicious blocks could attempt DOM manipulation attacks
- Sandboxing prevents cross-block interference
- Maintains isolation between different blocks in the same webview

### 3.2 Block Type Flexibility

**Why support multiple block formats?**
- Block Protocol ecosystem includes various implementation approaches
- Custom elements provide low-level DOM control
- React components offer declarative UI patterns
- HTML templates enable rapid prototyping
- Single loader reduces complexity for block authors

**Why automatic block type detection?**
- Reduces friction for block developers
- Eliminates configuration overhead
- Enables gradual migration between block formats
- Maintains backward compatibility

### 3.3 Performance Considerations

**Why prefetch local resources?**
- Webview network requests are expensive
- Bundled assets should load instantly
- Prefetching reduces perceived latency
- Enables offline operation

**Why embed initial data in HTML?**
- Eliminates round-trip for initial render
- Instant hydration prevents loading states
- Reduces server load during block discovery
- Aligns with modern web performance best practices

## 4. Application Responsibilities

When using the `@vivafolio/block-loader`, the host application must handle several responsibilities that the loader delegates to maintain the separation of concerns.

### 4.1 Block Discovery and Notification

The application must:

**Provide VivafolioBlockNotification Structure**
```typescript
interface VivafolioBlockNotification {
  blockId: string                    // Unique block instance identifier
  blockType: string                  // Block type URL (e.g., "https://blockprotocol.org/@org/blocks/my-block/v1")
  displayMode: 'multi-line' | 'inline' // Layout mode for the block
  sourceUri: string                  // Source file location for persistence
  range: {                           // Code range for UI insertion
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  entityId?: string                  // Root entity ID (optional, loader generates if missing)
  resources: BlockResource[]         // Bundled JS/CSS files
  entityGraph: EntityGraph           // Complete graph data for the block
}
```

**Rationale**: The loader focuses on secure execution, while the application manages block lifecycle and data flow.

### 4.2 Resource Management

**Serve Block Resources**
The application must serve block resources (main.js, app.html, local chunks) at predictable URLs:

```typescript
interface BlockResource {
  logicalName: string    // e.g., "main.js", "chunk.js", "app.html"
  physicalPath: string   // Server filesystem path or CDN URL
  cachingTag?: string    // Cache-busting identifier
}
```

**Implement URL Resolution**
Provide `resolveResourceUrl()` functionality that converts logical names to accessible URLs.

**Rationale**: The loader operates in a webview context and cannot access host filesystem directly.

### 4.3 Update Handling and Persistence

**Forward Block Updates**
Implement the `onBlockUpdate` callback to handle entity modifications:

```typescript
const loader = new VivafolioBlockLoader(notification, {
  onBlockUpdate: (payload: { entityId: string; properties: Record<string, unknown> }) => {
    // Application responsibilities:
    // 1. Update in-memory entity graph
    // 2. Persist changes to source files (YAML frontmatter, CSV, etc.)
    // 3. Notify other blocks of related entity changes
    // 4. Commit changes to version control if configured
  }
})
```

**Manage Entity Persistence**
- Update source files when entities change
- Handle different file formats (Markdown, CSV, custom syntax)
- Maintain entity-to-file mapping
- Implement conflict resolution for concurrent edits

**Rationale**: The loader enforces execution security but delegates data persistence to the application layer.

### 4.4 Multi-Block Synchronization

**Fan-out Updates**
When one block updates an entity, notify all other blocks referencing that entity:

```typescript
// Application must implement broadcast mechanism
function handleEntityUpdate(entityId: string, newProperties: Record<string, unknown>) {
  // Find all blocks that reference this entity
  const affectedBlocks = findBlocksReferencingEntity(entityId)

  // Update each block with new data
  affectedBlocks.forEach(block => {
    const updatedNotification = createUpdatedNotification(block, entityId, newProperties)
    block.updateBlock(updatedNotification)
  })
}
```

**Rationale**: Block Protocol requires graph consistency across all active blocks.

### 4.5 HTML Template Bridge Setup

**Initialize HTML Template Host Bridge**
For HTML template blocks, set up the communication bridge:

```typescript
// Application must set up once per webview
window.__vivafolioHtmlTemplateHost = {
  register(blockId: string, handlers: HtmlTemplateHandlers) {
    // Store handlers for this block
    htmlTemplateHandlers.set(blockId, handlers)

    // Apply initial entity data
    const entity = getEntityForBlock(blockId)
    handlers.setEntity(entity)
    handlers.setReadonly(false)

    return {
      updateEntity: (payload) => {
        // Forward to application's update handler
        handleBlockUpdate({ ...payload, blockId })
      }
    }
  }
}
```

**Rationale**: HTML blocks need a standardized way to communicate with the host application.

### 4.6 Error Handling and Diagnostics

**Handle Loading Failures**
Implement proper error handling for block loading failures:

```typescript
loader.loadBlock(notification, container)
  .then(() => {
    // Block loaded successfully
  })
  .catch(error => {
    // Application responsibilities:
    // 1. Display user-friendly error message
    // 2. Log diagnostics for debugging
    // 3. Potentially offer fallback UI
    // 4. Report errors to telemetry service
  })
```

**Collect and Use Diagnostics**
Access loader diagnostics for security auditing and debugging:

```typescript
const diagnostics = loader.getDiagnostics()
if (diagnostics) {
  // Application can:
  // - Log blocked dependency attempts
  // - Verify bundle integrity
  // - Monitor resource loading patterns
  // - Generate security reports
}
```

**Rationale**: The loader provides diagnostic information but the application decides how to use it.

## 5. Integration Patterns

### 5.1 VS Code Extension Integration

In the Vivafolio VS Code extension, the block loader would be used as follows:

```typescript
// Extension host (manages indexing service communication)
class VivafolioBlockManager {
  private loaders = new Map<string, BlockLoader>()

  async createBlock(notification: VivafolioBlockNotification, webview: vscode.Webview) {
    // Adapt notification for loader
    const adaptedNotification = adaptForLoader(notification)

    // Create loader instance
    const loader = new VivafolioBlockLoader(adaptedNotification, {
      onBlockUpdate: (payload) => {
        // Forward to indexing service
        this.indexingService.updateEntity(payload.entityId, payload.properties)
      }
    })

    // Load block in webview
    const script = `
      const loader = new VivafolioBlockLoader(${JSON.stringify(adaptedNotification)}, {
        onBlockUpdate: (payload) => {
          vscode.postMessage({ type: 'blockUpdate', payload })
        }
      })
      loader.loadBlock(notification, document.getElementById('block-container'))
    `

    webview.postMessage({ type: 'loadBlock', script })
  }
}
```

### 5.2 POC Demo Integration

The current POC demonstrates the application responsibilities:

```typescript
// apps/blockprotocol-poc/src/client/main.ts
function renderPublishedBlock(notification: VivafolioBlockNotification): HTMLElement {
  // 1. Adapt notification format for loader
  const adaptedNotification = adaptBlockNotification(notification)

  // 2. Create loader with update handler
  const loader = new VivafolioBlockLoader(adaptedNotification, {
    onBlockUpdate: (payload) => {
      handleBlockUpdate({ ...payload, blockId: notification.blockId })
    }
  })

  // 3. Provide container and handle loading
  const container = document.createElement('div')
  loader.loadBlock(adaptedNotification, container)
    .then(() => { /* success */ })
    .catch(error => { /* display error */ })

  return container
}
```

## 6. Security Considerations

### 6.1 Dependency Allowlist Management

Applications should carefully manage the dependency allowlist:
- Start with `DEFAULT_ALLOWED_DEPENDENCIES`
- Only add dependencies after security review
- Consider dependency versioning for stability
- Monitor for vulnerable dependencies

### 6.2 Resource Access Control

- Validate all resource URLs before serving
- Implement proper CORS policies for CDN resources
- Use HTTPS for all external resource loading
- Implement rate limiting for resource requests

### 6.3 Error Information Disclosure

- Avoid exposing internal error details to blocks
- Sanitize error messages in production
- Log full error context for debugging
- Implement error aggregation for monitoring

## 7. Performance Characteristics

### 7.1 Memory Management

- Loaders maintain references to DOM elements and React roots
- Applications should call `destroy()` when blocks are removed
- Implement proper cleanup to prevent memory leaks
- Consider loader reuse for frequently used blocks

### 7.2 Network Optimization

- Bundle prefetching reduces initial load time
- Cache resources appropriately using cache tags
- Minimize notification payload size
- Implement progressive loading for large graphs

### 7.3 Update Batching

- Batch multiple entity updates when possible
- Debounce rapid successive updates
- Implement optimistic UI updates
- Handle update conflicts gracefully

## 8. Future Extensions

### 8.1 Graph Service Integration

The loader includes hooks for full Block Protocol graph service integration:
- `aggregateEntities` for complex queries
- `createLinkedAggregation` for relationship management
- `getEntity` for on-demand entity loading

### 8.2 Advanced Block Types

Support for additional block formats:
- Web Components without React dependency
- Vue/Svelte/Angular component blocks
- Server-side rendered blocks

### 8.3 Enhanced Security

Future security enhancements:
- Code signing verification
- Runtime behavior monitoring
- Advanced sandboxing techniques
- Integration with browser security features

## 9. Conclusion

The `@vivafolio/block-loader` provides a robust, secure foundation for executing Block Protocol blocks in webview environments. By separating execution security from application logic, it enables flexible block ecosystems while maintaining strict security controls.

The application using the loader must handle block discovery, resource serving, update persistence, and multi-block coordination, creating a clear separation of concerns that supports both security and extensibility.

This design enables the Vivafolio vision of a composable, secure block-based editing experience while maintaining compatibility with the broader Block Protocol ecosystem.
