// LSP Client Test for Mock LSP Server
// Verifies that the mock LSP server behaves correctly when connected as an LSP client.
// Tests the full protocol flow and vivafolio-specific diagnostic generation.

const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs')

// ---------- Logging helpers ----------
function ensureLogsDir(repoRoot) {
  const dir = path.resolve(repoRoot, 'vivafolio', 'test', 'logs')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}
function createLogger(repoRoot, label) {
  const dir = ensureLogsDir(repoRoot)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(dir, `${label}-${ts}.log`)
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  const log = (msg) => {
    try { stream.write(`[${new Date().toISOString()}] ${msg}\n`) } catch {}
  }
  return { logPath, log, stream }
}
function makeConnectionWithLogging(proc, label, repoRoot) {
  const { logPath, log } = createLogger(repoRoot, label)
  log(`[spawn] ${label} pid=${proc.pid}`)
  try {
    proc.stderr.on('data', d => { const s = String(d || '').trim(); if (s) log(`[stderr] ${s}`) })
    proc.on('error', err => { try { log(`[proc-error] ${err && err.stack ? err.stack : String(err)}`) } catch {} })
    proc.on('exit', (code, sig) => { log(`[exit] code=${code} signal=${sig || ''}`) })
  } catch {}
  const conn = rpc.createMessageConnection(
    new rpc.StreamMessageReader(proc.stdout),
    new rpc.StreamMessageWriter(proc.stdin),
    { error: (m) => log(`[error] ${m}`), warn: (m) => log(`[warn] ${m}`), info: (m) => log(`[info] ${m}`), log: (m) => log(`[log] ${m}`) }
  )
  conn.trace(rpc.Trace.Messages, { log: (m, data) => {
    try { const extra = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : ''
      log(`[trace] ${m}${extra ? `\n${extra}` : ''}`)
    } catch {}
  } })
  conn.listen()
  return { conn, logPath, log }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------- Mock LSP Server Test ----------
function startMockLSPServer(repoRoot) {
  const serverPath = path.resolve(repoRoot, 'test', 'mock-lsp-server.js')
  // Optional inspector support: set VIVAFOLIO_LSP_INSPECT to '1' or 'brk' to enable, use VIVAFOLIO_LSP_INSPECT_PORT to override port
  const inspectMode = String(process.env.VIVAFOLIO_LSP_INSPECT || '').toLowerCase()
  const inspectPort = String(process.env.VIVAFOLIO_LSP_INSPECT_PORT || '').trim() || '9229'
  const nodeArgs = []
  if (inspectMode === '1' || inspectMode === 'true') nodeArgs.push(`--inspect=${inspectPort}`)
  else if (inspectMode === 'brk' || inspectMode === 'break') nodeArgs.push(`--inspect-brk=${inspectPort}`)
  const proc = spawn('node', [...nodeArgs, serverPath], { cwd: process.cwd(), stdio: 'pipe', env: process.env })
  const { conn, logPath, log } = makeConnectionWithLogging(proc, 'mock-lsp-client-test', repoRoot)
  return { conn, proc, logPath, log }
}

async function testBasicLSPProtocol(repoRoot) {
  const { conn, proc, logPath, log } = startMockLSPServer(repoRoot)
  try {
    log('Sending initialize request...')
    // Test initialize request with timeout
    const initResult = await Promise.race([
      conn.sendRequest('initialize', {
        processId: null,
        capabilities: {},
        rootUri: null,
        workspaceFolders: null
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Initialize request timeout')), 5000))
    ])
    log('Received initialize response')

    assert(initResult, 'Initialize should return a result')
    assert.equal(initResult.serverInfo.name, 'vivafolio-mock-language', 'Server name should match')
    assert.equal(initResult.serverInfo.version, '0.1', 'Server version should match')
    assert.equal(initResult.capabilities.textDocumentSync, 1, 'Should support full text document sync')

    // Test initialized notification
    await conn.sendNotification('initialized', {})

    log('Basic LSP protocol test passed')
    return { ok: true, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

async function testVivafolioBlockDiagnostics(repoRoot) {
  const { conn, proc, logPath, log } = startMockLSPServer(repoRoot)
  try {
    // Initialize
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})

    // Test file with vivafolio_block!()
    const testFileUri = 'file:///test/main.viv'
    const testContent = `// Test file
vivafolio_block!("test-entity-123")

// Some other code
fn main() {
    println!("Hello from mock language!");
}

// Another block
vivafolio_block!("test-entity-456")`

    // Send didOpen
    await conn.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: testFileUri,
        languageId: 'vivafolio-mock',
        version: 1,
        text: testContent
      }
    })

    // Wait for diagnostics
    const diagnostics = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for diagnostics')), 5000)
      const received = []

      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        try {
          log(`Received diagnostics: ${JSON.stringify(params)}`)
          received.push(params)

          // Check if we have diagnostics for our test file
          const ourDiags = received.filter(p => p.uri === testFileUri)
          if (ourDiags.length > 0 && ourDiags[0].diagnostics && ourDiags[0].diagnostics.length >= 2) {
            clearTimeout(timeout)
            resolve(ourDiags[0])
          }
        } catch (err) {
          log(`Error processing diagnostics: ${err}`)
        }
      })
    })

    // Verify diagnostics
    assert(diagnostics.uri === testFileUri, 'Diagnostics should be for our test file')
    assert(Array.isArray(diagnostics.diagnostics), 'Diagnostics should be an array')
    assert.equal(diagnostics.diagnostics.length, 2, 'Should have 2 diagnostics for 2 blocks')

    // Check first diagnostic
    const diag1 = diagnostics.diagnostics[0]
    assert.equal(diag1.severity, 4, 'Should be Hint severity')
    assert.equal(diag1.source, 'vivafolio-mock-language', 'Source should match')
    assert(diag1.message.startsWith('vivafolio: '), 'Message should start with vivafolio prefix')

    // Parse the payload
    const payload1 = JSON.parse(diag1.message.substring('vivafolio: '.length))
    assert(payload1.blockId, 'Should have blockId')
    assert(payload1.entityId, 'Should have entityId')
    assert(payload1.initialGraph, 'Should have initialGraph')
    assert(payload1.resources, 'Should have resources')
    assert.equal(payload1.displayMode, 'multi-line', 'Should have correct display mode')

    // Check second diagnostic
    const diag2 = diagnostics.diagnostics[1]
    const payload2 = JSON.parse(diag2.message.substring('vivafolio: '.length))
    assert(payload2.blockId !== payload1.blockId, 'Blocks should have different IDs')

    log('Vivafolio block diagnostics test passed')
    return { ok: true, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

async function testColorPickerAndSquare(repoRoot) {
  const { conn, proc, logPath, log } = startMockLSPServer(repoRoot)
  try {
    // Initialize
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})

    // Test file with color picker and square
    const testFileUri = 'file:///test/color-test.viv'
    const testContent = `// Color picker with state
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#ff0000" } }"#
// Color square
vivafolio_square!()`

    // Send didOpen
    await conn.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: testFileUri,
        languageId: 'vivafolio-mock',
        version: 1,
        text: testContent
      }
    })

    // Wait for diagnostics
    const diagnostics = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for color diagnostics')), 5000)
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        try {
          if (params.uri === testFileUri && params.diagnostics && params.diagnostics.length >= 2) {
            clearTimeout(timeout)
            resolve(params)
          }
        } catch (err) {
          log(`Error processing color diagnostics: ${err}`)
        }
      })
    })

    // Verify diagnostics
    assert.equal(diagnostics.diagnostics.length, 2, 'Should have 2 diagnostics')

    // Find picker and square diagnostics
    const pickerDiag = diagnostics.diagnostics.find(d => {
      const payload = JSON.parse(d.message.substring('vivafolio: '.length))
      return payload.initialGraph.entities[0].properties.color === '#ff0000'
    })
    const squareDiag = diagnostics.diagnostics.find(d => {
      const payload = JSON.parse(d.message.substring('vivafolio: '.length))
      return payload.initialGraph.entities[0].properties.color === '#ff0000'
    })

    assert(pickerDiag, 'Should have picker diagnostic')
    assert(squareDiag, 'Should have square diagnostic')

    log('Color picker and square test passed')
    return { ok: true, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

async function testDiagnosticUpdates(repoRoot) {
  const { conn, proc, logPath, log } = startMockLSPServer(repoRoot)
  try {
    // Initialize
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})

    const testFileUri = 'file:///test/update-test.viv'

    // Initial content with blocks
    const initialContent = `vivafolio_block!("initial-entity")
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#0000ff" } }"#`

    await conn.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: testFileUri,
        languageId: 'vivafolio-mock',
        version: 1,
        text: initialContent
      }
    })

    // Wait for initial diagnostics
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for initial diagnostics')), 5000)
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        if (params.uri === testFileUri && params.diagnostics && params.diagnostics.length >= 2) {
          clearTimeout(timeout)
          resolve(params)
        }
      })
    })

    // Update content - change color and remove one block
    // This tests that the server sends the COMPLETE current state, not incremental updates
    const updatedContent = `vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#00ff00" } }"#`

    await conn.sendNotification('textDocument/didChange', {
      textDocument: { uri: testFileUri, version: 2 },
      contentChanges: [{ text: updatedContent }]
    })

    // Wait for updated diagnostics
    const updatedDiagnostics = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for updated diagnostics')), 5000)
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        if (params.uri === testFileUri) {
          clearTimeout(timeout)
          resolve(params)
        }
      })
    })

    // Verify updated diagnostics - should be exactly 1 (not 2) proving complete state semantics
    assert.equal(updatedDiagnostics.diagnostics.length, 1, 'Should have only 1 diagnostic after update (complete state, not incremental)')

    const payload = JSON.parse(updatedDiagnostics.diagnostics[0].message.substring('vivafolio: '.length))
    assert.equal(payload.initialGraph.entities[0].properties.color, '#00ff00', 'Color should be updated')

    log('Diagnostic updates test passed')
    return { ok: true, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

async function testDiagnosticClearing(repoRoot) {
  const { conn, proc, logPath, log } = startMockLSPServer(repoRoot)
  try {
    // Initialize
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})

    const testFileUri = 'file:///test/clear-test.viv'

    // Content with blocks - tests complete state semantics when blocks are removed
    const contentWithBlocks = `vivafolio_block!("test-entity")`

    await conn.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: testFileUri,
        languageId: 'vivafolio-mock',
        version: 1,
        text: contentWithBlocks
      }
    })

    // Wait for diagnostics
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for initial diagnostics')), 5000)
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        if (params.uri === testFileUri && params.diagnostics && params.diagnostics.length > 0) {
          clearTimeout(timeout)
          resolve(params)
        }
      })
    })

    // Update content to remove blocks
    const contentWithoutBlocks = `// Just regular code
fn main() {
    println!("No vivafolio blocks here!");
}`

    await conn.sendNotification('textDocument/didChange', {
      textDocument: { uri: testFileUri, version: 2 },
      contentChanges: [{ text: contentWithoutBlocks }]
    })

    // Wait for cleared diagnostics
    const clearedDiagnostics = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for cleared diagnostics')), 5000)
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        if (params.uri === testFileUri) {
          clearTimeout(timeout)
          resolve(params)
        }
      })
    })

    // Verify diagnostics are cleared - server sends empty array for complete state when no blocks exist
    assert.equal(clearedDiagnostics.diagnostics.length, 0, 'Diagnostics should be cleared when blocks are removed (complete state semantics)')

    log('Diagnostic clearing test passed')
    return { ok: true, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

async function runMockLSPClientTests() {
  const repoRoot = path.resolve(__dirname, '..')
  const results = []

  console.log('Running Mock LSP Client Tests...')

  // Test basic LSP protocol
  console.log('Testing basic LSP protocol...')
  results.push({ name: 'Basic LSP Protocol', ...(await testBasicLSPProtocol(repoRoot)) })

  // Test vivafolio block diagnostics
  console.log('Testing vivafolio block diagnostics...')
  results.push({ name: 'Vivafolio Block Diagnostics', ...(await testVivafolioBlockDiagnostics(repoRoot)) })

  // Test color picker and square
  console.log('Testing color picker and square...')
  results.push({ name: 'Color Picker and Square', ...(await testColorPickerAndSquare(repoRoot)) })

  // Test diagnostic updates
  console.log('Testing diagnostic updates...')
  results.push({ name: 'Diagnostic Updates', ...(await testDiagnosticUpdates(repoRoot)) })

  // Test diagnostic clearing
  console.log('Testing diagnostic clearing...')
  results.push({ name: 'Diagnostic Clearing', ...(await testDiagnosticClearing(repoRoot)) })

  const failures = results.filter(r => !r.ok)
  if (failures.length === 0) {
    console.log('All Mock LSP Client tests passed!')
    process.exit(0)
  } else {
    console.error('Mock LSP Client test failures:')
    for (const f of failures) {
      let size = 0
      try { size = fs.statSync(f.logPath).size } catch {}
      console.error(`  ${f.name} failed. See log: ${f.logPath} (${size} bytes)`)
      if (f.error) {
        console.error(`    Error: ${f.error.message}`)
      }
    }
    process.exit(1)
  }
}

if (require.main === module) {
  runMockLSPClientTests().catch(err => {
    console.error('Test runner error:', err)
    process.exit(1)
  })
}

module.exports = {
  testBasicLSPProtocol,
  testVivafolioBlockDiagnostics,
  testColorPickerAndSquare,
  testDiagnosticUpdates,
  testDiagnosticClearing
}
