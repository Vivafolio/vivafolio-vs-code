# Block Builder & Server

The Block Builder & Server is a unified library for compiling, serving, and managing Block Protocol blocks with framework support and real-time updates.

## Features

- **Framework Compilation**: Support for SolidJS, Vue, Svelte, Lit, and Angular frameworks
- **Hot Reload**: Real-time compilation and serving with WebSocket notifications
- **ESM Support**: Modern ES module exports for easy integration
- **Block Serving**: HTTP server for serving compiled blocks and resources
- **Cache Invalidation**: WebSocket-based real-time updates for connected clients

## Installation

```bash
npm install @vivafolio/blocks
```

## Usage

### As a Library

#### Block Builder

```typescript
import { BlockBuilder } from '@vivafolio/blocks/builder';

const builder = new BlockBuilder({
  frameworks: ['solidjs', 'vue'],
  watchMode: true,
  onBundleUpdate: (framework, bundle) => {
    console.log(`Updated ${framework} bundle: ${bundle.entryPoint}`);
  }
});

// Build all blocks
await builder.build();

// Start watching for changes
await builder.watch();

// Later, stop watching
await builder.stop();
```

#### Block Server

```typescript
import { BlockServer } from '@vivafolio/blocks/server';

const server = new BlockServer({
  port: 3001,
  enableWebSocket: true,
  enableHotReload: true,
  enableFrameworkBuilder: true,
  frameworkOptions: {
    frameworks: ['solidjs', 'vue', 'svelte'],
    watchMode: true
  }
});

await server.start();
```

#### Demo Application Server Integration

```typescript
import { BlockBuilder } from '@vivafolio/blocks/builder';

// In your demo server
const blockBuilder = new BlockBuilder({
  watchMode: true
});

await blockBuilder.build();
await blockBuilder.watch();

// Use blockBuilder.getBundles() to get available blocks
```

#### VS Code Extension Integration

```typescript
import { BlockServer } from '@vivafolio/blocks/server';

// In extension host
const blockServer = new BlockServer({
  enableWebSocket: false, // Use VS Code messaging instead
  enableFrameworkBuilder: true,
  frameworkOptions: {
    frameworks: ['solidjs', 'vue', 'svelte', 'lit', 'angular']
  }
});

await blockServer.start();

// Get framework builder for custom integration
const builder = blockServer.getBlockBuilder();
```

### As a CLI Tool

```bash
# Start development server with framework support
npx @vivafolio/blocks server --frameworks solidjs,vue --watch

# Build blocks for production
npx @vivafolio/blocks build
```

## API Reference

### BlockBuilder

#### Constructor Options
- `frameworks?: string[]` - List of frameworks to support (default: all)
- `outputDir?: string` - Output directory for compiled bundles
- `watchMode?: boolean` - Enable file watching
- `onBundleUpdate?: (framework: string, bundle: FrameworkBundle) => void` - Bundle update callback

#### Methods
- `build(): Promise<FrameworkWatcher[]>` - Build all framework blocks
- `watch(): Promise<void>` - Start watching for file changes
- `stop(): Promise<void>` - Stop watching and cleanup
- `getBundles(): Map<string, FrameworkBundle>` - Get all current bundles
- `getWatcher(framework: string): FrameworkWatcher | undefined` - Get watcher for specific framework

### BlockServer

#### Constructor Options
- `port?: number` - Server port (default: 3001)
- `host?: string` - Server host (default: 'localhost')
- `blocksDir?: string` - Directory containing blocks
- `enableWebSocket?: boolean` - Enable WebSocket support
- `enableHotReload?: boolean` - Enable hot reload
- `enableFrameworkBuilder?: boolean` - Enable framework builder
- `frameworkOptions?: BlockBuilderOptions` - Framework builder options

#### Methods
- `start(): Promise<void>` - Start the server
- `stop(): Promise<void>` - Stop the server
- `getBlockBuilder(): BlockBuilder | undefined` - Get the block builder instance
- `getBlocks(): Map<string, BlockMetadata>` - Get loaded blocks

