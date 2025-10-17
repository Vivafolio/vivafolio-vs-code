# Hot Code Reloading Configuration

## Overview

The Vivafolio development environment supports hot code reloading for blocks during development. This allows you to edit block source code and see changes reflected in real-time without manually refreshing the browser.

## Architecture

The hot reload system consists of three components working together:

### 1. Block Development Server (`blocks/src/server.ts`)

- **Port**: 3001 (default, configurable)
- **Responsibilities**:
  - Serves block resources (JavaScript, CSS, metadata)
  - Watches block source files for changes using chokidar
  - Rebuilds blocks automatically when source changes detected
  - Broadcasts reload notifications via WebSocket to connected browsers
  - Provides CORS headers for cross-origin requests

**Key Features:**
- Explicit directory watching for each loaded block's `src/` directory
- WebSocket server using `ws` library with `WebSocketServer` class
- File stabilization with `awaitWriteFinish` (300ms threshold)
- Debug logging for connection and rebuild events

### 2. POC Demo Server (`apps/blockprotocol-poc/src/server.ts`)

- **Port**: Random (default, assigned on startup), configurable via `PORT`
- **Responsibilities**:
  - Serves the demo application with Vite in development mode
  - Handles WebSocket connections for Block Protocol communication
  - Provides CORS headers for cross-origin requests
  - Relays messages between blocks and the application

**Note:** The POC server runs on a random port by default. Look for the startup message:
```
[blockprotocol-poc] server listening on http://localhost:{PORT}
```

### 3. Client-Side Reload Handler (`apps/blockprotocol-poc/src/client/main.ts`)

- **Responsibilities**:
  - Connects to POC server via WebSocket
  - **NEW:** Also connects to block dev-server via second WebSocket connection
  - Listens for `cache:invalidate` messages from block dev-server
  - Force-reloads block iframes with cache-busting when invalidation received

**Dual WebSocket Architecture:**
```javascript
// Primary connection to POC server
const socket = new WebSocket(`ws://localhost:{POC_PORT}/ws`)

// Secondary connection to block dev-server for hot reload
const blockDevSocket = new WebSocket('ws://localhost:3001')
```

## How It Works

### Complete Flow

1. **Developer edits a block source file** (e.g., `blocks/d3-line-chart/src/LineChart.tsx`)

2. **Block dev-server detects the change** via chokidar file watcher:
   ```
   🔥 Block d3-line-chart source changed: d3-line-chart/src/LineChart.tsx
   ```

3. **Block is rebuilt** automatically:
   ```bash
   cd d3-line-chart && npm run build
   ```
   This runs Vite to compile the block.

4. **Reload notification is broadcast** via WebSocket to all connected clients:
   ```json
   {
     "type": "cache:invalidate",
     "payload": { "blockId": "d3-line-chart" }
   }
   ```

5. **Client receives notification** on block dev-server WebSocket:
   ```
   [Client] Block dev-server message received: {"type":"cache:invalidate",...}
   [Client] Received cache:invalidate for blockId: d3-line-chart
   ```

6. **Browser force-reloads the block** by updating iframe src with cache-busting:
   ```javascript
   const cacheBuster = `_reload=${Date.now()}`
   iframe.src = originalSrc + '?' + cacheBuster
   ```

7. **Block updates in browser** without manual page refresh (~2-3 seconds total)

## File Watcher Configuration

The block dev-server watches specific directories for changes:

```typescript
// Watches each block's src directory
const watchPaths: string[] = [];
for (const blockName of this.blocks.keys()) {
  const srcPath = path.join(this.options.blocksDir, blockName, 'src');
  if (existsSync(srcPath)) {
    watchPaths.push(srcPath);
  }
}

const watcher = chokidar.watch(watchPaths, {
  ignoreInitial: true,
  ignored: ['**/node_modules/**', '**/dist/**'],
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,  // Wait 300ms after last change
    pollInterval: 100
  }
});
```

**Directories Watched:**
- `blocks/color-picker/src/`
- `blocks/color-square/src/`
- `blocks/d3-line-chart/src/`
- `blocks/status-pill/src/`

## CORS Configuration

Since the block dev-server (port 3001) and POC server (random port) run on different ports, CORS headers are required:

### Block Dev-Server CORS Headers
```javascript
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### POC Server CORS Headers
```javascript
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
```

