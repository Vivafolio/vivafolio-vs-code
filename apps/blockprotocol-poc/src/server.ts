import express from 'express'
import { createServer as createHttpServer } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { readFileSync, existsSync } from 'fs'

import type { ViteDevServer } from 'vite'

interface Entity {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
}

interface LinkEntity extends Entity {
  sourceEntityId?: string
  destinationEntityId?: string
}

interface EntityGraph {
  entities: Entity[]
  links: LinkEntity[]
}

interface ScenarioState {
  graph: EntityGraph
}

interface GraphUpdate {
  blockId: string
  kind: 'updateEntity'
  entityId: string
  properties: Record<string, unknown>
}

interface VivafolioBlockNotificationPayload {
  blockId: string
  blockType: string
  entityId: string
  displayMode: 'multi-line' | 'inline'
  initialGraph: EntityGraph
  supportsHotReload?: boolean
  initialHeight?: number
  resources?: Array<{
    logicalName: string
    physicalPath: string
    cachingTag?: string
  }>
}

interface UpdateContext {
  state: ScenarioState
  update: GraphUpdate
  socket: WebSocket
  broadcast: (payload: VivafolioBlockNotificationPayload) => void
}

interface ScenarioDefinition {
  id: string
  title: string
  description: string
  createState(): ScenarioState
  buildNotifications(state: ScenarioState): VivafolioBlockNotificationPayload[]
  applyUpdate?(context: UpdateContext): void
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number.parseInt(process.env.PORT || '', 10) || 4173
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_CLIENT_DIR = path.resolve(ROOT_DIR, 'dist/client')
const INDEX_HTML = path.resolve(ROOT_DIR, 'index.html')
const TEMPLATES_DIR = path.resolve(ROOT_DIR, 'templates')
const TEST_BLOCK_DIST_DIR = path.resolve(
  ROOT_DIR,
  'node_modules',
  'test-npm-block',
  'dist'
)
function findRepoRoot(startDir = ROOT_DIR) {
  let current = startDir
  const { root } = path.parse(current)
  while (current !== root) {
    if (
      existsSync(path.join(current, '.git')) ||
      existsSync(path.join(current, 'pnpm-workspace.yaml')) ||
      (existsSync(path.join(current, 'apps')) && existsSync(path.join(current, 'third_party')))
    ) {
      return current
    }
    current = path.dirname(current)
  }
  return ROOT_DIR
}

const REPO_ROOT = findRepoRoot()

const HTML_TEMPLATE_BLOCK_DIR = path.resolve(
  REPO_ROOT,
  'third_party',
  'blockprotocol',
  'libs',
  'block-template-html'
)
const HTML_TEMPLATE_BLOCK_SRC_DIR = path.join(HTML_TEMPLATE_BLOCK_DIR, 'src')
const HTML_TEMPLATE_BLOCK_PUBLIC_DIR = path.join(HTML_TEMPLATE_BLOCK_DIR, 'public')
const HTML_TEMPLATE_BLOCK_METADATA_PATH = path.join(
  HTML_TEMPLATE_BLOCK_DIR,
  'block-metadata.json'
)

const HTML_TEMPLATE_PUBLIC_DIR = path.resolve(
  REPO_ROOT,
  'apps',
  'blockprotocol-poc',
  'external',
  'html-template-block'
)
const HTML_TEMPLATE_PUBLIC_SRC_DIR = path.join(HTML_TEMPLATE_PUBLIC_DIR, 'src')
const HTML_TEMPLATE_PUBLIC_ASSETS_DIR = path.join(HTML_TEMPLATE_PUBLIC_DIR, 'public')
const HTML_TEMPLATE_PUBLIC_METADATA_PATH = path.join(
  HTML_TEMPLATE_PUBLIC_DIR,
  'block-metadata.json'
)
const TEST_BLOCK_MANIFEST_PATH = path.resolve(TEST_BLOCK_DIST_DIR, 'assets-manifest.json')

interface TestBlockAssets {
  bundle: string
  icon: string
  preview: string
}

const testBlockAssets = loadTestBlockAssets()
console.log('[blockprotocol-poc] html template dir', HTML_TEMPLATE_BLOCK_DIR)

const entityGraph: EntityGraph = {
  entities: [],
  links: []
}

const liveSockets = new Set<WebSocket>()
const socketStates = new Map<
  WebSocket,
  {
    scenario: ScenarioDefinition
    state: ScenarioState
  }
>()

let resourceCounter = 0

function nextCachingTag() {
  resourceCounter += 1
  return `v${resourceCounter}`
}

function loadTestBlockAssets(): TestBlockAssets {
  const fallback: TestBlockAssets = {
    bundle: '/external/test-npm-block/main.js',
    icon: '/external/test-npm-block/public/omega.svg',
    preview: '/external/test-npm-block/public/block-preview.svg'
  }

  try {
    if (!existsSync(TEST_BLOCK_MANIFEST_PATH)) {
      return fallback
    }

    const manifestRaw = readFileSync(TEST_BLOCK_MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(manifestRaw) as Record<string, string>
    const bundleName = manifest['main.js'] ?? 'main.js'
    const iconName = manifest['public/omega.svg'] ?? 'public/omega.svg'
    const previewName = manifest['public/block-preview.svg'] ?? 'public/block-preview.svg'

    return {
      bundle: `/external/test-npm-block/${bundleName}`,
      icon: `/external/test-npm-block/${iconName}`,
      preview: `/external/test-npm-block/${previewName}`
    }
  } catch (error) {
    console.warn('[blockprotocol-poc] Failed to load test-npm-block manifest', error)
    return fallback
  }
}

function createHelloWorldGraph(): EntityGraph {
  const blockEntity: Entity = {
    entityId: 'entity-hello-world',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/person/v1',
    properties: {
      name: 'Vivafolio Explorer',
      message: 'Welcome to the Block Protocol POC!',
      timestamp: new Date().toISOString()
    }
  }

  return { entities: [blockEntity], links: [] }
}

function createKanbanGraph(): EntityGraph {
  const tasks: Entity[] = [
    {
      entityId: 'task-1',
      entityTypeId: 'https://vivafolio.dev/entity-types/task/v1',
      properties: {
        title: 'Design nested block API',
        assigneeId: 'user-1',
        status: 'todo',
        description: 'Sketch how Kanban, task and user profile blocks communicate.'
      }
    },
    {
      entityId: 'task-2',
      entityTypeId: 'https://vivafolio.dev/entity-types/task/v1',
      properties: {
        title: 'Implement host scaffolding',
        assigneeId: 'user-2',
        status: 'doing',
        description: 'Serve nested block resources via the simulated host.'
      }
    },
    {
      entityId: 'task-3',
      entityTypeId: 'https://vivafolio.dev/entity-types/task/v1',
      properties: {
        title: 'Write Playwright coverage',
        assigneeId: 'user-1',
        status: 'done',
        description: 'Assert that task and user blocks render within the board.'
      }
    }
  ]

  const users: Entity[] = [
    {
      entityId: 'user-1',
      entityTypeId: 'https://vivafolio.dev/entity-types/user/v1',
      properties: {
        name: 'Dana Developer',
        role: 'Frontend',
        avatar: '🧪'
      }
    },
    {
      entityId: 'user-2',
      entityTypeId: 'https://vivafolio.dev/entity-types/user/v1',
      properties: {
        name: 'Sam Systems',
        role: 'Platform',
        avatar: '🧰'
      }
    }
  ]

  const board: Entity = {
    entityId: 'kanban-board-1',
    entityTypeId: 'https://vivafolio.dev/entity-types/board/v1',
    properties: {
      title: 'Iteration Zero',
      columns: buildBoardColumns(tasks)
    }
  }

  const links: LinkEntity[] = tasks.map((task) => ({
    entityId: `link-${task.entityId}-assignee`,
    entityTypeId: 'https://vivafolio.dev/link-types/assignee/v1',
    properties: {},
    sourceEntityId: task.entityId,
    destinationEntityId: String(task.properties.assigneeId ?? '')
  }))

  return { entities: [board, ...tasks, ...users], links }
}

function buildBoardColumns(tasks: Entity[]) {
  const order = [
    { id: 'todo', title: 'To Do' },
    { id: 'doing', title: 'In Progress' },
    { id: 'done', title: 'Done' }
  ]
  return order.map(({ id, title }) => ({
    id,
    title,
    taskIds: tasks
      .filter((task) => (task.properties.status ?? 'todo') === id)
      .map((task) => task.entityId)
  }))
}

const scenarios: Record<string, ScenarioDefinition> = {
  'hello-world': {
    id: 'hello-world',
    title: 'Milestone 0 – Hello World',
    description: 'Single hello-world block verifying baseline Block Protocol wiring.',
    createState: () => ({ graph: createHelloWorldGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'hello-block-1',
        blockType: 'https://blockprotocol.org/@local/blocks/hello-world/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'entity-hello-world',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 240
      }
    ]
  },
  'nested-kanban': {
    id: 'nested-kanban',
    title: 'Milestone 1 – Nested Kanban',
    description:
      'Nested Kanban board rendering task and user profile blocks to exercise composition.',
    createState: () => ({ graph: createKanbanGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'kanban-board-1',
        blockType: 'https://vivafolio.dev/blocks/kanban-board/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'kanban-board-1',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 420
      }
    ]
  },
  'multi-view-sync': {
    id: 'multi-view-sync',
    title: 'Milestone 2 – Multi-view Synchronization',
    description:
      'Kanban and task list views editing the same tasks; updates propagate via graph/update.',
    createState: () => ({ graph: createKanbanGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'kanban-board-1',
        blockType: 'https://vivafolio.dev/blocks/kanban-board/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'kanban-board-1',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 420
      },
      {
        blockId: 'task-list-1',
        blockType: 'https://vivafolio.dev/blocks/task-list/v1',
        entityId: 'kanban-board-1',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 320,
        resources: [
          {
            logicalName: 'task-list.html',
            physicalPath: '/templates/task-list.html',
            cachingTag: nextCachingTag()
          }
        ]
      }
    ],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }

      if (entity.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1') {
        const tasks = state.graph.entities.filter(
          (item) => item.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1'
        )
        const board = state.graph.entities.find(
          (item) => item.entityId === 'kanban-board-1'
        )
        if (board) {
          board.properties = {
            ...board.properties,
            columns: buildBoardColumns(tasks)
          }
        }
      }

      // Notifications will be dispatched after the update handler completes.
    }
  },
  'iframe-webviews': {
    id: 'iframe-webviews',
    title: 'Milestone 3 – IFrame Webviews',
    description:
      'Blocks served via resources loaded in sandboxed iframes to mirror VS Code webviews.',
    createState: () => ({ graph: createKanbanGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'iframe-kanban-1',
        blockType: 'https://vivafolio.dev/blocks/iframe-kanban/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'kanban-board-1',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 360,
        resources: [
          {
            logicalName: 'kanban.html',
            physicalPath: '/templates/kanban-iframe.html',
            cachingTag: nextCachingTag()
          }
        ]
      },
      {
        blockId: 'iframe-task-list-1',
        blockType: 'https://vivafolio.dev/blocks/iframe-task-list/v1',
        entityId: 'kanban-board-1',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 280,
        resources: [
          {
            logicalName: 'task-list.html',
            physicalPath: '/templates/task-list-iframe.html',
            cachingTag: nextCachingTag()
          }
        ]
      }
    ],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }

