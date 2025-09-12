// Connectivity tests expectations:
// - These tests create tiny, language-native programs that emit a standard hint/warning diagnostic.
// - They MUST rely on standard, unpatched language servers and compilers; no custom notification paths.
// - Each language is exercised using its common LSP server(s); where multiple servers exist, we intend to test all combos.
// - Tests should use minimal standalone test projects (with package/build files) so servers can analyze and emit diagnostics.
// - Passing criteria: at least one diagnostic is published (for connectivity), or a diagnostic whose message contains
//   a language-native “hint”/“warning” payload for the richer tests.

// Basic LSP connectivity tests: create a file with a deliberate syntax error
// and verify that the LSP server produces diagnostics.

const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn, execSync } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs')

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
function assertCommandExists(repoRoot, label, cmd) {
  if (!commandExists(cmd)) {
    const { logPath, log } = createLogger(repoRoot, `${label}-missing-${cmd}`)
    log(`[error] Missing required binary: ${cmd}`)
    log(`[hint] Run tests via 'just …' or inside 'nix develop' so the dev shell provides ${cmd}`)
    const e = new Error(`Missing required binary: ${cmd}`)
    e.logPath = logPath
    throw e
  }
}
function resolveBinary(cmd) {
  try { return execSync(`command -v ${cmd}`, { encoding: 'utf8' }).trim() } catch { return cmd }
}

// ---------- Lean ----------
function findLakeBinary(_repoRoot) { return 'lake' }

function startLeanLakeServe(repoRoot) {
  const cwd = path.resolve(repoRoot, 'test', 'projects', 'lean-basic')
  assertCommandExists(repoRoot, 'lean-connectivity', 'lake')
  const lakeBin = resolveBinary(findLakeBinary(repoRoot))
  const binDir = path.dirname(lakeBin)
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ''}` }
  const proc = spawn(lakeBin, ['serve', '--'], { cwd, stdio: 'pipe', env })
  proc.on('error', (e) => { console.error('lake serve error:', e) })
  const { conn, logPath, log } = makeConnectionWithLogging(proc, 'lean-connectivity', repoRoot)
  return { conn, proc, cwd, logPath, log }
}

async function testLeanConnectivity(repoRoot) {
  const started = startLeanLakeServe(repoRoot)
  if (!started || started.conn === null || started.skipped) {
    return { ok: true, logPath: started?.logPath, skipped: true }
  }
  const { conn, proc, cwd, logPath, log } = started
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    await wait(200)

    const absPath = path.join(cwd, 'Basic.lean')
    const fileUri = String(pathToFileURL(absPath))
    const content = 'import Lean\nopen Lean Elab Command\nsyntax (name := emitWarn) "#emit_warn " str : command\n@[command_elab emitWarn] def elabEmitWarn : CommandElab := fun stx => do match stx with | `(command| #emit_warn $s:str) => Lean.logWarning (.ofFormat (format s.getString)) | _ => throwError "invalid"\n#emit_warn "hello from connectivity"\n'
    try { fs.writeFileSync(absPath, content, 'utf8') } catch {}
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'lean4', version: 1, text: content } })

    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          try { log(`[diag] ${JSON.stringify(p)}`) } catch {}
          if (p && p.uri === fileUri && Array.isArray(p.diagnostics) && p.diagnostics.some(d => String(d.message || '').includes('hello from connectivity'))) { clearTimeout(to); resolve(true) }
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

