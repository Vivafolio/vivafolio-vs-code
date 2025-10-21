/**
 * Standalone Block Protocol Dev Server
 *
 * This module provides a standalone version of the Block Protocol development server
 * that can be consumed as a library or run via CLI without Vivafolio integration.
 *
 * Usage:
 * ```typescript
 * import { startStandaloneServer } from '@vivafolio/blockprotocol-dev-server'
 *
 * const server = await startStandaloneServer({
 *   port: 3000,
 *   frameworks: ['solidjs', 'vue', 'svelte'],
 *   enableHotReload: true
 * })
 * ```
 */

import express from 'express'
import { createServer as createHttpServer } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import path from 'path'
import fs from 'fs/promises'
import { existsSync, watch } from 'fs'
import crypto from 'crypto'

import type { ViteDevServer } from 'vite'

// Re-export core types for external consumption
export interface Entity {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
  metadata?: {
    recordId?: {
      entityId: string
      editionId: string
    }
    entityTypeId?: string
  }
}

export interface EntityGraph {
  entities: Entity[]
  links: Array<Entity & { sourceEntityId?: string; destinationEntityId?: string }>
}

export interface FrameworkBundle {
  id: string
  hash: string
  assets: string[]
  metadata: Record<string, unknown>
  entryPoint: string
  lastModified: Date
}

export interface StandaloneServerOptions {
  /** Port to listen on (default: 4173) */
  port?: number
  /** Host to bind to (default: '0.0.0.0') */
  host?: string
  /** Frameworks to enable (default: all supported) */
  frameworks?: ('solidjs' | 'vue' | 'svelte' | 'lit' | 'angular')[]
  /** Enable hot reload (default: true) */
  enableHotReload?: boolean
  /** Enable Vite middleware (default: true in development) */
  enableVite?: boolean
  /** Custom framework source directories */
  frameworkDirs?: Record<string, string>
  /** Custom output directory for compiled assets */
  outputDir?: string
  /** Attach signal handlers for graceful shutdown */
  attachSignalHandlers?: boolean
  /** Custom scenarios to serve */
  scenarios?: Record<string, ScenarioDefinition>
  /** Callback when server is ready */
  onReady?: (url: string) => void
  /** Callback when framework is compiled */
  onFrameworkCompiled?: (framework: string, bundle: FrameworkBundle) => void
}

export interface ScenarioDefinition {
  id: string
  title: string
  description: string
  createState(): { graph: EntityGraph }
  buildNotifications(state: { graph: EntityGraph }): VivafolioBlockNotificationPayload[]
  applyUpdate?(context: UpdateContext): void
}

interface VivafolioBlockNotificationPayload {
  blockId: string
  blockType: string
  entityId: string
  displayMode: 'multi-line' | 'inline'
  entityGraph: EntityGraph
  supportsHotReload?: boolean
  initialHeight?: number
  resources?: Array<{
    logicalName: string
    physicalPath: string
    cachingTag?: string
  }>
}

interface UpdateContext {
  state: { graph: EntityGraph }
  update: {
    blockId: string
    kind: 'updateEntity'
    entityId: string
    properties: Record<string, unknown>
  }
  socket: WebSocket
  broadcast: (payload: VivafolioBlockNotificationPayload) => void
}

interface FrameworkWatcher {
  framework: string
  sourceDir: string
  outputDir: string
  watcher?: ReturnType<typeof watch>
  bundles: Map<string, FrameworkBundle>
}

// Core framework compilation functions
function generateAssetHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8)
}

async function compileFrameworkBlock(
  sourcePath: string,
  outputPath: string,
  framework: string
): Promise<FrameworkBundle> {
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const hash = generateAssetHash(sourceContent)

  // Simple compilation wrapper - in production this would use proper bundlers
  const compiledContent = `
(function() {
  const ${framework}Block = ${JSON.stringify(sourceContent)};

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ${framework}Block;
  }

  if (typeof window !== 'undefined') {
    window.${framework}Block = ${framework}Block;
  }

  return ${framework}Block;
})();
`

  const outputFile = path.join(outputPath, `${framework}-${path.basename(sourcePath, path.extname(sourcePath))}-${hash}.js`)
  await fs.mkdir(outputPath, { recursive: true })
  await fs.writeFile(outputFile, compiledContent, 'utf8')

  return {
    id: `${framework}-${path.basename(sourcePath, path.extname(sourcePath))}`,
    hash,
    assets: [`${framework}-${path.basename(sourcePath, path.extname(sourcePath))}-${hash}.js`],
    metadata: {
      framework,
      sourcePath,
      compiledAt: new Date().toISOString()
    },
    entryPoint: `${framework}-${path.basename(sourcePath, path.extname(sourcePath))}-${hash}.js`,
    lastModified: new Date()
  }
}

