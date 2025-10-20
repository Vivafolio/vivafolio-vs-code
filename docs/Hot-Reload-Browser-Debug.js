// Hot Reload Browser Debugging Script
// Paste this into the browser console to monitor hot reload activity

console.log('🔥 Hot Reload Debugger Loaded');

// Monitor all WebSocket activity
const originalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
  console.log('🔌 WebSocket created:', url);
  const ws = new originalWebSocket(url, protocols);
  
  const originalSend = ws.send.bind(ws);
  ws.send = function(data) {
    console.log('📤 WebSocket send:', url, data);
    return originalSend(data);
  };
  
  ws.addEventListener('open', () => {
    console.log('✅ WebSocket open:', url);
  });
  
  ws.addEventListener('close', (e) => {
    console.log('🔴 WebSocket close:', url, 'Code:', e.code, 'Reason:', e.reason);
  });
  
  ws.addEventListener('error', (e) => {
    console.error('❌ WebSocket error:', url, e);
  });
  
  ws.addEventListener('message', (e) => {
    console.log('📨 WebSocket message:', url, e.data);
    try {
      const parsed = JSON.parse(e.data);
      if (parsed.type === 'cache:invalidate') {
        console.log('🔥 HOT RELOAD triggered for:', parsed.payload?.blockId);
      }
    } catch (err) {
      // Not JSON, ignore
    }
  });
  
  return ws;
};

// Test connection to block dev-server
console.log('🧪 Testing block dev-server connection...');
const testWs = new WebSocket('ws://localhost:3001');
testWs.addEventListener('open', () => {
  console.log('✅ Block dev-server connection test: SUCCESS');
  testWs.close();
});
testWs.addEventListener('error', (e) => {
  console.error('❌ Block dev-server connection test: FAILED', e);
});

// Monitor fetch requests for block resources
const originalFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string' && (url.includes('/blocks/') || url.includes('d3-line-chart'))) {
    console.log('🌐 Fetching block resource:', url);
  }
  return originalFetch(url, options);
};

console.log('✅ Hot Reload Debugger Active - watch this console for activity');
console.log('💡 Save a block file to trigger hot reload');