      if (entity.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1') {
        const tasks = state.graph.entities.filter(
          (item) => item.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1'
        )
        const board = state.graph.entities.find((item) => item.entityId === 'kanban-board-1')
        if (board) {
          board.properties = {
            ...board.properties,
            columns: buildBoardColumns(tasks)
          }
        }
      }
    }
  },
  'real-test-block': {
    id: 'real-test-block',
    title: 'Milestone 4 – Published Block Snapshot',
    description:
      'Loads metadata from the published test-npm-block package and exposes its bundle assets.',
    createState: () => ({ graph: createTestBlockGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'test-npm-block',
        blockType: 'https://blockprotocol.org/@blockprotocol/blocks/test-npm-block/v0',
        entityId: state.graph.entities[0]?.entityId ?? 'test-npm-block',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 280,
        resources: [
          {
            logicalName: 'block-metadata.json',
            physicalPath: '/external/test-npm-block/block-metadata.json',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'main.js',
            physicalPath: testBlockAssets.bundle,
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'icon.svg',
            physicalPath: testBlockAssets.icon,
            cachingTag: nextCachingTag()
          }
        ]
      },
      {
        blockId: 'test-npm-block-secondary',
        blockType: 'https://blockprotocol.org/@blockprotocol/blocks/test-npm-block/v0',
        entityId: state.graph.entities[0]?.entityId ?? 'test-npm-block',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 280,
        resources: [
          {
            logicalName: 'block-metadata.json',
            physicalPath: '/external/test-npm-block/block-metadata.json',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'main.js',
            physicalPath: testBlockAssets.bundle,
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'icon.svg',
            physicalPath: testBlockAssets.icon,
            cachingTag: nextCachingTag()
          }
        ]
      }
    ],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
    }
  },
  'html-template-block': {
    id: 'html-template-block',
    title: 'Milestone 4 – HTML Template Block',
    description:
      'Executes the HTML-based block template to validate iframe-style loading and CommonJS diagnostics.',
    createState: () => ({ graph: createHtmlTemplateGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'html-template-block-1',
        blockType: 'https://blockprotocol.org/@blockprotocol/blocks/html-template/v0',
        entityId: state.graph.entities[0]?.entityId ?? 'html-template-block-entity',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 320,
        resources: [
          {
            logicalName: 'block-metadata.json',
            physicalPath: '/external/html-template-block/block-metadata.json',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'app.html',
            physicalPath: '/external/html-template-block/src/app.html',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'app.js',
            physicalPath: '/external/html-template-block/src/app.js',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'icon.svg',
            physicalPath: '/external/html-template-block/public/omega.svg',
            cachingTag: nextCachingTag()
          }
        ]
      }
    ],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
    }
  }
}

