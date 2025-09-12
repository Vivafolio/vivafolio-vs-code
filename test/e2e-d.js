// End-to-end LSP test for D using serve-d.
// Ensures a diagnostic with a Vivafolio payload is observed.

const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs')

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
  const log = (msg) => { try { stream.write(`[${new Date().toISOString()}] ${msg}\n`) } catch {} }
  return { logPath, log, stream }
}
function makeConnectionWithLogging(proc, label, repoRoot) {
  const { logPath, log } = createLogger(repoRoot, label)
  log(`[spawn] ${label} pid=${proc.pid}`)
  try {
    proc.stderr.on('data', d => { const s = String(d || '').trim(); if (s) log(`[stderr] ${s}`) })
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
  return { conn, logPath }
}

function startServeD(cwd, repoRoot) {
  const proc = spawn('serve-d', [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'd', repoRoot)
  return { conn, proc, logPath }
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const fixtureDir = path.resolve(repoRoot, 'vivafolio', 'test', 'fixtures', 'd')
  const filePath = path.join(fixtureDir, 'source', 'app.d')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startServeD(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: String(pathToFileURL(fixtureDir)), workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'd', version: 1, text } })
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text }] })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri } })
    const got = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`D: timed out waiting for vivafolio diagnostic. See log: ${logPath}`)), 90000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          const diags = Array.isArray(p?.diagnostics) ? p.diagnostics : []
          if (diags.some(d => String(d.message || '').includes('vivafolio:'))) { clearTimeout(to); resolve(true) }
        } catch {}
      })
    })
    assert.strictEqual(got, true)
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

run().catch(err => { console.error(err); process.exit(1) })


