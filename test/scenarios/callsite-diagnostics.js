// Scenario: callsite-diagnostics
// Goal: Trigger diagnostics at the call-site of user-defined symbols, where
// the diagnostic-producing symbol is defined in one module and used in another.

const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs')
const { execSync } = require('child_process')

// --- Utility: command existence + assertion (mirrors basic-comms for consistency) ---
function commandExists(cmd) {
  try {
    const pathSep = process.platform === 'win32' ? ';' : ':'
    const exts = process.platform === 'win32' ? (process.env.PATHEXT || '').toLowerCase().split(';') : ['']
    const entries = String(process.env.PATH || '').split(pathSep)
    for (const dir of entries) {
      const base = path.join(dir, cmd)
      for (const ext of exts) {
        const p = base + ext
        try { const st = fs.statSync(p); if (st.isFile()) return true } catch {}
      }
    }
  } catch {}
  return false
}
function assertCommandExists(label, cmd) {
  if (!commandExists(cmd)) throw new Error(`[${label}] missing required binary: ${cmd}`)
}
function resolveBinary(cmd) { try { return execSync(`command -v ${cmd}`, { encoding: 'utf8' }).trim() } catch { return cmd } }

// Ensures the test/logs directory exists under the repository root and returns its absolute path.
function ensureLogsDir(repoRoot) {
  const dir = path.resolve(repoRoot, 'test', 'logs')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}
// Creates a timestamped log file in the logs directory and returns an object with logPath, log (function), and stream.
function createLogger(repoRoot, label) {
  const dir = ensureLogsDir(repoRoot)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(dir, `${label}-${ts}.log`)
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  const log = (msg) => { try { stream.write(`[${new Date().toISOString()}] ${msg}\n`) } catch {} }
  return { logPath, log, stream }
}
// Wraps a spawned process with a JSON-RPC connection and logs stderr, errors, and trace output to a file.
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
  return { conn, logPath }
}

