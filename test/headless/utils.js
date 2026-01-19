const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const rpc = require('vscode-jsonrpc/node')
const { pathToFileURL } = require('url')

function createLogger(label) {
  return (...args) => {
    try {
      console.log(`[${label}]`, ...args)
    } catch {
      /* noop */
    }
  }
}

function createJsonRpcConnection(proc, label) {
  const log = createLogger(label)
  proc.stderr?.on('data', (chunk) => { const msg = String(chunk || '').trim(); if (msg) log('[stderr]', msg) })
  proc.on('exit', (code, signal) => log('[exit]', `code=${code} signal=${signal || ''}`))
  const connection = rpc.createMessageConnection(
    new rpc.StreamMessageReader(proc.stdout),
    new rpc.StreamMessageWriter(proc.stdin),
    { error: (m) => log('[error]', m), warn: (m) => log('[warn]', m), info: (m) => log('[info]', m) }
  )
  connection.listen()
  return { connection, log }
}

function startMocklangServer(repoRoot) {
  const serverPath = path.resolve(repoRoot, 'test', 'mock-lsp-server.js')
  const proc = spawn('node', [serverPath], { stdio: 'pipe', cwd: repoRoot, env: process.env })
  const { connection, log } = createJsonRpcConnection(proc, 'mocklang-headless')
  return { proc, connection, log }
}

function findLakeBinary() {
  return 'lake'
}

function startLeanLakeServe(repoRoot, projectRelPath = path.join('test', 'projects', 'lean-dsl')) {
  const cwd = path.resolve(repoRoot, projectRelPath)
  const lakeBin = findLakeBinary()
  const env = { ...process.env, LEAN_SERVER_LOG_DIR: path.join(repoRoot, '.lake', 'lsp-headless-logs') }
  const candidates = [
    path.resolve(repoRoot, 'lean4-experiments', 'build', 'release', 'stage1'),
    path.resolve(repoRoot, 'lean4-experiments', 'build', 'release-make', 'stage1')
  ]
  try {
    const toolchainsDir = path.join(process.env.HOME || '', '.elan', 'toolchains')
    for (const name of fs.existsSync(toolchainsDir) ? fs.readdirSync(toolchainsDir) : []) {
      const candidate = path.join(toolchainsDir, name)
      try {
        if (fs.statSync(candidate).isDirectory()) candidates.push(candidate)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  for (const candidate of candidates) {
    try {
      const leanOlean = path.join(candidate, 'lib', 'lean', 'Lean.olean')
      if (fs.existsSync(leanOlean)) {
        env.LEAN_SYSROOT = candidate
        break
      }
    } catch {
      /* ignore */
    }
  }
  const proc = spawn(lakeBin, ['serve', '--'], { cwd, stdio: 'pipe', env })
  const { connection, log } = createJsonRpcConnection(proc, 'lean-headless')
  return { proc, connection, cwd, log }
}

async function openTextDocument(connection, { uri, languageId, text }) {
  await connection.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId, version: 1, text }
  })
  await connection.sendNotification('textDocument/didChange', {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text }]
  })
  await connection.sendNotification('textDocument/didSave', {
    textDocument: { uri }
  })
}

function waitForDiagnostics(connection, targetUri, matcher, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose()
      reject(new Error(`Timed out waiting for diagnostics for ${targetUri}`))
    }, timeoutMs)
    const handler = (params) => {
      if (!params || params.uri !== targetUri) {
        return
      }
      const diagnostics = Array.isArray(params.diagnostics) ? params.diagnostics : []
      const result = matcher(diagnostics, params)
      if (result) {
        clearTimeout(timer)
        subscription.dispose()
        resolve(result)
      }
    }
    const subscription = connection.onNotification('textDocument/publishDiagnostics', handler)
  })
}

function parseVivafolioPayloadFromDiagnostic(diagnostic) {
  try {
    const message = String(diagnostic?.message || '')
    const match = /vivafolio:\s*(\{[\s\S]*\})/i.exec(message)
    if (match && match[1]) {
      return JSON.parse(match[1])
    }
  } catch {
    /* ignore parse errors */
  }
  return undefined
}

function defaultFallbackResourceMap(repoRoot) {
  const register = (relPath) => {
    const abs = path.resolve(repoRoot, relPath)
    return fs.existsSync(abs) ? pathToFileURL(abs).toString() : undefined
  }
  const map = new Map()
  const defaultHtml = register(path.join('test', 'resources', 'index.html'))
  if (defaultHtml) map.set('*', defaultHtml)
  const picker = register(path.join('blocks', 'color-picker', 'dist', 'index.html'))
  if (picker) map.set('picker', picker)
  const square = register(path.join('blocks', 'color-square', 'dist', 'index.html'))
  if (square) map.set('square', square)
  return map
}

function createBlockNotification(payload, { diagnostic, documentUri, fallbackResources }) {
  const entityGraph = {
    entities: Array.isArray(payload?.entityGraph?.entities) ? payload.entityGraph.entities : [],
    links: Array.isArray(payload?.entityGraph?.links) ? payload.entityGraph.links : []
  }
  const notification = {
    ...payload,
    entityGraph,
    sourceUri: documentUri,
    range: diagnostic?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
  }

  if (!Array.isArray(notification.resources) || notification.resources.length === 0) {
    const key = String(notification.blockType || '*').toLowerCase()
    const fallback = fallbackResources?.get(key) ?? fallbackResources?.get('*')
    if (fallback) {
      notification.resources = [{
        logicalName: 'index.html',
        physicalPath: fallback,
        cachingTag: `headless-fallback-${key || 'default'}`
      }]
    }
  }
  return notification
}

module.exports = {
  startMocklangServer,
  startLeanLakeServe,
  openTextDocument,
  waitForDiagnostics,
  parseVivafolioPayloadFromDiagnostic,
  createBlockNotification,
  defaultFallbackResourceMap
}