## WebSocket Protocol

### Connections

The client establishes **two** WebSocket connections:

1. **POC Server WebSocket** - For Block Protocol messages
2. **Block Dev-Server WebSocket** - For hot reload notifications

### Messages

#### Cache Invalidation (Block Dev-Server → Client)
```typescript
{
  type: 'cache:invalidate',
  payload: {
    blockId: string  // The ID of the block to reload (e.g., "d3-line-chart")
  }
}
```

This message triggers the client to reload the specified block's iframe with cache-busting.

#### VivafolioBlock Notification (POC Server → Client)
```typescript
{
  type: 'vivafolioblock-notification',
  payload: {
    blockId: string
    blockType: string
    entityId: string
    displayMode: 'multi-line' | 'inline'
    entityGraph: EntityGraph
    supportsHotReload?: boolean
    resources?: Array<{
      logicalName: string
      physicalPath: string
      cachingTag?: string
    }>
  }
}
```

## Running the Development Environment

### Start the Block Dev-Server

```bash
# From the project root
just watch-blocks

# This runs: cd blocks && npm run dev-server
```

**Expected Output:**
```
📁 Will watch: color-picker/src
📁 Will watch: color-square/src
📁 Will watch: d3-line-chart/src
📁 Will watch: status-pill/src
✅ File watcher ready
📂 Actively watching 8 directories
🚀 Block Server running on http://localhost:3001
📦 Serving 4 blocks
🔍 Hot reload enabled
🔌 WebSocket support enabled
```

### Start the POC Demo Server

```bash
# From the project root
just dev-blockprotocol-poc-once

# This builds blocks and starts the POC server
```

**Look for the port in output:**
```
[blockprotocol-poc] server listening on http://localhost:{PORT}
```

### Open Browser and Test

1. Navigate to: `http://localhost:{PORT}/scenarios/d3-line-graph-example`
2. Open browser DevTools Console (F12)
3. Verify WebSocket connections:
   ```
   [Client] Connecting to WebSocket: ws://localhost:{PORT}/ws
   [Client] WebSocket connected
   [Client] Connecting to block dev-server: ws://localhost:3001
   [Client] Block dev-server WebSocket connected
   ```

### Test Hot Reload

1. Edit `blocks/d3-line-chart/src/LineChart.tsx`
2. Make a visible change (e.g., change a label)
3. Save the file (Ctrl+S)
4. Watch for output:

**Block Dev-Server Terminal:**
```
🔥 Block d3-line-chart source changed: d3-line-chart/src/LineChart.tsx
Rebuilt d3-line-chart: ...
✅ d3-line-chart rebuilt successfully
```

**Browser Console:**
```
[Client] Block dev-server message received: {"type":"cache:invalidate","payload":{"blockId":"d3-line-chart"}}
[Client] Block dev-server message type: cache:invalidate
[Client] Received cache:invalidate for blockId: d3-line-chart
[Client] Reloading block: d3-line-chart - forcing iframe reload
[Client] Reloading iframe with cache-busting: http://localhost:{PORT}/blocks/d3-line-chart/dist/index.html?_reload=1729166789456
```

**Result:** Block updates in browser within 2-3 seconds without manual refresh.

## Troubleshooting

### Hot Reload Not Working

#### Check WebSocket Connections

**Verify both connections are established:**
```javascript
// In browser console
console.log('Check WebSocket connections...')
```

Look for:
- `[Client] WebSocket connected` (POC server)
- `[Client] Block dev-server WebSocket connected` (block dev-server)

If missing, check:
1. Block dev-server is running on port 3001
2. POC server is running
3. No browser security blocking WebSocket connections

#### Check File Watcher

**Verify watcher is active:**
- Block dev-server should show `📂 Actively watching 8 directories` on startup
- If it shows `📂 Watching 0 directories` - the watcher failed to initialize

**Test manually:**
```bash
# Trigger a file change
touch /home/elidim/Dev/vivafolio-vs-code/blocks/d3-line-chart/src/LineChart.tsx

# Watch block dev-server terminal for "🔥 Block d3-line-chart source changed..."
```

#### Check Block Build