async function setupFrameworkWatchers(
  frameworks: string[],
  baseDir: string,
  outputDir: string,
  customDirs?: Record<string, string>,
  onCompiled?: (framework: string, bundle: FrameworkBundle) => void
): Promise<FrameworkWatcher[]> {
  const watchers: FrameworkWatcher[] = []

  for (const framework of frameworks) {
    let sourceDir = customDirs?.[framework] || path.join(baseDir, '..', '..', 'packages', 'block-frameworks', framework, 'examples')

    console.log(`[standalone-server] Checking ${framework} at: ${sourceDir}`)
    console.log(`[standalone-server] Base dir: ${baseDir}`)
    console.log(`[standalone-server] Process CWD: ${process.cwd()}`)

    // Check if the directory exists in the current context
    if (!existsSync(sourceDir)) {
      // Try relative to the current working directory
      const altSourceDir = path.join(process.cwd(), 'packages', 'block-frameworks', framework, 'examples')
      console.log(`[standalone-server] Primary path not found, trying: ${altSourceDir}`)

      if (existsSync(altSourceDir)) {
        sourceDir = altSourceDir
        console.log(`[standalone-server] Using alternative path for ${framework}: ${altSourceDir}`)
      } else {
        console.log(`[standalone-server] Skipping ${framework} - examples directory not found: ${sourceDir} or ${altSourceDir}`)
        continue
      }
    } else {
      console.log(`[standalone-server] Found ${framework} at: ${sourceDir}`)
    }

    const frameworkOutputDir = path.join(outputDir, framework)

    const watcher: FrameworkWatcher = {
      framework,
      sourceDir,
      outputDir: frameworkOutputDir,
      bundles: new Map()
    }

    // Initial compilation
    try {
      const files = await fs.readdir(sourceDir)
      const compilableFiles = files.filter(file =>
        file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') ||
        file.endsWith('.vue') || file.endsWith('.svelte')
      )

      for (const file of compilableFiles) {
        const sourcePath = path.join(sourceDir, file)
        const bundle = await compileFrameworkBlock(sourcePath, frameworkOutputDir, framework)
        watcher.bundles.set(bundle.id, bundle)
        console.log(`[standalone-server] Compiled ${framework}/${file} -> ${bundle.entryPoint}`)
        onCompiled?.(framework, bundle)
      }
    } catch (error) {
      console.error(`[standalone-server] Failed to compile ${framework} blocks:`, error)
    }

    // Setup file watcher for hot reload
    if (existsSync(sourceDir)) {
      watcher.watcher = watch(sourceDir, { recursive: true }, async (event, filename) => {
        if (!filename || !filename.match(/\.(tsx|ts|js|vue|svelte)$/)) return

        try {
          const sourcePath = path.join(sourceDir, filename)
          const bundle = await compileFrameworkBlock(sourcePath, frameworkOutputDir, framework)
          watcher.bundles.set(bundle.id, bundle)
          console.log(`[standalone-server] Recompiled ${framework}/${filename} -> ${bundle.entryPoint}`)
          onCompiled?.(framework, bundle)
        } catch (error) {
          console.error(`[standalone-server] Failed to recompile ${framework}/${filename}:`, error)
        }
      })
    }

    watchers.push(watcher)
  }

  return watchers
}

// Default scenarios for standalone usage
const defaultScenarios: Record<string, ScenarioDefinition> = {
  'hello-world': {
    id: 'hello-world',
    title: 'Hello World',
    description: 'Basic hello world block example',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'hello-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Hello World',
            message: 'Welcome to Block Protocol!'
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state) => [{
      blockId: 'hello-block',
      blockType: 'https://blockprotocol.org/@blockprotocol/blocks/hello-world/v1',
      entityId: state.graph.entities[0]?.entityId || 'hello-entity',
      displayMode: 'multi-line',
      entityGraph: state.graph,
      supportsHotReload: false,
      initialHeight: 200
    }],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find(e => e.entityId === update.entityId)
      if (entity) {
        entity.properties = { ...entity.properties, ...update.properties }
      }
    }
  }
}

/**
 * Start the standalone Block Protocol development server
 */