function createTestBlockGraph(): EntityGraph {
  try {
    const metadataPath = path.join(TEST_BLOCK_DIST_DIR, 'block-metadata.json')
    if (!existsSync(metadataPath)) throw new Error('metadata missing')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'))
    return {
      entities: [
        {
          entityId: 'test-npm-block',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: metadata
        }
      ],
      links: []
    }
  } catch (error) {
    console.error('[blockprotocol-poc] Failed to load test-npm-block metadata', error)
    return {
      entities: [
        {
          entityId: 'test-npm-block',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: { error: 'Unable to load metadata' }
        }
      ],
      links: []
    }
  }
}

async function ensureHtmlTemplateAssets() {
  await fs.mkdir(HTML_TEMPLATE_PUBLIC_SRC_DIR, { recursive: true })
  await fs.mkdir(HTML_TEMPLATE_PUBLIC_ASSETS_DIR, { recursive: true })

  const copies = [
    { from: HTML_TEMPLATE_BLOCK_METADATA_PATH, to: HTML_TEMPLATE_PUBLIC_METADATA_PATH },
    { from: path.join(HTML_TEMPLATE_BLOCK_SRC_DIR, 'app.html'), to: path.join(HTML_TEMPLATE_PUBLIC_SRC_DIR, 'app.html') },
    { from: path.join(HTML_TEMPLATE_BLOCK_SRC_DIR, 'app.js'), to: path.join(HTML_TEMPLATE_PUBLIC_SRC_DIR, 'app.js') },
    { from: path.join(HTML_TEMPLATE_BLOCK_PUBLIC_DIR, 'omega.svg'), to: path.join(HTML_TEMPLATE_PUBLIC_ASSETS_DIR, 'omega.svg') }
  ]

  await Promise.all(
    copies.map(async ({ from, to }) => {
      await fs.copyFile(from, to)
    })
  )
}

