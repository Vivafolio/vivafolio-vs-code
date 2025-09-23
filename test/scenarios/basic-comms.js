// Scenario: basic-comms
// Goal: Each supported language publishes at least one ordinary diagnostic
// using only standard tooling on a tiny standalone project.

const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn, execSync } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs')

// Import communication layer abstractions
let CommunicationLayer, LangExecutorFactory, LspConnectionFactory;
try {
  CommunicationLayer = require('../../packages/communication-layer/dist/index.js');
  LangExecutorFactory = require('../../packages/lang-executor/dist/index.js').LangExecutorFactory;
  LspConnectionFactory = require('../../packages/lsp-connection/dist/index.js').LspConnectionFactory;
} catch (e) {
  // Fallback if packages aren't built yet
  console.warn('Communication layer packages not available, using legacy implementation');
}

// Synchronously checks if an executable with the given name exists in any directory on the user's PATH.
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

// Throws an error (and logs a hint) if the given command is not found in PATH; used to ensure required binaries are present before running tests.
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

// Returns the absolute path to a command using 'command -v', or the raw name if lookup fails.
function resolveBinary(cmd) {
  try { return execSync(`command -v ${cmd}`, { encoding: 'utf8' }).trim() } catch { return cmd }
}

// Ensures the test/logs directory exists and returns its absolute path.
function ensureLogsDir(repoRoot) {
  const dir = path.resolve(repoRoot, 'test', 'logs')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}
// Creates a timestamped log file and returns an object with logPath, log (function), and stream.
function createLogger(repoRoot, label) {
  const dir = ensureLogsDir(repoRoot)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(dir, `${label}-${ts}.log`)
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  const log = (msg) => { try { stream.write(`[${new Date().toISOString()}] ${msg}\n`) } catch {} }
  return { logPath, log, stream }
}
// Wraps a spawned process with a JSON-RPC connection and logs stderr, exit, trace, and errors to a file.
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

// Resolves when the process emits any stdout/stderr data, or rejects on error/exit/timeout; used as a crude 'ready' signal.
async function waitForProcReady(proc, timeoutMs = 1200) {
  return await new Promise((resolve, reject) => {
    let settled = false
    const onData = () => { if (!settled) { settled = true; cleanup(); resolve(true) } }
    const onErr = (e) => { if (!settled) { settled = true; cleanup(); reject(e instanceof Error ? e : new Error(String(e))) } }
    const onExit = (code, sig) => { if (!settled) { settled = true; cleanup(); reject(new Error(`proc exited before ready: code=${code} sig=${sig || ''}`)) } }
    const timer = setTimeout(() => { if (!settled) { settled = true; cleanup(); if (proc.exitCode !== null) reject(new Error(`proc exited early: code=${proc.exitCode}`)); else resolve(true) } }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      try { proc.stdout.off('data', onData) } catch {}
      try { proc.stderr.off('data', onData) } catch {}
      try { proc.off('error', onErr) } catch {}
      try { proc.off('exit', onExit) } catch {}
    }
    try { proc.stdout.on('data', onData); proc.stderr.on('data', onData); proc.on('error', onErr); proc.on('exit', onExit) } catch {}
  })
}