export async function startStandaloneServer(options: StandaloneServerOptions = {}) {
  const {
    port = 4173,
    host = '0.0.0.0',
    frameworks = ['solidjs', 'vue', 'svelte', 'lit', 'angular'],
    enableHotReload = true,
    enableVite = process.env.NODE_ENV !== 'production',
    frameworkDirs,
    outputDir,
    attachSignalHandlers = false,
    scenarios = defaultScenarios,
    onReady,
    onFrameworkCompiled
  } = options

  const app = express()
  const baseDir = outputDir || path.resolve(process.cwd())
  const frameworkOutputDir = path.join(baseDir, 'dist/frameworks')

  // Framework watchers and bundles
  let frameworkWatchers: FrameworkWatcher[] = []
  let liveSockets = new Set<WebSocket>()
  let socketStates = new Map<WebSocket, { scenario: ScenarioDefinition; state: { graph: EntityGraph } }>()

  // Setup framework watchers if enabled
  if (enableHotReload) {
    try {
      frameworkWatchers = await setupFrameworkWatchers(
        frameworks,
        baseDir,
        frameworkOutputDir,
        frameworkDirs,
        onFrameworkCompiled
      )
      console.log(`[standalone-server] Initialized ${frameworkWatchers.length} framework watchers`)
    } catch (error) {
      console.error('[standalone-server] Failed to setup framework watchers:', error)
    }
  }

  // Serve framework assets
  app.use('/frameworks', express.static(frameworkOutputDir, {
    fallthrough: false,
    index: false,
    cacheControl: false,
    etag: true
  }))

  // Framework bundles API
  app.get('/api/frameworks/bundles', (req, res) => {
    const allBundles: Record<string, any[]> = {}

    for (const watcher of frameworkWatchers) {
      allBundles[watcher.framework] = Array.from(watcher.bundles.values()).map(bundle => ({
        id: bundle.id,
        hash: bundle.hash,
        entryPoint: bundle.entryPoint,
        lastModified: bundle.lastModified.toISOString(),
        assets: bundle.assets
      }))
    }

    res.json({ bundles: allBundles })
  })

  app.get('/api/frameworks/:framework/bundles', (req, res) => {
    const { framework } = req.params
    const watcher = frameworkWatchers.find(w => w.framework === framework)

    if (!watcher) {
      return res.status(404).json({ error: `Framework ${framework} not found` })
    }

    const bundles = Array.from(watcher.bundles.values()).map(bundle => ({
      id: bundle.id,
      hash: bundle.hash,
      entryPoint: bundle.entryPoint,
      lastModified: bundle.lastModified.toISOString(),
      assets: bundle.assets
    }))

    res.json({ bundles })
  })

  // Health check
  app.get('/healthz', (req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      frameworks: frameworkWatchers.map(w => w.framework),
      scenarios: Object.keys(scenarios)
    })
  })

  // Serve static files if Vite is enabled
  let viteServer: ViteDevServer | undefined
  if (enableVite) {
    try {
      const { createServer } = await import('vite')
      viteServer = await createServer({
        root: baseDir,
        server: { middlewareMode: true },
        appType: 'custom'
      })
      app.use(viteServer.middlewares)
    } catch (error) {
      console.warn('[standalone-server] Vite not available, running without middleware')
    }
  }

  // Catch-all handler for SPA
  app.get('*', async (req, res) => {
    if (viteServer) {
      try {
        const url = req.originalUrl
        let html = await fs.readFile(path.join(baseDir, 'index.html'), 'utf8')
        html = await viteServer.transformIndexHtml(url, html)
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
        return
      } catch (error) {
        console.error('[standalone-server] Error serving HTML:', error)
      }
    }

    // Fallback response
    res.status(200).set({ 'Content-Type': 'text/html' }).end(`
<!DOCTYPE html>
<html>
<head>
  <title>Block Protocol Dev Server</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .status { padding: 20px; background: #f0f8ff; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Block Protocol Development Server</h1>
  <div class="status">
    <h2>Server Status: Running</h2>
    <p>Frameworks: ${frameworks.join(', ')}</p>
    <p>Hot Reload: ${enableHotReload ? 'Enabled' : 'Disabled'}</p>
    <p>Scenarios: ${Object.keys(scenarios).join(', ')}</p>
  </div>
  <h3>Available Endpoints:</h3>
  <ul>
    <li><a href="/healthz">/healthz</a> - Health check</li>
    <li><a href="/api/frameworks/bundles">/api/frameworks/bundles</a> - Framework bundles</li>
  </ul>
</body>
</html>
    `)
  })

  const httpServer = createHttpServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (socket, request) => {
    liveSockets.add(socket)

    const requestUrl = new URL(request.url || '/ws', 'http://localhost')
    const scenarioId = requestUrl.searchParams.get('scenario') || 'hello-world'
    const scenario = scenarios[scenarioId] || scenarios['hello-world']
    const state = scenario.createState()

    socketStates.set(socket, { scenario, state })

    socket.send(JSON.stringify({
      type: 'connection_ack',
      timestamp: new Date().toISOString(),
      entityGraph: state.graph,
      scenario: { id: scenario.id, title: scenario.title, description: scenario.description }
    }))

    // Send initial notifications
    const notifications = scenario.buildNotifications(state)
    for (const payload of notifications) {
      socket.send(JSON.stringify({
        type: 'vivafolioblock-notification',
        payload
      }))
    }

    socket.on('close', () => {
      liveSockets.delete(socket)
      socketStates.delete(socket)
    })

    socket.on('message', (raw) => {
      try {
        const payload = JSON.parse(String(raw))
        if (payload?.type !== 'graph/update') return

        const connection = socketStates.get(socket)
        if (!connection || !connection.scenario.applyUpdate) return

        connection.scenario.applyUpdate({
          state: connection.state,
          update: payload.payload,
          socket,
          broadcast: (notification) => {
            socket.send(JSON.stringify({
              type: 'vivafolioblock-notification',
              payload: notification
            }))
          }
        })

        socket.send(JSON.stringify({ type: 'graph/ack', receivedAt: new Date().toISOString() }))

        // Send updated notifications
        const notifications = connection.scenario.buildNotifications(connection.state)
        for (const payload of notifications) {
          socket.send(JSON.stringify({
            type: 'vivafolioblock-notification',
            payload
          }))
        }
      } catch (error) {
        console.error('[standalone-server] failed to process message', error)
      }
    })
  })

  const close = async () => {
    console.log('[standalone-server] shutting down...')

    // Close WebSocket connections
    for (const socket of liveSockets) {
      try {
        socket.close()
      } catch (error) {
        console.error('[standalone-server] failed to close socket', error)
      }
    }
    liveSockets.clear()
    socketStates.clear()

    // Close framework watchers
    for (const watcher of frameworkWatchers) {
      if (watcher.watcher) {
        watcher.watcher.close()
      }
    }
    frameworkWatchers = []

    // Close Vite server
    if (viteServer) {
      await viteServer.close()
    }

    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  // Attach signal handlers if requested
  if (attachSignalHandlers) {
    const handler = async () => {
      await close()
      process.exit(0)
    }
    process.on('SIGINT', handler)
    process.on('SIGTERM', handler)
  }

  // Start the server
  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, resolve)
  })

  const address = httpServer.address()
  const printableHost = typeof address === 'object' && address
    ? address.address === '::' || address.address === '0.0.0.0' ? 'localhost' : address.address
    : host === '::' || host === '0.0.0.0' ? 'localhost' : host
  const printablePort = typeof address === 'object' && address ? address.port : port

  const url = `http://${printableHost}:${printablePort}`
  console.log(`[standalone-server] listening on ${url}`)
  console.log(`[standalone-server] frameworks: ${frameworks.join(', ')}`)
  console.log(`[standalone-server] hot reload: ${enableHotReload ? 'enabled' : 'disabled'}`)

  onReady?.(url)

  return {
    url,
    port: printablePort,
    host: printableHost,
    close,
    frameworkWatchers,
    scenarios: Object.keys(scenarios)
  }
}