// Returns a Promise that resolves after the given number of milliseconds (sleep helper).
function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------- Lean ----------
// Returns the name of the Lean build tool binary ('lake').
function findLakeBinary(_repoRoot) { return 'lake' }
// Starts the Lean 'lake serve' process in the lean-basic project, asserts presence, and returns its connection and log info.
function startLeanLakeServe(repoRoot) {
  assertCommandExists('callsite-lean', 'lake')
  // NOTE: Paths previously included an extra 'vivafolio' segment causing nonexistent cwd and early server exit.
  const cwd = path.resolve(repoRoot, 'test', 'projects', 'lean-callsite')
  const lakeBin = findLakeBinary(repoRoot)
  const binDir = path.dirname(lakeBin)
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ''}` }
  const proc = spawn(lakeBin, ['serve', '--'], { cwd, stdio: 'pipe', env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'callsite-lean', repoRoot)
  return { conn, proc, cwd, logPath }
}
async function testLean(repoRoot) {
  const { conn, proc, cwd, logPath } = startLeanLakeServe(repoRoot)
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    await wait(200)
    const absPath = path.join(cwd, 'Call.lean')
    const fileUri = String(pathToFileURL(absPath))
    const content = fs.readFileSync(absPath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'lean4', version: 1, text: content } })
    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          if (p && p.uri === fileUri && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) { clearTimeout(to); resolve(true) }
        } catch {}
      })
    })
    return { ok, logPath }
  } catch (err) {
    try { fs.appendFileSync(logPath, `[error] ${err && err.stack ? err.stack : String(err)}\n`) } catch {}
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- Nim ----------
// Launches a Nim language server process and sets up logging and communication for it.
// cwd - server working directory
// repoRoot - repository root for log file placement
// serverCmd - command to launch the Nim language server (e.g., 'nimlsp' or 'nimlangserver')
function startNimLangServer(cwd, repoRoot, serverCmd) {
  const cmd = serverCmd || process.env.VIVAFOLIO_NIM_LSP || process.env.NIM_LSP || 'nimlsp'
  assertCommandExists(`callsite-nim-${cmd}`, cmd)
  const proc = spawn(cmd, [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, `callsite-nim-${cmd}`, repoRoot)
  return { conn, proc, logPath }
}
async function testNim(repoRoot, serverCmd) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'nim-callsite')
  const filePath = path.join(fixtureDir, 'src', 'use_bad.nim')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startNimLangServer(fixtureDir, repoRoot, serverCmd)
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: { workspace: { configuration: true } }, rootUri: String(pathToFileURL(fixtureDir)), workspaceFolders: null })
    await conn.sendNotification('initialized', {})
  if ((serverCmd || 'nimlsp') === 'nimlsp') {
      try {
        await conn.sendNotification('workspace/didChangeConfiguration', {
          settings: { nim: { projectMapping: [{ projectFile: 'nim-callsite.nimble', fileRegex: '.*' }] } }
        })
      } catch {}
    }
  await wait(400) // give language server (and nimsuggest processes) more time to spin up
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'nim', version: 1, text } })
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text }] })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 2 }, text })
    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          if (p && p.uri === fileUri && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) { clearTimeout(to); resolve(true) }
        } catch {}
      })
    })
    return { ok, logPath, server: serverCmd || 'nimlsp' }
  } catch (err) {
    return { ok: false, logPath, error: err, server: serverCmd || 'nimlsp' }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- D ----------
function startServeD(cwd, repoRoot) {
  assertCommandExists('callsite-d', 'serve-d')
  const proc = spawn('serve-d', [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'callsite-d', repoRoot)
  conn.onRequest('workspace/configuration', (params) => {
    try {
      return (params.items || []).map(() => ({
        dcdClientPath: '',
        dcdServerPath: '',
        useDCDClient: false,
        enableAutoComplete: true,
        enableLinting: true
      }))
    } catch { return [] }
  })
  return { conn, proc, logPath }
}
async function testD(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'd-callsite')
  const filePath = path.join(fixtureDir, 'source', 'use_bad.d')
  const fileUri = String(pathToFileURL(filePath))
  const projectUri = String(pathToFileURL(fixtureDir))
  const { conn, proc, logPath } = startServeD(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: { workspace: { configuration: true } },
      rootUri: projectUri,
      workspaceFolders: [{ uri: projectUri, name: 'd-callsite' }]
    })
    await conn.sendNotification('initialized', {})
    await conn.sendNotification('workspace/didChangeConfiguration', { settings: {
      dcdClientPath: '', dcdServerPath: '', useDCDClient: false,
      d: { dcd: { clientPath: '', serverPath: '', useClient: false } },
      'd.dcd': { clientPath: '', serverPath: '', useClient: false }
    } })
    await wait(200)
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'd', version: 1, text } })
    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          if (p && p.uri && p.uri.startsWith(projectUri) && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) { clearTimeout(to); resolve(true) }
        } catch {}
      })
    })
    return { ok, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- Rust ----------
function startRustAnalyzer(cwd, repoRoot) {
  assertCommandExists('callsite-rust', 'rust-analyzer')
  const proc = spawn('rust-analyzer', [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'callsite-rust', repoRoot)
  return { conn, proc, logPath }
}
async function testRust(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'rust-callsite')
  const filePath = path.join(fixtureDir, 'src', 'use_bad.rs')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startRustAnalyzer(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: String(pathToFileURL(fixtureDir)), workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    await wait(200)
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'rust', version: 1, text } })
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text }] })
    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          if (p && p.uri === fileUri && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) { clearTimeout(to); resolve(true) }
        } catch {}
      })
    })
    return { ok, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- Zig ----------
function startZls(cwd, repoRoot) {
  const env = { ...process.env }
  assertCommandExists('callsite-zig', 'zls')
  const proc = spawn('zls', ['--enable-stderr-logs', '--log-level', 'debug'], { cwd, stdio: 'pipe', env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'callsite-zig', repoRoot)
  return { conn, proc, logPath }
}
async function testZig(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'zig-callsite')
  const filePath = path.join(fixtureDir, 'src', 'use_bad.zig')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startZls(fixtureDir, repoRoot)
  try {
    const absZig = resolveBinary('zig')
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: {},
      rootUri: String(pathToFileURL(fixtureDir)),
      workspaceFolders: [{ uri: String(pathToFileURL(fixtureDir)), name: 'zig-callsite' }],
      initializationOptions: {
        enable_build_on_save: true,
        zig_exe_path: absZig
      }
    })
    await conn.sendNotification('initialized', {})
    const text = fs.readFileSync(filePath, 'utf8')
    const diagPromise = new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          if (p && p.uri === fileUri && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) { clearTimeout(to); resolve(true) }
        } catch {}
      })
    })
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'zig', version: 1, text } })
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text }] })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 2 }, text })
    const ok = await diagPromise
    return { ok, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- Crystal ----------
function startCrystalline(cwd, repoRoot) {
  assertCommandExists('callsite-crystal', 'crystalline')
  const proc = spawn('crystalline', [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'callsite-crystal', repoRoot)
  return { conn, proc, logPath }
}
async function testCrystal(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'crystal-callsite')
  const filePath = path.join(fixtureDir, 'src', 'use_bad.cr')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startCrystalline(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true } } },
      rootUri: String(pathToFileURL(fixtureDir)),
      workspaceFolders: [{ uri: String(pathToFileURL(fixtureDir)), name: 'crystal-callsite' }]
    })
    await conn.sendNotification('initialized', {})
    await wait(300)
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'crystal', version: 1, text } })
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text }] })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 2 }, text })
    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          if (p && p.uri && p.uri.includes('crystal-callsite') && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) { clearTimeout(to); resolve(true) }
        } catch {}
      })
    })
    return { ok, logPath }
  } catch (err) {
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

async function run() {
  // repoRoot previously pointed one directory too high relative to scenario location; adjust to project root.
  const repoRoot = path.resolve(__dirname, '..', '..')
  const results = []
  results.push({ name: 'Lean (callsite)', ...(await testLean(repoRoot)) })
  results.push({ name: 'Nim (callsite, nimlsp)', ...(await testNim(repoRoot, 'nimlsp')) })
  results.push({ name: 'Nim (callsite, nimlangserver)', ...(await testNim(repoRoot, 'nimlangserver')) })
  results.push({ name: 'D (callsite)', ...(await testD(repoRoot)) })
  results.push({ name: 'Rust (callsite)', ...(await testRust(repoRoot)) })
  results.push({ name: 'Zig (callsite)', ...(await testZig(repoRoot)) })
  results.push({ name: 'Crystal (callsite)', ...(await testCrystal(repoRoot)) })

  const failures = results.filter(r => !r.ok)
  if (failures.length === 0) {
    console.log('callsite-diagnostics OK for all languages tested')
    process.exit(0)
  } else {
    for (const f of failures) {
      let size = 0
      try { size = fs.statSync(f.logPath).size } catch {}
      console.error(`${f.name} failed. See log: ${f.logPath} (${size} bytes)`) 
    }
    process.exit(1)
  }
}

run().catch(err => { console.error(err); process.exit(1) })