// ---------- Nim ----------
function startNimLangServer(cwd, repoRoot, serverCmd) {
  const cmd = serverCmd || process.env.VIVAFOLIO_NIM_LSP || process.env.NIM_LSP || 'nimlsp'
  const proc = spawn(resolveBinary(cmd), [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, `nim-connectivity-${cmd}`, repoRoot)
  return { conn, proc, logPath }
}

async function testNimWithServer(repoRoot, serverCmd) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'nim-basic')
  const filePath = path.join(fixtureDir, 'src', 'bad.nim')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startNimLangServer(fixtureDir, repoRoot, serverCmd)
  try {
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: { workspace: { configuration: true } },
      rootUri: String(pathToFileURL(fixtureDir)),
      workspaceFolders: null
    })
    await conn.sendNotification('initialized', {})

    // Send workspace configuration for nimlsp
    if (serverCmd === 'nimlsp') {
      await conn.sendNotification('workspace/didChangeConfiguration', {
        settings: {
          nim: {
            projectMapping: [{ projectFile: "nim-basic.nimble", fileRegex: ".*" }]
          }
        }
      })
    }

    await wait(300)

    // Read the existing bad.nim content instead of overwriting
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'nim', version: 1, text } })
    // Some servers need an explicit change event to trigger analysis
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text }] })
    // Add didSave as recommended in status document
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 2 }, text })

    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 45000)
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

async function testNimConnectivity(repoRoot) {
  const servers = [ 'nimlsp', 'nimlangserver' ]
  const attempts = []
  for (const s of servers) {
    // Don't skip silently; record a hard failure for missing binaries
    assertCommandExists(repoRoot, 'nim-connectivity', s)
    attempts.push(await testNimWithServer(repoRoot, s))
    if (attempts[attempts.length - 1].ok) break
  }
  const success = attempts.find(a => a.ok)
  if (success) return { ok: true, logPath: success.logPath, server: success.server }
  const last = attempts[attempts.length - 1]
  return { ok: false, logPath: last ? last.logPath : '', server: last ? last.server : undefined }
}

// ---------- D ----------
function startServeD(cwd, repoRoot) {
  const proc = spawn(resolveBinary('serve-d'), [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'd-connectivity', repoRoot)
  // Respond to configuration requests to avoid external DCD dependency
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

async function testDConnectivity(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'd-basic')
  const filePath = path.join(fixtureDir, 'source', 'bad.d')
  const fileUri = String(pathToFileURL(filePath))
  const projectUri = String(pathToFileURL(fixtureDir))
  assertCommandExists(repoRoot, 'd-connectivity', 'serve-d')
  const { conn, proc, logPath } = startServeD(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: { workspace: { configuration: true } },
      rootUri: projectUri,
      workspaceFolders: [{ uri: projectUri, name: 'd-basic' }]
    })
    await conn.sendNotification('initialized', {})
    await conn.sendNotification('workspace/didChangeConfiguration', { settings: {
      dcdClientPath: '', dcdServerPath: '', useDCDClient: false,
      d: { dcd: { clientPath: '', serverPath: '', useClient: false } },
      'd.dcd': { clientPath: '', serverPath: '', useClient: false }
    } })
    await wait(300)

    // Read the existing bad.d content instead of overwriting
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'd', version: 1, text } })

    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 60000)
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          // Accept diagnostics from any file in the project (more flexible per status document)
          if (p && p.uri && p.uri.startsWith(projectUri) && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) {
            clearTimeout(to); resolve(true)
          }
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
  const proc = spawn('rust-analyzer', [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'rust-connectivity', repoRoot)
  return { conn, proc, logPath }
}

async function testRustConnectivity(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'vivafolio', 'test', 'projects', 'rust-basic')
  const mainPath = path.join(fixtureDir, 'src', 'main.rs')
  const filePath = path.join(fixtureDir, 'src', 'bad.rs')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startRustAnalyzer(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: String(pathToFileURL(fixtureDir)), workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    await wait(300)
    try { fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true }) } catch {}
    try { fs.writeFileSync(mainPath, 'fn main() {}\n', 'utf8') } catch {}
    const text = 'fn bad() { let x = ; }\n'
    try { fs.writeFileSync(filePath, text, 'utf8') } catch {}
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
  const proc = spawn('zls', ['--enable-stderr-logs', '--log-level', 'debug'], { cwd, stdio: 'pipe', env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'zig-connectivity', repoRoot)
  return { conn, proc, logPath }
}

