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

const DEFAULT_PORT = Number.parseInt(process.env.PORT || '', 10) || 4173
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_CLIENT_DIR = path.resolve(ROOT_DIR, 'dist/client')
const INDEX_HTML = path.resolve(ROOT_DIR, 'index.html')
const TEMPLATES_DIR = path.resolve(ROOT_DIR, 'templates')
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

const RESOURCE_LOADER_BLOCK_DIR = path.resolve(
  REPO_ROOT,
  'apps',
  'blockprotocol-poc',
  'external',
  'resource-loader-block'
)

export interface StartServerOptions {
  port?: number
  host?: string
  attachSignalHandlers?: boolean
  enableVite?: boolean
}

const HTML_TEMPLATE_BLOCK_CLIENT_SOURCE = [
  'const NAME_PROPERTY_BASE = "https://blockprotocol.org/@blockprotocol/types/property-type/name/";',
  'const NAME_PROPERTY_VERSIONED = "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1";',
  '',
  'const element = window.blockprotocol.getBlockContainer(import.meta.url);',
  'const blockId = element.dataset.blockId ?? "html-template-block-1";',
  '',
  'const title = element.querySelector("[data-title]");',
  'const paragraph = element.querySelector("[data-paragraph]");',
  'const input = element.querySelector("[data-input]");',
  'const readonlyParagraph = element.querySelector("[data-readonly]");',
  '',
  'let entity;',
  'let hostApi;',
  '',
  'const applyEntity = (nextEntity) => {',
  '  if (!nextEntity) {',
  '    return;',
  '  }',
  '  entity = nextEntity;',
  '  const baseName =',
  '    entity.properties?.[NAME_PROPERTY_BASE] ??',
  '    entity.properties?.[NAME_PROPERTY_VERSIONED] ??',
  '    entity.properties?.name ??',
  '    "Vivafolio Template Block";',
  '',
  '  const recordId = entity.metadata?.recordId?.entityId ?? entity.entityId ?? "unknown";',
  '  title.textContent = `Hello, ${baseName}`;',
  '  paragraph.textContent = `The entityId of this block is ${recordId}. Use it to update its data when calling updateEntity`;',
  '  input.value = baseName;',
  '  readonlyParagraph.textContent = baseName;',
  '};',
  '',
  'const setReadonly = (readonly) => {',
  '  if (readonly) {',
  '    input.style.display = "none";',
  '    readonlyParagraph.style.display = "block";',
  '  } else {',
  '    input.style.display = "block";',
  '    readonlyParagraph.style.display = "none";',
  '  }',
  '};',
  '',
  'const bridge = window.__vivafolioHtmlTemplateHost;',
  'if (bridge && typeof bridge.register === "function") {',
  '  hostApi = bridge.register(blockId, {',
  '    setEntity: applyEntity,',
  '    setReadonly',
  '  });',
  '}',
  '',
  'setReadonly(false);',
  '',
  'input.addEventListener("change", (event) => {',
  '  if (!entity || !hostApi || typeof hostApi.updateEntity !== "function") {',
  '    return;',
  '  }',
  '  const value = event.target.value;',
  '  hostApi.updateEntity({',
  '    entityId: entity.metadata?.recordId?.entityId ?? entity.entityId,',
  '    properties: {',
  '      [NAME_PROPERTY_BASE]: value,',
  '      [NAME_PROPERTY_VERSIONED]: value',
  '    }',
  '  });',
  '});'
].join('\n')


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
  'feature-showcase-block': {
    id: 'feature-showcase-block',
    title: 'Milestone 4 – Block Protocol Feature Showcase',
    description:
      'Demonstrates the Block Protocol graph module with @blockprotocol/graph@0.3.4 and stdlib integration.',
    createState: () => ({ graph: createFeatureShowcaseGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'feature-showcase-block',
        blockType: 'https://blockprotocol.org/@blockprotocol/blocks/feature-showcase/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'feature-showcase-block',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 280,
        resources: [
          {
            logicalName: 'block-metadata.json',
            physicalPath: '/external/feature-showcase-block/block-metadata.json',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'main.js',
            physicalPath: '/external/feature-showcase-block/main.js',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'icon.svg',
            physicalPath: '/external/feature-showcase-block/public/icon.svg',
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
  },
  'resource-loader': {
    id: 'resource-loader',
    title: 'Resource Loader – CJS Modules',
    description:
      'Exercises CommonJS require support for local chunks and styles served through the host dev server.',
    createState: () => ({ graph: createResourceLoaderGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'resource-loader-block-1',
        blockType: 'https://vivafolio.dev/blocks/resource-loader/v1',
        entityId:
          state.graph.entities[0]?.entityId ?? 'resource-loader-entity',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 260,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/external/resource-loader-block/main.js',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'chunk.js',
            physicalPath: '/external/resource-loader-block/chunk.js',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'style.css',
            physicalPath: '/external/resource-loader-block/style.css',
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
  'custom-element-baseline': {
    id: 'custom-element-baseline',
    title: 'Custom Element Baseline',
    description:
      'Renders a vanilla custom element block using the helper API to wire Graph services.',
    createState: () => ({ graph: createCustomElementGraph() }),
    buildNotifications: (state) => [
      {
        blockId: 'custom-element-block-1',
        blockType: 'https://vivafolio.dev/blocks/custom-element/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'custom-element-entity',
        displayMode: 'multi-line',
        initialGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 260,
        resources: [
          {
            logicalName: 'block-metadata.json',
            physicalPath: '/external/custom-element-block/block-metadata.json',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'main.js',
            physicalPath: '/external/custom-element-block/main.js',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'helper.js',
            physicalPath: '/external/custom-element-block/helper.js',
            cachingTag: nextCachingTag()
          },
          {
            logicalName: 'style.css',
            physicalPath: '/external/custom-element-block/style.css',
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


async function ensureHtmlTemplateAssets() {
  await fs.mkdir(HTML_TEMPLATE_PUBLIC_SRC_DIR, { recursive: true })
  await fs.mkdir(HTML_TEMPLATE_PUBLIC_ASSETS_DIR, { recursive: true })

  const copies = [
    { from: HTML_TEMPLATE_BLOCK_METADATA_PATH, to: HTML_TEMPLATE_PUBLIC_METADATA_PATH },
    { from: path.join(HTML_TEMPLATE_BLOCK_SRC_DIR, 'app.html'), to: path.join(HTML_TEMPLATE_PUBLIC_SRC_DIR, 'app.html') },
    { from: path.join(HTML_TEMPLATE_BLOCK_PUBLIC_DIR, 'omega.svg'), to: path.join(HTML_TEMPLATE_PUBLIC_ASSETS_DIR, 'omega.svg') }
  ]

  await Promise.all(
    copies.map(async ({ from, to }) => {
      await fs.copyFile(from, to)
    })
  )

  await fs.writeFile(
    path.join(HTML_TEMPLATE_PUBLIC_SRC_DIR, 'app.js'),
    HTML_TEMPLATE_BLOCK_CLIENT_SOURCE,
    'utf8'
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

function createFeatureShowcaseGraph(): EntityGraph {
  const namePropertyBase = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
  const namePropertyVersioned = `${namePropertyBase}v/1`
  const entity: Entity = {
    entityId: 'feature-showcase-block',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
    properties: {
      [namePropertyBase]: 'Block Protocol Feature Showcase',
      [namePropertyVersioned]: 'Block Protocol Feature Showcase',
      version: '0.1.0',
      description: 'Demonstrates the Block Protocol graph module with stdlib integration'
    }
  }

  return { entities: [entity], links: [] }
}

function createResourceLoaderGraph(): EntityGraph {
  const namePropertyBase = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
  const namePropertyVersioned = `${namePropertyBase}v/1`
  const entity: Entity = {
    entityId: 'resource-loader-entity',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
    properties: {
      [namePropertyBase]: 'CJS Resource Block',
      [namePropertyVersioned]: 'CJS Resource Block'
    }
  }

  return { entities: [entity], links: [] }
}

function createCustomElementGraph(): EntityGraph {
  const namePropertyBase = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
  const namePropertyVersioned = `${namePropertyBase}v/1`
  const entity: Entity = {
    entityId: 'custom-element-entity',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
    properties: {
      [namePropertyBase]: 'Custom Element Baseline',
      [namePropertyVersioned]: 'Custom Element Baseline'
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

export async function startServer(options: StartServerOptions = {}) {
  const port = options.port ?? DEFAULT_PORT
  const host = options.host ?? '0.0.0.0'
  const attachSignalHandlers = options.attachSignalHandlers ?? true
  const enableVite = options.enableVite ?? process.env.NODE_ENV !== 'production'

  const app = express()

  console.log('[blockprotocol-poc] html template dir', HTML_TEMPLATE_BLOCK_DIR)

  await ensureHtmlTemplateAssets()

  app.use(
    '/external/html-template-block',
    express.static(HTML_TEMPLATE_PUBLIC_DIR, {
      fallthrough: false,
      index: false,
      cacheControl: false,
      etag: true,
      setHeaders(res, servedPath) {
        if (servedPath.endsWith('.json')) {
          res.type('application/json')
        }
      }
    })
  )

  app.use('/external/resource-loader-block', express.static(RESOURCE_LOADER_BLOCK_DIR))
  app.use('/external/feature-showcase-block', express.static(path.resolve(ROOT_DIR, 'external/feature-showcase-block')))
  app.use('/templates', express.static(TEMPLATES_DIR))

  dumpExpressStack(app)

  let viteServer: ViteDevServer | undefined

  if (enableVite) {
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

  const signalHandlers: Array<[NodeJS.Signals, NodeJS.SignalsListener]> = []

  const close = async () => {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler)
    }

    for (const socket of liveSockets) {
      try {
        socket.close()
      } catch (error) {
        console.error('[blockprotocol-poc] failed to close socket', error)
      }
    }
    liveSockets.clear()
    socketStates.clear()

    await new Promise<void>((resolve) => {
      wss.close(() => resolve())
    })

    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })

    if (viteServer) {
      await viteServer.close()
    }
  }

  if (attachSignalHandlers) {
    const handler: NodeJS.SignalsListener = async (signal) => {
      console.log(`[blockprotocol-poc] received ${signal}, shutting down`)
      try {
        await close()
      } finally {
        process.exit(0)
      }
    }
    signalHandlers.push(['SIGINT', handler], ['SIGTERM', handler])
    for (const [sig, fn] of signalHandlers) {
      process.on(sig, fn)
    }
  }

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, resolve)
  })

  const address = httpServer.address()
  const printableHost =
    typeof address === 'object' && address
      ? address.address === '::' || address.address === '0.0.0.0'
        ? 'localhost'
        : address.address
      : host === '::' || host === '0.0.0.0'
        ? 'localhost'
        : host
  const printablePort =
    typeof address === 'object' && address ? address.port : port

  console.log(`[blockprotocol-poc] server listening on http://${printableHost}:${printablePort}`)
  console.log(`[blockprotocol-poc] mode=${process.env.NODE_ENV ?? 'development'} root=${ROOT_DIR}`)

  return { app, httpServer, wss, close }
}

if (process.argv[1] === __filename) {
  startServer().catch((error) => {
    console.error('[blockprotocol-poc] failed to start server', error)
    process.exit(1)
  })
}