**Verify the block can build:**
```bash
cd /home/elidim/Dev/vivafolio-vs-code/blocks/d3-line-chart
npm run build
```

If build fails with syntax errors, fix them first. Hot reload cannot work if the build fails.

#### Check CORS Headers

Open browser DevTools → Network tab:
- Look for CORS errors in console
- Verify requests to `localhost:3001` succeed
- Check response headers include `Access-Control-Allow-Origin: *`

#### Port Conflicts

**If block dev-server won't start:**
```bash
# Check what's using port 3001
lsof -ti:3001

# Kill the process
lsof -ti:3001 | xargs kill -9

# Restart
just watch-blocks
```

### Common Issues

#### "WebSocket.Server is not a constructor"

**Fixed:** Using correct import in `blocks/src/server.ts`:
```typescript
import WebSocket, { WebSocketServer } from 'ws';
```

#### "Watching 0 directories"

**Fixed:** Using explicit path watching instead of glob patterns with `cwd`.

#### Changes not visible after rebuild

**Cause:** Browser cache or build didn't complete.

**Solution:** 
1. Check block dev-server logs for build completion
2. Force reload browser (Ctrl+Shift+R)
3. Clear browser cache
4. Verify `dist/` directory was updated:
   ```bash
   ls -lh blocks/d3-line-chart/dist/index.js
   ```

#### WebSocket connection fails in browser

**Check:**
1. Block dev-server is running: `curl http://localhost:3001/healthz`
2. No firewall blocking port 3001
3. Browser security settings allow WebSocket connections

## Configuration Options

### Block Dev-Server

Located in `blocks/src/server.ts`:

```typescript
{
  port: 3001,              // HTTP server port
  host: '0.0.0.0',        // Bind address
  blocksDir: '/path/to/blocks',
  enableWebSocket: true,   // Enable WebSocket server
  enableHotReload: true,   // Enable file watching
  enableFrameworkBuilder: false
}
```

### POC Server

Command line:
```bash
# Random port (default)
just dev-blockprotocol-poc-once

# Specific port
PORT=4173 just dev-blockprotocol-poc-once
```

### Client WebSocket URLs

Located in `apps/blockprotocol-poc/src/client/main.ts`:

```typescript
// POC server WebSocket (uses page hostname)
const wsUrl = `${protocol}//${location.host}/ws?${params.toString()}`

// Block dev-server WebSocket (hardcoded)
const blockDevServerUrl = `ws://localhost:3001`
```

## Performance

**Hot Reload Timing:**
- File change detection: ~100ms (with 300ms stabilization)
- Block rebuild (Vite): 1-2 seconds
- WebSocket notification: <10ms
- Browser iframe reload: ~500ms

**Total:** 2-3 seconds from save to visible update

## Architecture Diagram

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  Developer      │         │  Block Dev-Server│         │  Browser     │
│                 │         │  (port 3001)     │         │              │
└────────┬────────┘         └────────┬─────────┘         └──────┬───────┘
         │                           │                           │
         │ 1. Edit & Save           │                           │
         │    LineChart.tsx         │                           │
         ├──────────────────────────►                           │
         │                           │                           │
         │                  2. Detect change (chokidar)         │
         │                           │                           │
         │                  3. npm run build                     │
         │                           │                           │
         │                  4. Send cache:invalidate             │
         │                           ├──────────────────────────►│
         │                           │        WebSocket          │
         │                           │                           │
         │                           │        5. Reload iframe   │
         │                           │           with cache-bust │
         │                           │                           │
         │                           │        6. Fetch updated   │
         │                           │◄──────────────────────────┤
         │                           │        /blocks/.../       │
         │                           │                           │
         │                           │        7. Display updated │
         │                           │            block          │
```

## Future Enhancements

- [x] Dual WebSocket architecture (POC + block dev-server)
- [x] Cache-busting for iframe reload
- [x] Explicit directory watching
- [ ] Add hot module replacement (HMR) for faster updates without full reload
- [ ] Support selective invalidation (only reload changed resources, not entire iframe)
- [ ] Add connection retry logic for WebSocket
- [ ] Support secure WebSocket (WSS) for HTTPS deployments
- [ ] Add rate limiting for rebuild triggers (debouncing)
- [ ] Content-based cache-busting (hash instead of timestamp)