async function testZigConnectivity(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'vivafolio', 'test', 'projects', 'zig-basic')
  const buildZig = path.join(fixtureDir, 'build.zig')
  const filePath = path.join(fixtureDir, 'src', 'main.zig')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startZls(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: {},
      rootUri: String(pathToFileURL(fixtureDir)),
      workspaceFolders: [{ uri: String(pathToFileURL(fixtureDir)), name: 'zig-basic' }],
      initializationOptions: {
        enable_build_on_save: false,
        zig_exe_path: 'zig'
      }
    })
    await conn.sendNotification('initialized', {})
    await wait(300)

    // No build.zig needed for basic diagnostics

    // Ensure the file exists on disk first
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'zig', version: 1, text } })

    // Try a small change to trigger analysis
    const modifiedText = text + '\n// modified for analysis'
    await conn.sendNotification('textDocument/didChange', {
      textDocument: { uri: fileUri, version: 2 },
      contentChanges: [{ text: modifiedText }]
    })

    // Save the file
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 2 }, text: modifiedText })

    // Wait a bit and try another change to ensure analysis
    await wait(1000)
    await conn.sendNotification('textDocument/didChange', {
      textDocument: { uri: fileUri, version: 3 },
      contentChanges: [{ text: text }] // Back to original
    })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 3 }, text })

    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 2000) // Short timeout - if no response in 2s, it's not coming
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          console.log(`[zig-debug] Received diagnostics for ${p.uri}: ${JSON.stringify(p.diagnostics)}`)
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

// ---------- Crystal ----------
function startCrystalline(cwd, repoRoot) {
  const proc = spawn('crystalline', [], { cwd, stdio: 'pipe', env: process.env })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'crystal-connectivity', repoRoot)
  return { conn, proc, logPath }
}

async function testCrystalConnectivity(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'vivafolio', 'test', 'projects', 'crystal-basic')
  const filePath = path.join(fixtureDir, 'src', 'bad.cr')
  const fileUri = String(pathToFileURL(filePath))
  const { conn, proc, logPath } = startCrystalline(fixtureDir, repoRoot)
  try {
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true }
        }
      },
      rootUri: String(pathToFileURL(fixtureDir)),
      workspaceFolders: [{ uri: String(pathToFileURL(fixtureDir)), name: 'crystal-basic' }]
    })
    await conn.sendNotification('initialized', {})
    await wait(300)

    // Read the existing bad.cr content instead of overwriting
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'crystal', version: 1, text } })
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text }] })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 2 }, text })

    const ok = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 30000) // Shorter timeout for Crystal
      conn.onNotification('textDocument/publishDiagnostics', (p) => {
        try {
          console.log(`[crystal-debug] Received diagnostics for ${p.uri}: ${JSON.stringify(p.diagnostics)}`)
          // Accept diagnostics from any file in the project
          if (p && p.uri && p.uri.includes('crystal-basic') && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) {
            clearTimeout(to); resolve(true)
          }
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
  const repoRoot = path.resolve(__dirname, '..', '..')
  const results = []
  results.push({ name: 'Lean', ...(await testLeanConnectivity(repoRoot)) })
  results.push({ name: 'Nim', ...(await testNimConnectivity(repoRoot)) })
  results.push({ name: 'D', ...(await testDConnectivity(repoRoot)) })
  results.push({ name: 'Rust', ...(await testRustConnectivity(repoRoot)) })
  results.push({ name: 'Zig', ...(await testZigConnectivity(repoRoot)) })
  results.push({ name: 'Crystal', ...(await testCrystalConnectivity(repoRoot)) })

  const failures = results.filter(r => !r.ok)
  if (failures.length === 0) {
    console.log('Connectivity OK for Lean, Nim, D, Rust, Zig, Crystal')
    process.exit(0)
  } else {
    for (const f of failures) {
      let size = 0
      try { size = fs.statSync(f.logPath).size } catch {}
      console.error(`${f.name} connectivity failed (${f.server ? f.server + ' ' : ''}). See log: ${f.logPath} (${size} bytes)`)
    }
    process.exit(1)
  }
}

run().catch(err => { console.error(err); process.exit(1) })
