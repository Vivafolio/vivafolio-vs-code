// Minimal stub LSP server that publishes a single vivafolio Hint diagnostic
// for any file opened via didOpen. Intended for deterministic E2E tests.

const rpc = require('vscode-jsonrpc/node')

const connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(process.stdin),
  new rpc.StreamMessageWriter(process.stdout)
)

let initialized = false

connection.onRequest('initialize', (params) => {
  initialized = true
  return {
    capabilities: { textDocumentSync: 1 },
    serverInfo: { name: 'vivafolio-stub', version: '0.1' }
  }
})

connection.onNotification('initialized', () => {})

connection.onNotification('textDocument/didOpen', (p) => {
  if (!initialized) return
  try {
    const doc = p?.textDocument
    if (!doc?.uri) return
    const payload = {
      viewstate: { value: 42 },
      height: 120
    }
    const message = 'vivafolio: ' + JSON.stringify(payload)
    connection.sendNotification('textDocument/publishDiagnostics', {
      uri: doc.uri,
      version: doc.version || 1,
      diagnostics: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          severity: 4, // Hint
          source: 'vivafolio-stub',
          message
        }
      ]
    })
  } catch {}
})

connection.listen()






