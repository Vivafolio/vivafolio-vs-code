# Hot Reload Debugging Guide

## Quick Debug Checklist

### 1. Check Both Servers Are Running

```bash
# Block dev-server (should be on port 3001)
ps aux | grep -E "(dev-server|tsx.*server.ts)" | grep -v grep

# POC server (check which port it's using)
lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep node
```

**Expected:**
- Block dev-server: `tsx src/server.ts` or `npm run dev-server`
- POC server: `tsx src/server.ts` in apps/blockprotocol-poc

### 2. Verify Server Health

```bash
# Block dev-server
curl -s http://localhost:3001/healthz | jq .

# POC server (replace PORT with actual port from startup logs)
curl -s http://localhost:PORT/healthz | jq .
```

**Expected output:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-17T...",
  "clients": 1,  // Should be > 0 if browser connected
  "blocks": 4
}
```

### 3. Check CORS Headers

```bash
# Should show Access-Control-Allow-Origin: *
curl -I http://localhost:3001/healthz | grep -i access-control
curl -I http://localhost:PORT/healthz | grep -i access-control
```

**Expected:**
```
access-control-allow-origin: *
access-control-allow-methods: GET, POST, OPTIONS
```

### 4. Check WebSocket Clients Connected

```bash
# Block dev-server should show "clients": 1 (or more) if browser is connected
curl -s http://localhost:3001/healthz | jq .clients
```

**If `clients: 0`**: Browser is not connected to block dev-server WebSocket.

## Current Architecture (Working)

### Dual WebSocket Architecture

```
Browser
  ├─ WebSocket 1 → POC Server (port POC_PORT)
  │                 - Block Protocol messages
  │                 - Entity graph updates
  │
  └─ WebSocket 2 → Block Dev-Server (port 3001)
                    - Hot reload notifications
                    - cache:invalidate messages
```

### Hot Reload Flow (Working)

1. **File changes** → Block dev-server's chokidar watcher detects
2. **Block rebuilds** → `npm run build` runs in block directory
3. **WebSocket notification** → Block dev-server sends `cache:invalidate` to browser
4. **Browser receives** → Via WebSocket 2 (block dev-server connection)
5. **Iframe reloads** → With cache-busting: `?_reload=${Date.now()}`
6. **Block updates** → New code visible (~2-3 seconds total)

## Step-by-Step Debugging

### Step 1: Verify Both WebSocket Connections

1. Open http://localhost:PORT in browser
2. Press F12 to open DevTools
3. Go to **Console** tab

**Expected logs:**
```
[Client] Connecting to WebSocket: ws://localhost:PORT/ws
[Client] WebSocket connected
[Client] Connecting to block dev-server: ws://localhost:3001
[Client] Block dev-server WebSocket connected
```

**If missing second connection:**
- Check block dev-server is running
- Check port 3001 is not blocked
- Look for connection errors in console

### Step 2: Check Network Tab

1. Go to **Network** tab → **WS** filter
2. Should see **two** WebSocket connections:
   - `ws://localhost:PORT/ws` (POC server)
   - `ws://localhost:3001` (block dev-server)

**Click on each connection:**
- Status should be "101 Switching Protocols"
- Messages tab should show activity

### Step 3: Test File Change Detection

```bash
# Make a visible change to a block
echo "// test change $(date +%s)" >> blocks/d3-line-chart/src/LineChart.tsx
```

### Step 4: Verify Server Logs

**Block dev-server terminal** should show:
```
🔥 Block d3-line-chart source changed: d3-line-chart/src/LineChart.tsx
Rebuilt d3-line-chart: ...
✅ d3-line-chart rebuilt successfully
```

**Browser console** should show:
```
[Client] Block dev-server message received: {"type":"cache:invalidate","payload":{"blockId":"d3-line-chart"}}
[Client] Received cache:invalidate for blockId: d3-line-chart
[Client] Reloading block: d3-line-chart - forcing iframe reload
[Client] Reloading iframe with cache-busting: http://localhost:PORT/blocks/d3-line-chart/dist/index.html?_reload=1729...
```

### Step 5: Verify Block Updates

**In browser:**
- Block should reload automatically
- Look for visual changes in the block
- No manual page refresh needed

## Common Issues and Solutions

### Issue 1: WebSocket Connection Fails

**Symptom**: `clients: 0` in block dev-server health check

**Causes:**
- Block dev-server not running
- Port 3001 blocked by firewall
- Browser security blocking WebSocket

**Debug:**
```bash
# Check if port 3001 is listening
lsof -i:3001

# Check for errors in browser console
# Look for: "WebSocket connection to 'ws://localhost:3001' failed"
```

**Fix:**
```bash
# Kill any process on port 3001
lsof -ti:3001 | xargs kill -9

# Restart block dev-server
just watch-blocks
```

### Issue 2: File Changes Not Detected

**Symptom**: Edit files but no rebuild triggered

**Causes:**
- File watcher not initialized (0 directories watched)
- Editing files outside watched directories
- File permissions issue

**Debug:**
```bash
# Check block dev-server startup logs for:
# "📂 Actively watching X directories" (X should be > 0)

# Test file watcher manually
touch blocks/d3-line-chart/src/LineChart.tsx

# Watch for "🔥 Block d3-line-chart source changed..."
```

**Fix:**
- Ensure editing files in `blocks/*/src/` directories
- Check file system permissions
- Restart block dev-server

### Issue 3: Build Fails

**Symptom**: Block rebuilds but changes not visible

**Causes:**
- Syntax errors in source code
- Missing dependencies
- TypeScript compilation errors

**Debug:**
```bash
# Build block manually to see errors
cd blocks/d3-line-chart
npm run build

# Check for error output
```