function createHtmlTemplateGraph(): EntityGraph {
  const namePropertyBase = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
  const namePropertyVersioned = `${namePropertyBase}v/1`
  const entity: Entity = {
    entityId: 'html-template-block-entity',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
    properties: {
      [namePropertyBase]: 'Vivafolio Template Block',
      [namePropertyVersioned]: 'Vivafolio Template Block'
    }
  }

  return { entities: [entity], links: [] }
}

function dispatchScenarioNotifications(
  socket: WebSocket,
  scenario: ScenarioDefinition,
  state: ScenarioState
) {
  const notifications = scenario.buildNotifications(state)
  for (const payload of notifications) {
    socket.send(
      JSON.stringify({
        type: 'vivafolioblock-notification',
        payload
      })
    )
  }
}

function dumpExpressStack(app: express.Express) {
  // @ts-ignore Express internals – safe for debugging
  const stack = app._router?.stack ?? []
  console.log('[routes] dump start')
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .map((method) => method.toUpperCase())
        .join(',')
      console.log(`[routes] ${methods} ${layer.route.path}`)
    } else if (layer.name === 'router' && layer.regexp) {
      console.log(`[routes] MOUNT ${layer.regexp}`)
      for (const sub of layer.handle.stack) {
        if (sub.route) {
          const methods = Object.keys(sub.route.methods)
            .map((method) => method.toUpperCase())
            .join(',')
          console.log(`[routes]   ${methods} ${sub.route.path}`)
        }
      }
    }
  }
  console.log('[routes] dump end')
}

