# @vivafolio/block-loader

Secure Block Protocol loader for Vivafolio webviews with integrity checking and dependency sandboxing.

## Overview

The `@vivafolio/block-loader` package implements the Block Protocol loader that runs inside each VS Code webview. It provides secure execution of third-party Block Protocol blocks while enforcing the security model described in the [BlockProtocol-in-Vivafolio.md specification](../../docs/spec/BlockProtocol-in-Vivafolio.md).

## Key Features

- **🔒 Dependency Sandboxing**: Only explicitly allowed CommonJS dependencies can be required
- **🔐 Bundle Integrity**: SHA-256 integrity checking for bundles and local resources
- **📊 Audit Logging**: Comprehensive diagnostics and dependency tracking
- **🌐 Local Resource Resolution**: Secure loading of bundled JS/CSS assets
- **🎯 Block Protocol Compliance**: Full support for published npm blocks and HTML template blocks
- **🔄 Live Updates**: Support for real-time block updates via GraphEmbedderHandler

## Security Model

This package implements the security requirements from section 5.4 of the specification:

1. **Dependency Allowlist**: Only approved modules can be loaded
2. **Integrity Verification**: SHA-256 hashes computed and verified for all code
3. **Audit Trail**: Complete logging of all dependencies and resources loaded
4. **Sandboxing**: Third-party code runs in isolated execution context

## Installation

```bash
npm install @vivafolio/block-loader
# or
yarn add @vivafolio/block-loader
```

## Basic Usage

```typescript
import { VivafolioBlockLoader, type VivafolioBlockNotification } from '@vivafolio/block-loader'

// Create a loader instance
const loader = new VivafolioBlockLoader(notification, {
  allowedDependencies: new Set(['react', 'react-dom', '@blockprotocol/graph']),
  enableIntegrityChecking: true,
  enableDiagnostics: true,
  onBlockUpdate: (payload) => {
    // Handle block updates (send to indexing service)
    console.log('Block updated:', payload)
  }
})

// Load a block into a container
const container = document.getElementById('block-container')
const blockElement = await loader.loadBlock(notification, container)

// Later, update the block with new data
loader.updateBlock(updatedNotification)

// Cleanup when done
loader.destroy()
```

## Advanced Usage

### Custom Dependency Allowlist

```typescript
import { DEFAULT_ALLOWED_DEPENDENCIES } from '@vivafolio/block-loader'

const customAllowedDeps = new Set([
  ...DEFAULT_ALLOWED_DEPENDENCIES,
  'lodash',  // Add additional allowed dependency
  'moment'
])

const loader = new VivafolioBlockLoader(notification, {
  allowedDependencies: customAllowedDeps
})
```

### Accessing Diagnostics

```typescript
const diagnostics = loader.getDiagnostics()
if (diagnostics) {
  console.log('Bundle integrity:', diagnostics.integritySha256)
  console.log('Blocked dependencies:', diagnostics.blockedDependencies)
  console.log('Local modules loaded:', diagnostics.localModules?.length)
}
```

### HTML Template Block Support

```typescript
// Setup HTML template bridge (typically done once per webview)
window.__vivafolioHtmlTemplateHost = {
  register(blockId, handlers) {
    // Store handlers for block updates
    return {
      updateEntity: (payload) => {
        // Forward updates to indexing service
      }
    }
  }
}
```

## API Reference

### VivafolioBlockLoader

Main class for loading and managing Block Protocol blocks.

#### Constructor

```typescript
new VivafolioBlockLoader(notification: VivafolioBlockNotification, options?: BlockLoaderOptions)
```

#### Methods

- `loadBlock(notification, container)` - Load a block into a DOM container
- `updateBlock(notification)` - Update an existing block with new data
- `destroy()` - Clean up resources and destroy the block
- `getDiagnostics()` - Get security and integrity diagnostics

### Types

- `VivafolioBlockNotification` - Block discovery notification from LSP
- `BlockLoaderOptions` - Configuration options for the loader
- `BlockLoaderDiagnostics` - Security and integrity audit data
- `BlockResource` - Individual resource (JS/CSS) in a block bundle

## Architecture

The block loader is designed to run inside VS Code webviews and communicates with:

- **Extension Host**: Receives block notifications and forwards updates
- **Indexing Service**: Sends entity updates for persistence
- **Block Protocol Blocks**: Executes third-party blocks securely

## Development

```bash
# Build the package
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

## Related Packages

- `@vivafolio/indexing-service` - Runs in extension host, manages entity graph
- `@blockprotocol/graph` - Core Block Protocol graph library

## License

MIT