// ---------- Lean ----------
// Returns the name of the Lean build tool binary ('lake').
function findLakeBinary(_repoRoot) { return 'lake' }
// Starts the Lean 'lake serve' process in the lean-basic project, asserts presence, and returns its connection and log info.
function startLeanLakeServe(repoRoot) {
  const cwd = path.resolve(repoRoot, 'test', 'projects', 'lean-basic')
  assertCommandExists(repoRoot, 'basic-lean', 'lake')
  const lakeBin = resolveBinary(findLakeBinary(repoRoot))
  const binDir = path.dirname(lakeBin)
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ''}` }
  const proc = spawn(`${lakeBin} serve --`, { cwd, stdio: 'pipe', env, shell: resolveBinary('bash') })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'basic-lean', repoRoot)
  return { conn, proc, cwd, logPath }
}
// Runs a Lean LSP session: initializes, opens Basic.lean, and waits for at least one diagnostic.
async function testLean(repoRoot) {
  const started = startLeanLakeServe(repoRoot)
  if (started.skipped) {
    return { ok: true, logPath: started.logPath, skipped: true }
  }
  const { conn, proc, cwd, logPath } = started
  try {
    await waitForProcReady(proc)
    await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    await wait(200)
    const absPath = path.join(cwd, 'Basic.lean')
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
// Starts the Nim language server (nimlsp or nimlangserver) in the given directory, returns connection and log info.
function startNimLangServer(cwd, repoRoot, serverCmd) {
  const overrideBin = process.env.VIVAFOLIO_NIMLANGSERVER_BIN && serverCmd === 'nimlangserver' ? process.env.VIVAFOLIO_NIMLANGSERVER_BIN : undefined
  const cmd = overrideBin || serverCmd || process.env.VIVAFOLIO_NIM_LSP || process.env.NIM_LSP || 'nimlsp'
  if (!commandExists(cmd)) {
    return { conn: { dispose: ()=>{} }, proc: { kill: ()=>{} }, logPath: createLogger(repoRoot, `basic-nim-${cmd}-skip`).logPath, skipped: true }
  }
  const proc = spawn(resolveBinary(cmd), [], { cwd, stdio: 'pipe', env: process.env, shell: resolveBinary('bash') })
  const { conn, logPath } = makeConnectionWithLogging(proc, `basic-nim-${cmd}`, repoRoot)
  try {
    conn.onRequest('workspace/configuration', (params) => {
      try { return (params.items || []).map(() => ({})) } catch { return [] }
    })
  } catch {}
  return { conn, proc, logPath }
}
// Runs a Nim LSP session: initializes, configures, opens a bad file, and waits for diagnostics.
async function testNim(repoRoot, serverCmd) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'nim-basic')
  const filePath = path.join(fixtureDir, 'src', 'bad.nim')
  const fileUri = String(pathToFileURL(filePath))
  assertCommandExists(repoRoot, `basic-nim-${serverCmd || 'nimlsp'}`, serverCmd || 'nimlsp')
  const started = startNimLangServer(fixtureDir, repoRoot, serverCmd)
  const { conn, proc, logPath } = started
  try {
    await waitForProcReady(proc)
    await conn.sendRequest('initialize', { processId: null, capabilities: { workspace: { configuration: true } }, rootUri: String(pathToFileURL(fixtureDir)), workspaceFolders: null })
    await conn.sendNotification('initialized', {})
    // Send workspace configuration for nimlsp if applicable
    if ((serverCmd || 'nimlsp') === 'nimlsp') {
      try {
        await conn.sendNotification('workspace/didChangeConfiguration', {
          settings: {
            nim: {
              projectMapping: [{ projectFile: 'nim-basic.nimble', fileRegex: '.*' }]
            }
          }
        })
      } catch {}
    }
    await wait(200)
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
    try { fs.appendFileSync(logPath, `[error] ${err && err.stack ? err.stack : String(err)}\n`) } catch {}
    return { ok: false, logPath, error: err, server: serverCmd || 'nimlsp' }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- D ----------
// Starts the D language server (serve-d) in the given directory, asserts presence, and returns connection and log info.
function startServeD(cwd, repoRoot) {
  assertCommandExists(repoRoot, 'basic-d', 'serve-d')
  const proc = spawn(resolveBinary('serve-d'), [], { cwd, stdio: 'pipe', env: process.env, shell: resolveBinary('bash') })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'basic-d', repoRoot)
  conn.onRequest('workspace/configuration', (params) => {
    try {
      return (params.items || []).map(() => ({ d: { dcd: { useClient: false, clientPath: '', serverPath: '' } } }))
    } catch { return [] }
  })
  return { conn, proc, logPath }
}
// Runs a D LSP session: initializes, configures, opens a bad file, and waits for diagnostics.
async function testD(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'd-basic')
  const filePath = path.join(fixtureDir, 'source', 'bad.d')
  const fileUri = String(pathToFileURL(filePath))
  const projectUri = String(pathToFileURL(fixtureDir))
  const started = startServeD(fixtureDir, repoRoot)
  const { conn, proc, logPath } = started
  try {
    await waitForProcReady(proc)
    const absZig = resolveBinary('zig')
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: { workspace: { configuration: true } },
      rootUri: projectUri,
      workspaceFolders: [{ uri: projectUri, name: 'd-basic' }]
    })
    await conn.sendNotification('initialized', {})
    await conn.sendNotification('workspace/didChangeConfiguration', { settings: { d: { dcd: { useClient: false, clientPath: '', serverPath: '' } } } })
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
    try { fs.appendFileSync(logPath, `[error] ${err && err.stack ? err.stack : String(err)}\n`) } catch {}
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- Rust ----------
// Starts the Rust language server (rust-analyzer) in the given directory, asserts presence, and returns connection and log info.
function startRustAnalyzer(cwd, repoRoot) {
  assertCommandExists(repoRoot, 'basic-rust', 'rust-analyzer')
  const proc = spawn(resolveBinary('rust-analyzer'), [], { cwd, stdio: 'pipe', env: process.env, shell: resolveBinary('bash') })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'basic-rust', repoRoot)
  return { conn, proc, logPath }
}
// Runs a Rust LSP session: initializes, opens/edits a bad file, and waits for diagnostics.
async function testRust(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'rust-basic')
  const filePath = path.join(fixtureDir, 'src', 'bad.rs')
  const fileUri = String(pathToFileURL(filePath))
  const started = startRustAnalyzer(fixtureDir, repoRoot)
  const { conn, proc, logPath } = started
  try {
    await waitForProcReady(proc)
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
    try { fs.appendFileSync(logPath, `[error] ${err && err.stack ? err.stack : String(err)}\n`) } catch {}
    return { ok: false, logPath, error: err }
  } finally {
    try { proc.kill() } catch {}
    conn.dispose()
  }
}

// ---------- Zig ----------
// Starts the Zig language server (zls) in the given directory, asserts presence, and returns connection and log info.
function startZls(cwd, repoRoot) {
  const zlsBin = process.env.VIVAFOLIO_ZLS_BIN || 'zls'
  assertCommandExists(repoRoot, 'basic-zig', zlsBin)
  const env = { ...process.env }
  const proc = spawn(`${resolveBinary(zlsBin)} --enable-stderr-logs --log-level debug`, { cwd, stdio: 'pipe', env, shell: resolveBinary('bash') })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'basic-zig', repoRoot)
  return { conn, proc, logPath }
}
// Runs a Zig LSP session: initializes, opens/changes/saves a file, and waits for diagnostics.
async function testZig(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'zig-basic')
  const filePath = path.join(fixtureDir, 'src', 'main.zig')
  const fileUri = String(pathToFileURL(filePath))
  const started = startZls(fixtureDir, repoRoot)
  const { conn, proc, logPath } = started
  try {
    await waitForProcReady(proc)
    const absZig = resolveBinary('zig')
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: {},
      rootUri: String(pathToFileURL(fixtureDir)),
      workspaceFolders: [{ uri: String(pathToFileURL(fixtureDir)), name: 'zig-basic' }],
      initializationOptions: { enable_build_on_save: false, zig_exe_path: absZig }
    })
    await conn.sendNotification('initialized', {})
    await wait(300)
    const text = fs.readFileSync(filePath, 'utf8')
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri: fileUri, languageId: 'zig', version: 1, text } })
    const modifiedText = text + '\n// modified for analysis\n'
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text: modifiedText }] })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 2 }, text: modifiedText })
    await wait(1000)
    await conn.sendNotification('textDocument/didChange', { textDocument: { uri: fileUri, version: 3 }, contentChanges: [{ text }] })
    await conn.sendNotification('textDocument/didSave', { textDocument: { uri: fileUri, version: 3 }, text })
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

// ---------- Nim Two Blocks Test (using nimsuggest) ----------
async function testNimTwoBlocks(repoRoot, serverCmd) {
  const fixtureDir = path.resolve(repoRoot, 'packages', 'vivafolio-nim-testing', 'examples')
  const filePath = path.join(fixtureDir, 'two_blocks.nim')

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping nim-two-blocks test: ${filePath} not found`)
    return { ok: true, logPath: null, skipped: true }
  }

  // LangExecutor is for runtime scripts, not LSP tools like nimsuggest
  // nimsuggest produces LSP diagnostics, not JSON blocks, so we use legacy implementation

  // Legacy implementation as fallback
  // Only nimsuggest is supported for this test as it has the right stdin/stdout protocol
  if (serverCmd !== 'nimsuggest') {
    console.log(`Skipping ${serverCmd} - only nimsuggest supported for two-blocks test`)
    return { ok: true, logPath: null, skipped: true }
  }

  return new Promise((resolve) => {
    const { spawn } = require('child_process')
    const proc = spawn('nimsuggest', ['--stdin', '--path:' + path.resolve(repoRoot, 'packages/vivafolio-nim-testing/src'), filePath], {
      cwd: fixtureDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''

    proc.stdout.on('data', (data) => {
      output += data.toString()
    })

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    // Send chk command after a brief delay to let nimsuggest start
    setTimeout(() => {
      proc.stdin.write('chk ' + path.basename(filePath) + ':1:1\n')
      proc.stdin.write('quit\n')
    }, 500)

    // Wait for process to finish
    proc.on('close', (code) => {
      const lines = output.split('\n')
      const vivafolioLines = lines.filter(line => line.includes('vivafolio:'))

      if (vivafolioLines.length >= 2) { // Should have both color-picker and color-square
        console.log(`Found ${vivafolioLines.length} vivafolio warnings via nimsuggest`)
        resolve({ ok: true, logPath: null })
      } else {
        console.log(`Expected vivafolio warnings not found. Total lines: ${lines.length}`)
        console.log('Sample output lines:')
        lines.slice(0, 10).forEach((line, i) => console.log(`  ${i}: ${line.substring(0, 100)}...`))
        resolve({ ok: false, logPath: null, error: 'No vivafolio warnings found' })
      }
    })

    // Timeout after 10 seconds
    setTimeout(() => {
      try { proc.kill() } catch {}
      resolve({ ok: false, logPath: null, error: 'Timeout waiting for nimsuggest' })
    }, 10000)
  })
}

// ---------- Crystal ----------
// Starts the Crystal language server (crystalline) in the given directory, asserts presence, and returns connection and log info.
function startCrystalline(cwd, repoRoot) {
  const crystalBin = process.env.VIVAFOLIO_CRYSTALLINE_BIN || 'crystalline'
  assertCommandExists(repoRoot, 'basic-crystal', crystalBin)
  const proc = spawn(resolveBinary(crystalBin), [], { cwd, stdio: 'pipe', env: process.env, shell: resolveBinary('bash') })
  const { conn, logPath } = makeConnectionWithLogging(proc, 'basic-crystal', repoRoot)
  return { conn, proc, logPath }
}
// Runs a Crystal LSP session: initializes, opens/changes/saves a bad file, and waits for diagnostics.
async function testCrystal(repoRoot) {
  const fixtureDir = path.resolve(repoRoot, 'test', 'projects', 'crystal-basic')
  const filePath = path.join(fixtureDir, 'src', 'bad.cr')
  const fileUri = String(pathToFileURL(filePath))
  const started = startCrystalline(fixtureDir, repoRoot)
  const { conn, proc, logPath } = started
  try {
    await waitForProcReady(proc)
    await conn.sendRequest('initialize', {
      processId: null,
      capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true } } },
      rootUri: String(pathToFileURL(fixtureDir)),
      workspaceFolders: [{ uri: String(pathToFileURL(fixtureDir)), name: 'crystal-basic' }]
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
          if (p && p.uri && p.uri.includes('crystal-basic') && Array.isArray(p.diagnostics) && p.diagnostics.length > 0) { clearTimeout(to); resolve(true) }
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

// Parse command line arguments for scenario selection
function parseScenarioArgs() {
  const args = process.argv.slice(2)
  if (args.length === 0) return null // Run all scenarios

  const scenarios = args.map(arg => arg.toLowerCase())
  return scenarios
}

// Filter scenarios based on command line arguments
function shouldRunScenario(scenarioName, selectedScenarios) {
  if (!selectedScenarios) return true // Run all if no filter

  const name = scenarioName.toLowerCase()
  return selectedScenarios.some(selected => {
    if (selected === 'nim') return name.includes('nim') && !name.includes('two-blocks')
    if (selected === 'nimlsp') return name.includes('nimlsp')
    if (selected === 'nimlangserver') return name.includes('nimlangserver')
    if (selected === 'nimsuggest') return name.includes('nimsuggest')
    if (selected === 'two-blocks') return name.includes('two-blocks')
    return name.includes(selected)
  })
}

// Orchestrates all per-language tests, collects results, prints summary, and sets exit code.
async function run() {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const selectedScenarios = parseScenarioArgs()

  if (selectedScenarios) {
    console.log(`Running basic-comms scenarios: ${selectedScenarios.join(', ')}`)
  } else {
    console.log('Running all basic-comms scenarios')
  }

  const results = []
  const allTests = [
    { name: 'Lean (basic-comms)', test: () => testLean(repoRoot) },
    { name: 'Nim (basic-comms, nimlsp)', test: () => testNim(repoRoot, 'nimlsp') },
    { name: 'Nim (basic-comms, nimlangserver)', test: () => testNim(repoRoot, 'nimlangserver') },
    { name: 'Nim (two-blocks, nimlsp)', test: () => testNimTwoBlocks(repoRoot, 'nimlsp') },
    { name: 'Nim (two-blocks, nimlangserver)', test: () => testNimTwoBlocks(repoRoot, 'nimlangserver') },
    { name: 'Nim (two-blocks, nimsuggest)', test: () => testNimTwoBlocks(repoRoot, 'nimsuggest') },
    { name: 'D (basic-comms)', test: () => testD(repoRoot) },
    { name: 'Rust (basic-comms)', test: () => testRust(repoRoot) },
    { name: 'Zig (basic-comms)', test: () => testZig(repoRoot) },
    { name: 'Crystal (basic-comms)', test: () => testCrystal(repoRoot) }
  ]

  for (const { name, test } of allTests) {
    if (shouldRunScenario(name, selectedScenarios)) {
      console.log(`Running: ${name}`)
      results.push({ name, ...(await test()) })
    } else {
      console.log(`Skipping: ${name}`)
    }
  }

  const failures = results.filter(r => !r.ok)
  if (failures.length === 0) {
    const runCount = results.length
    const totalCount = allTests.length
    if (runCount === totalCount) {
      console.log('basic-comms OK for Lean, Nim (nimlsp), Nim (nimlangserver), D, Rust, Zig, Crystal')
    } else {
      console.log(`basic-comms OK for ${runCount} selected scenario(s)`)
    }
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