### WebSocket Events

The server emits these events to connected WebSocket clients:

```typescript
// Framework bundle updates
{
  type: 'framework-update',
  framework: 'solidjs',
  bundle: {
    id: 'solidjs-component',
    hash: 'abc123',
    entryPoint: 'solidjs-abc123.js',
    lastModified: '2025-09-21T12:00:00.000Z'
  }
}

// Block updates
{
  type: 'block-update',
  blockName: 'color-picker'
}
```

## HTTP Endpoints

- `GET /blocks/:blockName/:fileName` - Serve block resources
- `GET /frameworks/:framework/:fileName` - Serve framework bundles
- `GET /api/blocks/:blockName` - Get block metadata
- `GET /api/blocks` - List all blocks
- `GET /api/frameworks/:framework/bundles` - Get framework bundles
- `GET /healthz` - Health check

## Development Workflow

1. **Create a new block**:
   ```bash
   mkdir blocks/my-block
   # Add block-metadata.json and source files
   ```

2. **Start development server**:
   ```bash
   cd blocks
   npm run dev-server
   ```

3. **The server will**:
   - Load block metadata
   - Start framework compilation if enabled
   - Watch for file changes
   - Serve blocks at http://localhost:3001

4. **Integrate with demo app**:
   ```typescript
   import { BlockBuilder } from '@vivafolio/blocks/builder';

   const builder = new BlockBuilder({ watchMode: true });
   await builder.build();
   await builder.watch();
   ```

## Framework Support

### Supported Frameworks
- **SolidJS**: Reactive components with JSX
- **Vue**: Composition API with single-file components
- **Svelte**: Component framework with compile-time optimizations
- **Lit**: Web Components with lit-html
- **Angular**: Component framework with dependency injection

### Framework Detection
Frameworks are detected based on file extensions:
- `.tsx`, `.ts` → SolidJS (default)
- `.vue` → Vue
- `.svelte` → Svelte

### Compilation Output
Each framework compiles to:
- A JavaScript bundle with content-based hash
- Source map for debugging
- Metadata about compilation time and source

## Real-time Updates

The Block Builder & Server provides real-time updates through:

1. **WebSocket Connections**: Clients receive live updates when blocks change
2. **Cache Busting**: HTTP headers prevent caching during development
3. **Framework Notifications**: Framework compilation updates are broadcast to all clients

## Integration Examples

### Demo Application Server
```typescript
// Load Block Builder as ESM module
import { BlockBuilder } from '@vivafolio/blocks/builder';

const blockBuilder = new BlockBuilder({
  watchMode: true,
  onBundleUpdate: (framework, bundle) => {
    // Notify demo app about updates
    console.log(`Block ${framework}/${bundle.id} updated`);
  }
});

// The demo server can now serve hot-reloaded blocks
```

### VS Code Extension
```typescript
// Use Block Builder for local development mode
import { BlockServer } from '@vivafolio/blocks/server';

const server = new BlockServer({
  enableFrameworkBuilder: true,
  // Disable WebSocket, use VS Code messaging instead
  enableWebSocket: false
});

await server.start();

// Override remote block loading with local versions
const builder = server.getBlockBuilder();
if (builder) {
  // VS Code can now load blocks from local builder
}
```

## Building for Production

```bash
# Build TypeScript
npm run build:ts

# Build all blocks
npm run build:all

# The dist/ directory contains the compiled library
```

## Migration from Old Dev Server

The new Block Builder & Server replaces the old `dev-server.js`:

**Old way:**
```javascript
// dev-server.js - basic file serving
const express = require('express');
const chokidar = require('chokidar');
```

**New way:**
```typescript
// Modern TypeScript with framework support
import { BlockServer } from '@vivafolio/blocks/server';

const server = new BlockServer({
  enableFrameworkBuilder: true,
  enableWebSocket: true
});
```

The new system provides:
- ✅ Framework compilation
- ✅ TypeScript support
- ✅ ESM modules
- ✅ WebSocket real-time updates
- ✅ Better architecture for extension integration
