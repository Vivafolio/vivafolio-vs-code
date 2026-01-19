#!/usr/bin/env node

/**
 * Test script to validate LSP server sends diagnostics on didOpen
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const rpc = require('vscode-jsonrpc/node')

// Test file content
const testContent = `// Vivafolio test file
vivafolio_picker!() gui_state! r#"{"properties":{"color":"#ff0000"}}"#
vivafolio_square!()`

const testFile = path.join(__dirname, 'projects', 'vivafolioblock-test', 'lsp-test.mocklang')
const mockLspServer = path.join(__dirname, 'mock-lsp-server.js')

console.log('🧪 Testing LSP Server didOpen Diagnostics')
console.log('=========================================')

// Create test file
fs.writeFileSync(testFile, testContent, 'utf8')
console.log('✅ Created test file:', testFile)

function startServer() {
  const proc = spawn('node', [mockLspServer], { stdio: 'pipe' })
  const connection = rpc.createMessageConnection(
    new rpc.StreamMessageReader(proc.stdout),
    new rpc.StreamMessageWriter(proc.stdin)
  )
  connection.listen()
  return { proc, connection }
}

async function waitForDiagnostics(connection, uri, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for diagnostics')), timeoutMs)
    connection.onNotification('textDocument/publishDiagnostics', (params) => {
      if (params.uri === uri) {
        clearTimeout(timer)
        resolve(params)
      }
    })
  })
}

async function run() {
  const { proc, connection } = startServer()
  try {
    console.log('🚀 Starting LSP server...')

    const initResult = await connection.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${__dirname}`,
      capabilities: {}
    })
    if (!initResult || !initResult.serverInfo) {
      throw new Error('Initialize response missing serverInfo')
    }
    console.log('✅ Initialize response received from', initResult.serverInfo.name)

    await connection.sendNotification('initialized', {})
    console.log('✅ Initialized notification sent')

    const uri = `file://${testFile}`
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'mocklang',
        version: 1,
        text: testContent
      }
    })
    console.log('📤 didOpen notification sent')

    const diagnostics = await waitForDiagnostics(connection, uri)
    if (!diagnostics || !Array.isArray(diagnostics.diagnostics) || diagnostics.diagnostics.length === 0) {
      throw new Error('No diagnostics received for test file')
    }

    console.log(`✅ Received ${diagnostics.diagnostics.length} diagnostics for ${uri}`)
    diagnostics.diagnostics.forEach((diag, idx) => {
      console.log(`   Diagnostic #${idx + 1}: severity=${diag.severity} source=${diag.source}`)
    })

    console.log('\n🎉 SUCCESS: didOpen diagnostics flow verified end-to-end')
  } finally {
    try { connection.dispose() } catch {}
    try { proc.kill() } catch {}
    try { fs.unlinkSync(testFile) } catch {}
  }
}

run().catch((err) => {
  console.error('❌ LSP didOpen test failed:', err && err.stack ? err.stack : String(err))
  process.exitCode = 1
})
