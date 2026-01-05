// End-to-end LSP tests for Lean and Nim producing diagnostics that carry
// Vivafolio payloads in their message ("vivafolio: {...}").
//
// Usage: node test/e2e-lean-nim.js

const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs')

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------- Logging helpers ----------
function ensureLogsDir(repoRoot) {
  const dir = path.resolve(repoRoot, 'test', 'logs')
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

// --------- Lean ---------
function findLakeBinary(_repoRoot) { return 'lake' }

function startLeanLakeServe(repoRoot) {
  const cwd = path.resolve(repoRoot, 'test', 'projects', 'lean-basic')
  const lakeBin = findLakeBinary(repoRoot)
  const binDir = path.dirname(lakeBin)
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ''}`, LEAN_SERVER_LOG_DIR: path.join(repoRoot, '.lake', 'lsp-logs-vivafolio') }
  // Try multiple candidates for LEAN_SYSROOT so Lean can find core olean files
  const candidates = [
    path.resolve(repoRoot, 'lean4-experiments', 'build', 'release', 'stage1'),
    path.resolve(repoRoot, 'lean4-experiments', 'build', 'release-make', 'stage1'),
  ]
  try {
    const elanToolchains = path.join(process.env.HOME || '', '.elan', 'toolchains')
    for (const name of (fs.existsSync(elanToolchains) ? fs.readdirSync(elanToolchains) : [])) {
      const p = path.join(elanToolchains, name)
      try { if (fs.statSync(p).isDirectory()) candidates.push(p) } catch {}
    }
  } catch {}
  for (const c of candidates) {
    try {
      const leanOlean = path.join(c, 'lib', 'lean', 'Lean.olean')
      if (fs.existsSync(leanOlean)) { env.LEAN_SYSROOT = c; break }
    } catch {}
  }
  const proc = spawn(lakeBin, ['serve', '--'], { cwd, stdio: 'pipe', env })
  proc.on('error', (e) => { console.error('lake serve error:', e) })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'lean', repoRoot)
  return { conn, proc, cwd, logPath }
}

async function testLean(repoRoot) {
  const { conn, proc, cwd, logPath } = startLeanLakeServe(repoRoot)
  const warningPayload = 'vivafolio: { "viewstate": { "value": 7 }, "height": 120, "origin": "warn" }'
  const errorPayload = 'vivafolio: { "viewstate": { "value": 8 }, "height": 180, "origin": "error" }'
  const absPath = path.join(cwd, 'TestEmit.lean')
  const fileUri = String(pathToFileURL(absPath))
  const content = fs.readFileSync(absPath, 'utf8')
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})

    await conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri: fileUri, languageId: 'lean4', version: 1, text: content }
    })
    // Trigger analysis with explicit change/save for reliability across servers
    await conn.sendNotification('textDocument/didChange', {
      textDocument: { uri: fileUri, version: 2 },
      contentChanges: [{ text: content }]
    })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri } })

    const diagState = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`Lean: timed out waiting for vivafolio diagnostic. See log: ${logPath}`)), 60000)
      const state = { warn: null, error: null }
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          try { console.log('[lean diags]', JSON.stringify(p)) } catch {}
          try { fs.appendFileSync(logPath, `[diag] ${JSON.stringify(p)}\n`) } catch {}
          if (p?.uri !== fileUri) { return }
          const diags = Array.isArray(p?.diagnostics) ? p.diagnostics : []
          for (const d of diags) {
            const msg = String(d?.message || '')
            if (msg.includes(warningPayload)) state.warn = d
            if (msg.includes(errorPayload)) state.error = d
          }
          if (state.warn && state.error) { clearTimeout(to); resolve(state) }
        } catch {}
      })
    })
    assert.ok(diagState.warn, 'expected warning diagnostic containing vivafolio payload')
    assert.ok(diagState.error, 'expected error diagnostic containing vivafolio payload')
    assert.strictEqual(diagState.warn.severity, 2, 'warning diagnostic should have severity 2')
    assert.strictEqual(diagState.error.severity, 1, 'error diagnostic should have severity 1')
    assert.strictEqual(diagState.warn.source, 'Lean 4', 'warning diagnostic should be sourced from Lean 4')
    assert.strictEqual(diagState.error.source, 'Lean 4', 'error diagnostic should be sourced from Lean 4')
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// --------- Nim ---------
function startNimLangServer(cwd, repoRoot) {
  const proc = spawn('nimlangserver', [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'nim', repoRoot)
  return { conn, proc, logPath }
}

async function testNim(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'fixtures', 'nim')
  const filePath = path.join(fixtureDir, 'sample.nim')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startNimLangServer(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: String(pathToFileURL(fixtureDir)), workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    await wait(300)
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri: fileUri, languageId: 'nim', version: 1, text }
    })

    const got = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`Nim: timed out waiting for vivafolio diagnostic. See log: ${logPath}`)), 45000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          // Log all diagnostics for debugging
          try { console.log('[nim diags]', JSON.stringify(p)) } catch {}
          try { fs.appendFileSync(logPath, `[diag] ${JSON.stringify(p)}\n`) } catch {}
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

async function run() {
  const repoRoot = path.resolve(__dirname, '..')
  await testLean(repoRoot)
  await testNim(repoRoot)
}

run().catch(err => { console.error(err); process.exit(1) })
