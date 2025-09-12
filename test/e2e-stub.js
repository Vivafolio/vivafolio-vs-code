const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')

function ensureLogsDir(repoRoot) {
  const dir = path.resolve(repoRoot, 'vivafolio', 'test', 'logs')
  try { require('fs').mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}
function createLogger(repoRoot, label) {
  const fs = require('fs')
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
function startStub(cwd, repoRoot) {
  const proc = spawn('node', ['test/stub-lsp.js'], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'stub', repoRoot)
  return { conn, proc, logPath }
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const cwd = repoRoot
  const { conn, proc, logPath } = startStub(cwd, repoRoot)
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: String(pathToFileURL(cwd)), workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    const uri = String(pathToFileURL(path.join(cwd, 'README.md')))
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'markdown', version: 1, text: '# test' } })
    const got = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`Stub: timed out waiting for vivafolio diagnostic. See log: ${logPath}`)), 10000)
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