**Fix:**
1. Fix syntax errors in source files
2. Install missing dependencies: `npm install`
3. Check TypeScript configuration

### Issue 4: Browser Shows Old Code

**Symptom**: Build succeeds but browser shows old code

**Causes:**
- Browser cache not cleared
- Cache-busting not working
- Iframe not reloading

**Debug:**
```bash
# Check if dist/ was updated
ls -lh blocks/d3-line-chart/dist/index.js

# Check browser console for reload logs
# Should see: "Reloading iframe with cache-busting: ...?_reload=..."
```

**Fix:**
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache
3. Check WebSocket messages in Network tab
4. Verify `cache:invalidate` message received

### Issue 5: CORS Errors

**Symptom**: Browser console shows CORS errors

**Causes:**
- CORS headers not configured
- Servers restarted without CORS middleware

**Debug:**
```bash
# Check CORS headers on both servers
curl -I http://localhost:3001/healthz | grep -i access-control
curl -I http://localhost:PORT/healthz | grep -i access-control
```

**Fix:**
- Verify CORS middleware in both `blocks/src/server.ts` and `apps/blockprotocol-poc/src/server.ts`
- Restart both servers

### Issue 6: Port Conflicts

**Symptom**: Block dev-server won't start - "EADDRINUSE"

**Cause:** Port 3001 already in use

**Debug:**
```bash
# Find what's using port 3001
lsof -i:3001
```

**Fix:**
```bash
# Kill the process
lsof -ti:3001 | xargs kill -9

# Or kill all node processes (use with caution)
pkill -f "tsx.*server.ts"

# Restart
just watch-blocks
```

### Issue 7: Wrong Block Reloads

**Symptom**: Editing one block reloads a different block

**Cause:** BlockId mismatch or multiple blocks with same ID

**Debug:**
```bash
# Check blockId in cache:invalidate message
# Should match the block you edited

# In browser console, check:
# "Received cache:invalidate for blockId: <name>"
```

**Fix:**
- Ensure consistent block naming
- Check block metadata for correct IDs
- Verify no duplicate block IDs

## Testing Hot Reload End-to-End

### Complete Test Procedure

1. **Start both servers:**
   ```bash
   # Terminal 1: Block dev-server
   just watch-blocks
   
   # Terminal 2: POC server
   just dev-blockprotocol-poc-once
   ```

2. **Open browser:**
   - Navigate to `http://localhost:PORT/scenarios/d3-line-graph-example`
   - Open DevTools (F12) → Console tab

3. **Verify connections:**
   ```
   ✓ [Client] WebSocket connected
   ✓ [Client] Block dev-server WebSocket connected
   ```

4. **Make a visible change:**
   ```bash
   # Edit blocks/d3-line-chart/src/LineChart.tsx
   # Change a label or text that's visible in the UI
   ```

5. **Watch for logs:**
   - **Server**: `🔥 Block d3-line-chart source changed...`
   - **Server**: `✅ d3-line-chart rebuilt successfully`
   - **Browser**: `[Client] Received cache:invalidate for blockId: d3-line-chart`
   - **Browser**: `[Client] Reloading iframe with cache-busting...`

6. **Verify update:**
   - Block should reload automatically (~2-3 seconds)
   - Visual changes should be visible
   - No manual page refresh needed

### Quick Verification Commands

```bash
# Check if block dist/ was updated (timestamp should be recent)
ls -lh blocks/d3-line-chart/dist/index.js

# Check WebSocket connections (should be > 0)
curl -s http://localhost:3001/healthz | jq .clients

# Check both servers are healthy
curl -s http://localhost:3001/healthz | jq .status
curl -s http://localhost:PORT/healthz | jq .status
```

## Performance Benchmarks

**Normal Hot Reload Timing:**
- File change detection: ~100-300ms
- Block rebuild (Vite): 1-2 seconds
- WebSocket notification: <10ms
- Browser iframe reload: ~500ms
- **Total: 2-3 seconds** from save to visible update

**If slower than 5 seconds:**
- Check CPU usage (build may be slow)
- Check for TypeScript errors (slows build)
- Check for large dependencies (increases bundle time)

## Advanced Debugging

### Enable Verbose Logging

```bash
# Block dev-server with debug logs
DEBUG=* npm run dev-server

# Or set log level
LOG_LEVEL=debug npm run dev-server
```

### Monitor WebSocket Traffic

**In browser DevTools:**
1. Network tab → WS
2. Click on WebSocket connection
3. Messages tab shows all traffic

**Look for:**
- Outgoing: Connection requests
- Incoming: `cache:invalidate` messages

### Check File Watcher Status

```bash
# In block dev-server startup logs, look for:
📁 Will watch: color-picker/src
📁 Will watch: color-square/src
📁 Will watch: d3-line-chart/src
📁 Will watch: status-pill/src
✅ File watcher ready
📂 Actively watching 8 directories

# If "Watching 0 directories" - file watcher failed to initialize
```

### Inspect Block Metadata

```bash
# Check block's package.json
cat blocks/d3-line-chart/package.json | jq .

# Verify build script exists
cat blocks/d3-line-chart/package.json | jq .scripts.build
```

## Emergency Recovery

If hot reload completely broken:

```bash
# Kill all processes
pkill -f "tsx.*server"
lsof -ti:3001 | xargs kill -9

# Clean and rebuild
cd blocks
rm -rf */dist */node_modules/.vite
npm install
npm run build

# Restart everything
just watch-blocks
just dev-blockprotocol-poc-once
```

## Related Documentation

- **Hot-Reload-Configuration.md** - Architecture and setup reference
- **Hot-Reload-WORKING.md** - Implementation notes and success documentation
- **Block-Development-Guide.md** - General block development guide