/**
 * CLI entry point for npx usage
 */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2)
  const options: StandaloneServerOptions = {}

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    switch (arg) {
      case '--port':
      case '-p':
        options.port = parseInt(nextArg, 10)
        i++
        break
      case '--host':
      case '-h':
        options.host = nextArg
        i++
        break
      case '--frameworks':
      case '-f':
        options.frameworks = nextArg.split(',') as any
        i++
        break
      case '--no-hot-reload':
        options.enableHotReload = false
        break
      case '--no-vite':
        options.enableVite = false
        break
      case '--help':
        console.log(`
Block Protocol Development Server

Usage: npx @vivafolio/blockprotocol-dev-server [options]

Options:
  -p, --port <port>          Port to listen on (default: 4173)
  -h, --host <host>          Host to bind to (default: 0.0.0.0)
  -f, --frameworks <list>    Frameworks to enable (default: solidjs,vue,svelte,lit,angular)
  --no-hot-reload           Disable hot reload
  --no-vite                 Disable Vite middleware
  --help                    Show this help

Examples:
  npx @vivafolio/blockprotocol-dev-server --port 3000
  npx @vivafolio/blockprotocol-dev-server --frameworks solidjs,vue --no-hot-reload
        `)
        process.exit(0)
    }
  }

  startStandaloneServer(options).catch((error) => {
    console.error('[standalone-server] failed to start', error)
    process.exit(1)
  })
}