async function bootstrap() {
  const app = express()

  console.log('[boot] entry', { file: __filename, cwd: process.cwd(), argv: process.argv })

  await ensureHtmlTemplateAssets()

  app.use('/external/test-npm-block', express.static(TEST_BLOCK_DIST_DIR))
  app.get('/external/html-template-block/block-metadata.json', (req, res, next) => {
    res.sendFile(HTML_TEMPLATE_PUBLIC_METADATA_PATH, (err) => {
      if (err) next(err)
    })
  })
  app.get('/external/html-template-block/src/:asset', (req, res, next) => {
    const filePath = path.join(HTML_TEMPLATE_PUBLIC_SRC_DIR, req.params.asset)
    res.sendFile(filePath, (err) => {
      if (err) next(err)
    })
  })
  app.get('/external/html-template-block/public/:asset', (req, res, next) => {
    const filePath = path.join(HTML_TEMPLATE_PUBLIC_ASSETS_DIR, req.params.asset)
    res.sendFile(filePath, (err) => {
      if (err) next(err)
    })
  })
  app.use('/templates', express.static(TEMPLATES_DIR))

  dumpExpressStack(app)

  let viteServer: ViteDevServer | undefined

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite')
    viteServer = await createServer({
      root: ROOT_DIR,
      server: { middlewareMode: true },
      appType: 'custom'
    })
    app.use(viteServer.middlewares)
  } else {
    app.use(express.static(DIST_CLIENT_DIR, { index: false }))
  }

  app.use(express.json())

  app.get('/api/graph', (_req, res) => {
    res.json(entityGraph)
  })

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() })
  })

  app.get('*', async (req, res, next) => {
    try {
      if (viteServer) {
        const url = req.originalUrl
        let html = await fs.readFile(INDEX_HTML, 'utf8')
        html = await viteServer.transformIndexHtml(url, html)
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
        return
      }

      const html = await fs.readFile(path.join(DIST_CLIENT_DIR, 'index.html'), 'utf8')
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
    } catch (error) {
      next(error)
    }
  })

  const httpServer = createHttpServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (socket, request) => {
    liveSockets.add(socket)

    const requestUrl = new URL(request.url ?? '/ws', 'http://localhost')
    const scenarioId = requestUrl.searchParams.get('scenario') ?? 'hello-world'
    const scenario = scenarios[scenarioId] ?? scenarios['hello-world']
    const state = scenario.createState()
    socketStates.set(socket, { scenario, state })

    entityGraph.entities = state.graph.entities
    entityGraph.links = state.graph.links

    socket.send(
      JSON.stringify({
        type: 'connection_ack',
        timestamp: new Date().toISOString(),
        entityGraph: state.graph,
        scenario: { id: scenario.id, title: scenario.title, description: scenario.description }
      })
    )

    dispatchScenarioNotifications(socket, scenario, state)

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
          update: payload.payload as GraphUpdate,
          socket,
          broadcast: (notification) => {
            socket.send(
              JSON.stringify({
                type: 'vivafolioblock-notification',
                payload: notification
              })
            )
          }
        })
        entityGraph.entities = connection.state.graph.entities
        entityGraph.links = connection.state.graph.links

        socket.send(JSON.stringify({ type: 'graph/ack', receivedAt: new Date().toISOString() }))
        dispatchScenarioNotifications(socket, connection.scenario, connection.state)
      } catch (error) {
        console.error('[blockprotocol-poc] failed to process message', error)
      }
    })
  })

  httpServer.listen(PORT, () => {
    console.log(`[blockprotocol-poc] server listening on http://localhost:${PORT}`)
    console.log(
      `[blockprotocol-poc] mode=${process.env.NODE_ENV ?? 'development'} root=${ROOT_DIR}`
    )
  })

  function shutdown(signal: NodeJS.Signals) {
    console.log(`[blockprotocol-poc] received ${signal}, shutting down`)
    for (const socket of liveSockets) {
      try {
        socket.close()
      } catch (error) {
        console.error('[blockprotocol-poc] failed to close socket', error)
      }
    }
    wss.close()
    httpServer.close(() => {
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

bootstrap().catch((error) => {
  console.error('[blockprotocol-poc] failed to start server', error)
  process.exit(1)
})
