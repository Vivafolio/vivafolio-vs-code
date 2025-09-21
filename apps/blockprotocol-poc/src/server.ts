/**
 * Block Protocol POC Development Server
 *
 * This file implements a comprehensive development server for validating the Block Protocol
 * integration in Vivafolio. It serves as both a web server and WebSocket server that simulates
 * the Vivafolio extension environment for testing and development.
 *
 * Key Features:
 * - HTTP server serving static assets and HTML templates
 * - WebSocket server for real-time Block Protocol communication
 * - Framework compilation and hot-reload for SolidJS, Vue, Svelte, Lit, Angular
 * - Multiple test scenarios (hello-world, kanban, iframe-webviews, etc.)
 * - Entity graph management and update propagation
 * - Performance monitoring and health checks
 *
 * The server can run in different modes:
 * - Basic mode: Static assets only
 * - Framework mode: With hot-reload compilation for framework examples
 * - Production mode: Optimized static serving with compression
 */

import express from 'express'
import compression from 'compression'
import { createServer as createHttpServer } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import { IndexingService } from '../../../packages/indexing-service/dist/IndexingService.js'
import { IndexingServiceTransportLayer, WebSocketTransport } from './TransportLayer.js'
import { BlockBuilder } from '../../../blocks/dist/builder.js'
import { SidecarLspClient, MockLspServerImpl } from './SidecarLspClient.js'
import { BlockResourcesCache } from '../../../packages/block-resources-cache/dist/index.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { readFileSync, existsSync, watch, statSync, mkdirSync } from 'fs'
import crypto from 'crypto'

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
  buildNotifications(state: ScenarioState, request?: any): VivafolioBlockNotificationPayload[]
  applyUpdate?(context: UpdateContext): void
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Respect PORT=0 for ephemeral port selection; treat only undefined/NaN as missing
const DEFAULT_PORT = (() => {
  const raw = process.env.PORT
  if (raw === undefined) return 4173
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? 4173 : n
})()
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_CLIENT_DIR = path.resolve(ROOT_DIR, 'dist/client')
const INDEX_HTML = path.resolve(ROOT_DIR, 'index.html')
const TEMPLATES_DIR = path.resolve(ROOT_DIR, 'templates')

// Production-optimized static asset serving configuration
function createOptimizedStaticOptions(maxAge: number = 31536000) { // 1 year default
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    fallthrough: false,
    index: false,
    etag: true,
    lastModified: true,
    cacheControl: isProduction,
    setHeaders: (res: any, path: string) => {
      // Set content type for JSON files
      if (path.endsWith('.json')) {
        res.type('application/json')
      }

      // Set cache headers for production
      if (isProduction) {
        const ext = path.split('.').pop()?.toLowerCase()

        // Static assets with content hashing can be cached aggressively
        if (ext === 'js' || ext === 'css' || path.includes('-')) {
          res.setHeader('Cache-Control', `public, max-age=${maxAge}, immutable`)
        }
        // HTML files should not be cached aggressively
        else if (ext === 'html') {
          res.setHeader('Cache-Control', 'public, max-age=300') // 5 minutes
        }
        // Other assets get shorter cache
        else {
          res.setHeader('Cache-Control', `public, max-age=${maxAge / 10}`) // 1 month
        }

        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'DENY')
      }
    }
  }
}
function findRepoRoot(startDir = ROOT_DIR) {
  // Finds the repository root by looking for git directory, pnpm workspace, or specific app structure
  // This helps locate vendored third-party dependencies and shared assets
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

export interface FrameworkBundle {
  id: string
  hash: string
  assets: string[]
  metadata: Record<string, unknown>
  entryPoint: string
  lastModified: Date
}

interface FrameworkWatcher {
  framework: string
  sourceDir: string
  outputDir: string
  watcher?: ReturnType<typeof watch>
  bundles: Map<string, FrameworkBundle>
}

interface StartServerOptions {
  port?: number
  host?: string
  attachSignalHandlers?: boolean
  enableVite?: boolean
  enableFrameworkWatch?: boolean
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
let globalFrameworkWatchers: FrameworkWatcher[] = []

function nextCachingTag() {
  // Generates a unique cache-busting tag for resources to ensure browsers fetch fresh content
  // Used in VivafolioBlock notifications to invalidate cached resources
  resourceCounter += 1
  return `v${resourceCounter}`
}

// Framework compilation helpers
function generateAssetHash(content: string): string {
  // Creates a content-based hash for cache busting and integrity checking
  // Ensures that when asset content changes, the URL changes too
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8)
}

async function compileSolidJSBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
  // Compiles a SolidJS block component into a browser-compatible bundle
  // Creates a simple CommonJS wrapper around the SolidJS code for execution
  // This is a placeholder implementation - real compilation would use esbuild or similar
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const hash = generateAssetHash(sourceContent)

  // For now, create a simple CommonJS wrapper
  // In a real implementation, this would use esbuild or similar
  const compiledContent = `
(function() {
  const React = { createElement: function(tag, props, ...children) {
    if (typeof tag === 'function') {
      return tag(props || {}, children);
    }
    const el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(key => {
        if (key === 'className') {
          el.className = props[key];
        } else if (key === 'style') {
          Object.assign(el.style, props[key]);
        } else if (key.startsWith('on') && typeof props[key] === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), props[key]);
        } else {
          el.setAttribute(key, props[key]);
        }
      });
    }
    children.forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child) {
        el.appendChild(child);
      }
    });
    return el;
  }};

  ${sourceContent}

  if (typeof module !== 'undefined' && module.exports) {
    return module.exports;
  }
  return StatusPillBlock;
})();
`

  const outputFile = path.join(outputPath, `solidjs-${hash}.js`)
  await fs.mkdir(outputPath, { recursive: true })
  await fs.writeFile(outputFile, compiledContent, 'utf8')

  return {
    id: `solidjs-${path.basename(sourcePath, path.extname(sourcePath))}`,
    hash,
    assets: [`solidjs-${hash}.js`],
    metadata: {
      framework: 'solidjs',
      sourcePath,
      compiledAt: new Date().toISOString()
    },
    entryPoint: `solidjs-${hash}.js`,
    lastModified: new Date()
  }
}

async function compileVueBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const hash = generateAssetHash(sourceContent)

  // Simple Vue compilation placeholder
  const compiledContent = `
(function() {
  const Vue = {
    createApp: function(component) {
      return {
        mount: function(el) {
          console.log('Vue block mounted:', component);
          el.innerHTML = '<div class="vue-block">Vue Block Component</div>';
        }
      };
    }
  };

  ${sourceContent}

  return { default: VueBlock };
})();
`

  const outputFile = path.join(outputPath, `vue-${hash}.js`)
  await fs.mkdir(outputPath, { recursive: true })
  await fs.writeFile(outputFile, compiledContent, 'utf8')

  return {
    id: `vue-${path.basename(sourcePath, path.extname(sourcePath))}`,
    hash,
    assets: [`vue-${hash}.js`],
    metadata: {
      framework: 'vue',
      sourcePath,
      compiledAt: new Date().toISOString()
    },
    entryPoint: `vue-${hash}.js`,
    lastModified: new Date()
  }
}

async function compileSvelteBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const hash = generateAssetHash(sourceContent)

  // Simple Svelte compilation placeholder
  const compiledContent = `
(function() {
  ${sourceContent}

  return { default: SvelteBlock };
})();
`

  const outputFile = path.join(outputPath, `svelte-${hash}.js`)
  await fs.mkdir(outputPath, { recursive: true })
  await fs.writeFile(outputFile, compiledContent, 'utf8')

  return {
    id: `svelte-${path.basename(sourcePath, path.extname(sourcePath))}`,
    hash,
    assets: [`svelte-${hash}.js`],
    metadata: {
      framework: 'svelte',
      sourcePath,
      compiledAt: new Date().toISOString()
    },
    entryPoint: `svelte-${hash}.js`,
    lastModified: new Date()
  }
}

async function compileLitBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const hash = generateAssetHash(sourceContent)

  // Simple Lit compilation placeholder
  const compiledContent = `
(function() {
  ${sourceContent}

  return { LitBlock };
})();
`

  const outputFile = path.join(outputPath, `lit-${hash}.js`)
  await fs.mkdir(outputPath, { recursive: true })
  await fs.writeFile(outputFile, compiledContent, 'utf8')

  return {
    id: `lit-${path.basename(sourcePath, path.extname(sourcePath))}`,
    hash,
    assets: [`lit-${hash}.js`],
    metadata: {
      framework: 'lit',
      sourcePath,
      compiledAt: new Date().toISOString()
    },
    entryPoint: `lit-${hash}.js`,
    lastModified: new Date()
  }
}

async function compileAngularBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const hash = generateAssetHash(sourceContent)

  // Simple Angular compilation placeholder
  const compiledContent = `
(function() {
  ${sourceContent}

  return { AngularBlock };
})();
`

  const outputFile = path.join(outputPath, `angular-${hash}.js`)
  await fs.mkdir(outputPath, { recursive: true })
  await fs.writeFile(outputFile, compiledContent, 'utf8')

  return {
    id: `angular-${path.basename(sourcePath, path.extname(sourcePath))}`,
    hash,
    assets: [`angular-${hash}.js`],
    metadata: {
      framework: 'angular',
      sourcePath,
      compiledAt: new Date().toISOString()
    },
    entryPoint: `angular-${hash}.js`,
    lastModified: new Date()
  }
}

function getFrameworkCompiler(framework: string) {
  // Returns the appropriate compilation function for a given framework
  // Each framework (SolidJS, Vue, Svelte, Lit, Angular) has its own compilation strategy
  switch (framework) {
    case 'solidjs': return compileSolidJSBlock
    case 'vue': return compileVueBlock
    case 'svelte': return compileSvelteBlock
    case 'lit': return compileLitBlock
    case 'angular': return compileAngularBlock
    default: throw new Error(`Unsupported framework: ${framework}`)
  }
}

async function setupFrameworkWatchers(): Promise<FrameworkWatcher[]> {
  // Sets up file watchers for framework examples to enable hot-reload during development
  // Monitors source directories for changes and recompiles blocks automatically
  // Supports SolidJS, Vue, Svelte, Lit, and Angular frameworks
  const watchers: FrameworkWatcher[] = []
  const frameworksDir = path.resolve(ROOT_DIR, 'libs/block-frameworks')
  const outputDir = path.resolve(ROOT_DIR, 'dist/frameworks')

  const frameworks = ['solidjs', 'vue', 'svelte', 'lit', 'angular']

  for (const framework of frameworks) {
    const sourceDir = path.join(frameworksDir, framework, 'examples')
    const frameworkOutputDir = path.join(outputDir, framework)

    if (!existsSync(sourceDir)) {
      console.log(`[framework-watch] Skipping ${framework} - examples directory not found`)
      continue
    }

    const watcher: FrameworkWatcher = {
      framework,
      sourceDir,
      outputDir: frameworkOutputDir,
      bundles: new Map()
    }

    // Initial compilation of existing blocks
    try {
      const files = await fs.readdir(sourceDir)
      const compiler = getFrameworkCompiler(framework)

      for (const file of files) {
        if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.vue') || file.endsWith('.svelte')) {
          const sourcePath = path.join(sourceDir, file)
          const bundle = await compiler(sourcePath, frameworkOutputDir)
          watcher.bundles.set(bundle.id, bundle)
          console.log(`[framework-watch] Compiled ${framework}/${file} -> ${bundle.entryPoint}`)
        }
      }
    } catch (error) {
      console.error(`[framework-watch] Failed to compile ${framework} blocks:`, error)
    }

    // Setup file watcher for hot reload
    watcher.watcher = watch(sourceDir, { recursive: true }, async (event, filename) => {
      if (!filename || !filename.match(/\.(tsx|ts|js|vue|svelte)$/)) return

      try {
        const sourcePath = path.join(sourceDir, filename)
        const compiler = getFrameworkCompiler(framework)
        const bundle = await compiler(sourcePath, frameworkOutputDir)

        watcher.bundles.set(bundle.id, bundle)
        console.log(`[framework-watch] Recompiled ${framework}/${filename} -> ${bundle.entryPoint}`)

        // Notify connected clients about the update
        for (const socket of liveSockets) {
          socket.send(JSON.stringify({
            type: 'framework-update',
            framework,
            bundle: {
              id: bundle.id,
              hash: bundle.hash,
              entryPoint: bundle.entryPoint,
              lastModified: bundle.lastModified.toISOString()
            }
          }))
        }
      } catch (error) {
        console.error(`[framework-watch] Failed to recompile ${framework}/${filename}:`, error)
      }
    })

    watchers.push(watcher)
    console.log(`[framework-watch] Watching ${framework} blocks in ${sourceDir}`)
  }

  return watchers
}


function createHelloWorldGraph(): EntityGraph {
  // Creates a simple entity graph for the hello-world scenario
  // Demonstrates basic Block Protocol entity structure with a single person entity
  // Used in Milestone 0 to verify basic Block Protocol wiring
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
  // Creates a complex entity graph for Kanban board scenarios (Milestones 1-3)
  // Includes tasks, users, and board structure to demonstrate nested block composition
  // Shows how different block types (task, user, board) can work together
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
  // Organizes tasks into Kanban board columns based on their status
  // Groups tasks by 'todo', 'doing', 'done' status for board visualization
  // Returns column structure with task IDs for each status
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
    buildNotifications: (state, request) => [
      {
        blockId: 'hello-block-1',
        blockType: 'https://blockprotocol.org/@local/blocks/hello-world/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'entity-hello-world',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 240
      }
    ]
  },
  'indexing-service': {
    id: 'indexing-service',
    title: 'Indexing Service Demo',
    description: 'Real-time file indexing with Block Protocol - shows entities from IndexingService.',
    createState: () => ({
      graph: {
        entities: [], // Will be populated from IndexingService in connection handler
        links: []
      }
    }),
    buildNotifications: (state) => {
      // This will be handled specially in the WebSocket connection handler
      return []
    }
  },
  'custom': {
    id: 'custom',
    title: 'Custom Block Test',
    description: 'Dynamic block loading for testing local development.',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'custom-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: { name: 'Custom Test Entity' }
        }],
        links: []
      }
    }),
    buildNotifications: (state, request) => {
      // Extract block parameter from custom params (passed from WebSocket)
      const blockParam = (request as any)?.block || 'test-hello-block'
      const entityIdParam = (request as any)?.entityId
      console.log('[custom-scenario] blockParam:', blockParam, 'entityIdParam:', entityIdParam)

      // Check if this is a local block (starts with @)
      const isLocalBlock = blockParam.startsWith('@')
      const blockType = isLocalBlock
        ? `https://blockprotocol.org/@local/blocks/${blockParam.replace('@', '')}/v1`
        : `https://vivafolio.dev/blocks/${blockParam}/v1`
      console.log('[custom-scenario] isLocalBlock:', isLocalBlock, 'blockType:', blockType)

      // For local blocks, provide resources that point to cache URLs
      const resources = isLocalBlock ? [
        {
          logicalName: 'block-metadata.json',
          physicalPath: `/cache/${blockParam}/latest/block-metadata.json`,
          cachingTag: 'v1'
        },
        {
          logicalName: 'app.html',
          physicalPath: `/cache/${blockParam}/latest/index.html`,
          cachingTag: 'v1'
        }
      ] : undefined

      return [
        {
          blockId: `custom-block-1`,
          blockType,
          entityId: entityIdParam || state.graph.entities[0]?.entityId || 'custom-entity',
          displayMode: 'multi-line',
          entityGraph: state.graph,
          supportsHotReload: true,
          initialHeight: 400,
          resources
        }
      ]
    }
  },
  'nested-kanban': {
    id: 'nested-kanban',
    title: 'Milestone 1 – Nested Kanban',
    description:
      'Nested Kanban board rendering task and user profile blocks to exercise composition.',
    createState: () => ({ graph: createKanbanGraph() }),
    buildNotifications: (state, request) => [
      {
        blockId: 'kanban-board-1',
        blockType: 'https://vivafolio.dev/blocks/kanban-board/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'kanban-board-1',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 420
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
    }
  },
  'multi-view-sync': {
    id: 'multi-view-sync',
    title: 'Milestone 2 – Multi-view Synchronization',
    description:
      'Kanban and task list views editing the same tasks; updates propagate via graph/update.',
    createState: () => ({ graph: createKanbanGraph() }),
    buildNotifications: (state, request) => [
      {
        blockId: 'kanban-board-1',
        blockType: 'https://vivafolio.dev/blocks/kanban-board/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'kanban-board-1',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 420
      },
      {
        blockId: 'task-list-1',
        blockType: 'https://vivafolio.dev/blocks/task-list/v1',
        entityId: 'kanban-board-1',
        displayMode: 'multi-line',
        entityGraph: state.graph,
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
    buildNotifications: (state, request) => [
      {
        blockId: 'iframe-kanban-1',
        blockType: 'https://vivafolio.dev/blocks/iframe-kanban/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'kanban-board-1',
        displayMode: 'multi-line',
        entityGraph: state.graph,
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
        entityGraph: state.graph,
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
    buildNotifications: (state, request) => [
      {
        blockId: 'feature-showcase-block',
        blockType: 'https://blockprotocol.org/@blockprotocol/blocks/feature-showcase/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'feature-showcase-block',
        displayMode: 'multi-line',
        entityGraph: state.graph,
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
    buildNotifications: (state, request) => [
      {
        blockId: 'html-template-block-1',
        blockType: 'https://blockprotocol.org/@blockprotocol/blocks/html-template/v0',
        entityId: state.graph.entities[0]?.entityId ?? 'html-template-block-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
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
    buildNotifications: (state, request) => [
      {
        blockId: 'resource-loader-block-1',
        blockType: 'https://vivafolio.dev/blocks/resource-loader/v1',
        entityId:
          state.graph.entities[0]?.entityId ?? 'resource-loader-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
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
    title: 'F1 – Custom Element Baseline',
    description: 'Minimal WebComponent block demonstrating Graph service integration and entity updates.',
    createState: () => ({ graph: createCustomElementGraph() }),
    buildNotifications: (state, request) => [
      {
        blockId: 'custom-element-block-1',
        blockType: 'https://vivafolio.dev/blocks/custom-element/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'custom-element-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 300,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/external/custom-element-block/main.js',
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
      // Add timestamp for tracking updates
      entity.properties.lastModified = new Date().toISOString()
    }
  },
  'solidjs-task-baseline': {
    id: 'solidjs-task-baseline',
    title: 'F2 – SolidJS Task Baseline',
    description: 'Task management block demonstrating SolidJS helper library integration with Block Protocol.',
    createState: () => ({ graph: createCustomElementGraph() }),
    buildNotifications: (state, request) => [
      {
        blockId: 'solidjs-task-block-1',
        blockType: 'https://vivafolio.dev/blocks/solidjs-task/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'solidjs-task-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 300,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/external/solidjs-task-block/main.js',
            cachingTag: nextCachingTag()
          }
        ]
      }
    ],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
      // Add timestamp for tracking updates
      entity.properties.lastModified = new Date().toISOString()
    }
  },
  'status-pill-example': {
    id: 'status-pill-example',
    title: 'Status Pill Block Example',
    description: 'Demonstrates the StatusPillBlock - a property renderer for status values',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'status-pill-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Status Pill Example',
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Status Pill Example',
            status: 'in-progress'
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state, request) => [
      {
        blockId: 'status-pill-example-1',
        blockType: 'https://vivafolio.dev/blocks/status-pill/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'status-pill-entity',
        displayMode: 'inline',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 40,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/examples/blocks/status-pill/general-block.umd.js',
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
  'person-chip-example': {
    id: 'person-chip-example',
    title: 'Person Chip Block Example',
    description: 'Demonstrates the PersonChipBlock - shows assignees with avatars',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'person-chip-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Person Chip Example',
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Person Chip Example',
            assignees: ['alice', 'bob']
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state, request) => [
      {
        blockId: 'person-chip-example-1',
        blockType: 'https://vivafolio.dev/blocks/person-chip/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'person-chip-entity',
        displayMode: 'inline',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 40,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/examples/blocks/person-chip/general-block.umd.js',
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
  'table-view-example': {
    id: 'table-view-example',
    title: 'Table View Block Example',
    description: 'Demonstrates the TableViewBlock - spreadsheet-style task display',
    createState: () => ({
      graph: {
        entities: [
          // Main table entity
          {
            entityId: 'table-view-entity',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Table View Example',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Table View Example'
            }
          },
          // Mock table row entities (simulating what indexing service would provide)
          {
            entityId: 'project_tasks-row-0',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'Task Name': 'Design new API',
              'Assignee': 'Alice',
              'Status': 'In Progress',
              'Priority': 'High',
              'Due Date': '2025-09-20'
            }
          },
          {
            entityId: 'project_tasks-row-1',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'Task Name': 'Update documentation',
              'Assignee': 'Bob',
              'Status': 'Completed',
              'Priority': 'Medium',
              'Due Date': '2025-09-15'
            }
          },
          {
            entityId: 'project_tasks-row-2',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'Task Name': 'Fix login bug',
              'Assignee': 'Charlie',
              'Status': 'Not Started',
              'Priority': 'Low',
              'Due Date': '2025-09-25'
            }
          }
        ],
        links: []
      }
    }),
    buildNotifications: (state, request) => [
      {
        blockId: 'table-view-example-1',
        blockType: 'https://vivafolio.dev/blocks/table-view/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'table-view-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 400,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/examples/blocks/table-view/general-block.umd.js',
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
  'board-view-example': {
    id: 'board-view-example',
    title: 'Board View Block Example',
    description: 'Demonstrates the BoardViewBlock - Kanban-style task management',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'board-view-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Board View Example',
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Board View Example'
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state, request) => [
      {
        blockId: 'board-view-example-1',
        blockType: 'https://vivafolio.dev/blocks/board-view/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'board-view-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 600,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/examples/blocks/board-view/general-block.umd.js',
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
  'framework-compilation-demo': {
    id: 'framework-compilation-demo',
    title: 'Framework Compilation Demo',
    description: 'Demonstrates hot-reloaded framework blocks with compilation and serving',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'framework-demo-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Framework Demo',
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Framework Demo',
            status: 'in-progress'
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state) => {
      const notifications: VivafolioBlockNotificationPayload[] = []

      // Add the original static status-pill block
      notifications.push({
        blockId: 'status-pill-static',
        blockType: 'https://vivafolio.dev/blocks/status-pill/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'framework-demo-entity',
        displayMode: 'inline',
        entityGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 40,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/examples/blocks/status-pill/main.js',
            cachingTag: nextCachingTag()
          }
        ]
      })

      // Add compiled framework versions if available
      for (const watcher of globalFrameworkWatchers) {
        const solidjsBundles = watcher.bundles.get('solidjs-status-pill')
        if (solidjsBundles && watcher.framework === 'solidjs') {
          notifications.push({
            blockId: `status-pill-${watcher.framework}`,
            blockType: `https://vivafolio.dev/blocks/status-pill-${watcher.framework}/v1`,
            entityId: state.graph.entities[0]?.entityId ?? 'framework-demo-entity',
            displayMode: 'inline',
            entityGraph: state.graph,
            supportsHotReload: true,
            initialHeight: 40,
            resources: [
              {
                logicalName: 'main.js',
                physicalPath: `/frameworks/${watcher.framework}/${solidjsBundles.entryPoint}`,
                cachingTag: solidjsBundles.hash
              }
            ]
          })
        }
      }

      return notifications
    },
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
    }
  },
  'cross-framework-nesting': {
    id: 'cross-framework-nesting',
    title: 'Cross-Framework Nesting Demo',
    description: 'Demonstrates nested blocks from different frameworks sharing the same Graph service',
    createState: () => ({
      graph: {
        entities: [
          {
            entityId: 'parent-entity',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Cross-Framework Parent',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Cross-Framework Parent'
            }
          },
          {
            entityId: 'child-entity-1',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'SolidJS Child',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'SolidJS Child',
              status: 'todo'
            }
          },
          {
            entityId: 'child-entity-2',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Vue Child',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Vue Child',
              status: 'in-progress'
            }
          }
        ],
        links: []
      }
    }),
    buildNotifications: (state) => {
      const notifications: VivafolioBlockNotificationPayload[] = []

      // Parent block (using existing implementation)
      notifications.push({
        blockId: 'parent-block',
        blockType: 'https://vivafolio.dev/blocks/parent/v1',
        entityId: 'parent-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 200,
        resources: [
          {
            logicalName: 'main.js',
            physicalPath: '/external/custom-element-block/main.js',
            cachingTag: nextCachingTag()
          }
        ]
      })

      // Child blocks from different frameworks
      const solidjsWatcher = globalFrameworkWatchers.find((w: FrameworkWatcher) => w.framework === 'solidjs')
      if (solidjsWatcher) {
        const solidjsBundle = solidjsWatcher.bundles.get('solidjs-task-block')
        if (solidjsBundle) {
          notifications.push({
            blockId: 'child-solidjs',
            blockType: 'https://vivafolio.dev/blocks/child-solidjs/v1',
            entityId: 'child-entity-1',
            displayMode: 'inline',
            entityGraph: state.graph,
            supportsHotReload: true,
            initialHeight: 60,
            resources: [
              {
                logicalName: 'main.js',
                physicalPath: `/frameworks/solidjs/${solidjsBundle.entryPoint}`,
                cachingTag: solidjsBundle.hash
              }
            ]
          })
        }
      }

      const vueWatcher = globalFrameworkWatchers.find((w: FrameworkWatcher) => w.framework === 'vue')
      if (vueWatcher) {
        const vueBundle = vueWatcher.bundles.get('vue-task-block')
        if (vueBundle) {
          notifications.push({
            blockId: 'child-vue',
            blockType: 'https://vivafolio.dev/blocks/child-vue/v1',
            entityId: 'child-entity-2',
            displayMode: 'inline',
            entityGraph: state.graph,
            supportsHotReload: true,
            initialHeight: 60,
            resources: [
              {
                logicalName: 'main.js',
                physicalPath: `/frameworks/vue/${vueBundle.entryPoint}`,
                cachingTag: vueBundle.hash
              }
            ]
          })
        }
      }

      return notifications
    },
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
    }
  }
}


async function ensureHtmlTemplateAssets() {
  // Ensures HTML template block assets are copied to the public directory
  // Copies block metadata, HTML templates, and assets from third_party/blockprotocol
  // Required for HTML-based block scenarios that load content in iframes
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
      [namePropertyVersioned]: 'Custom Element Baseline',
      title: 'Custom Element Baseline',
      description: 'Demonstrates vanilla WebComponent integration',
      status: 'todo'
    }
  }

  return { entities: [entity], links: [] }
}

function dispatchScenarioNotifications(
  socket: WebSocket,
  scenario: ScenarioDefinition,
  state: ScenarioState,
  request?: any
) {
  // Sends VivafolioBlock notifications for a scenario to a connected WebSocket client
  // Converts scenario definition into Block Protocol notification payloads
  // Each notification tells the client to render a specific block with entity data
  console.log('[Server] dispatchScenarioNotifications called for scenario:', scenario.id)
  const notifications = scenario.buildNotifications(state, request)
  console.log('[Server] Built', notifications.length, 'notifications')
  for (const payload of notifications) {
    console.log('[Server] Sending notification:', JSON.stringify({
      type: 'vivafolioblock-notification',
      payload: {
        blockId: payload.blockId,
        blockType: payload.blockType,
        entityId: payload.entityId
      }
    }, null, 2))
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
  // Main server startup function - initializes HTTP server, WebSocket server, and all middleware
  // Configures Express app with routes, static serving, compression, and Vite integration
  // Sets up WebSocket connections for real-time Block Protocol communication
  // Handles framework watching, scenario management, and entity graph updates
  const port = options.port ?? DEFAULT_PORT
  const host = options.host ?? '0.0.0.0'
  const attachSignalHandlers = options.attachSignalHandlers ?? true
  const enableVite = options.enableVite ?? process.env.NODE_ENV !== 'production'
  const enableFrameworkWatch = options.enableFrameworkWatch ?? process.env.ENABLE_FRAMEWORK_WATCH === 'true'

  const app = express()

  // Enable compression for all responses in production
  if (process.env.NODE_ENV === 'production') {
    app.use(compression({
      level: 6, // Good balance between compression and speed
      threshold: 1024, // Only compress responses larger than 1KB
      filter: (req, res) => {
        // Don't compress event streams or already compressed content
        if (req.headers['accept-encoding']?.includes('br')) {
          return false
        }
        return compression.filter(req, res)
      }
    }))
  }

// Framework watchers and bundles
let frameworkWatchers: FrameworkWatcher[] = []

// Local Block Development
let localBlockDirs: string[] = []
let localBlockWatchers: Map<string, { watcher: any, dispose: () => void }> = new Map()
let localBlockBuilder: BlockBuilder | undefined

  // Initialize indexing service
  const indexingService = new IndexingService({
    watchPaths: [
      // Only scan for direct data files - CSV and Markdown files
      // vivafolio_data! constructs in .viv files are handled via LSP notifications
      path.join(ROOT_DIR, '..', '..', 'test', 'projects')
    ],
    supportedExtensions: ['csv', 'md'], // Only direct data files, not source files
    excludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/vivafolio-data-examples/**']
  })

  // Initialize transport layer
  const transportLayer = new IndexingServiceTransportLayer(indexingService)

  // Broadcast function for LSP-driven block notifications
  const broadcastLspNotification = (notification: VivafolioBlockNotificationPayload) => {
    // Only broadcast to LSP-driven sockets (not in socketStates = not scenario-driven)
    for (const socket of liveSockets) {
      if (!socketStates.has(socket)) {
        try {
          socket.send(
            JSON.stringify({
              type: 'vivafolioblock-notification',
              payload: notification
            })
          )
        } catch (error) {
          console.error('[broadcast] Error sending LSP notification to socket:', error)
        }
      }
    }
  }

  // Initialize mock LSP server and sidecar client
  const lspServer = new MockLspServerImpl()
  const sidecarLspClient = new SidecarLspClient(indexingService, lspServer, broadcastLspNotification)

  // Initialize block resources cache
  const blockResourcesCache = new BlockResourcesCache({
    maxSize: 100 * 1024 * 1024, // 100MB cache
    ttl: 24 * 60 * 60 * 1000,   // 24 hours
    maxEntries: 1000,
    cacheDir: path.join(process.cwd(), '.block-cache'),
  })

  // Initialize block builder for framework compilation
  const blockBuilder = new BlockBuilder({
    frameworks: ['solidjs', 'vue', 'svelte', 'lit', 'angular'],
    outputDir: path.join(process.cwd(), 'dist', 'blocks'),
    watchMode: false, // We'll handle hot reload through the existing framework watchers
    onBundleUpdate: (framework, bundle) => {
      console.log(`[block-builder] Bundle updated: ${framework}/${bundle.id}`)
    }
  })

  // Initialize local block development if directories are specified
  const localDirsParam = process.env.LOCAL_BLOCK_DIRS || process.argv.find(arg => arg.startsWith('--local-block-dirs='))?.split('=')[1]
  if (localDirsParam) {
    localBlockDirs = localDirsParam.split(',').map(dir => dir.trim())
    console.log('[blockprotocol-poc] Local block directories:', localBlockDirs)

    // Initialize local block builder
    localBlockBuilder = new BlockBuilder({
      frameworks: ['solidjs', 'vue', 'svelte', 'lit', 'angular'],
      outputDir: path.join(process.cwd(), 'dist', 'local-blocks'),
      watchMode: true,
      onBundleUpdate: (framework, bundle) => {
        console.log(`[local-block-builder] Bundle updated: ${framework}/${bundle.id}`)
        // Broadcast cache invalidation to connected clients
        broadcastLocalBlockUpdate(bundle.id)
      }
    })

    // Set up watchers for local directories
    for (const dir of localBlockDirs) {
      setupLocalBlockWatcher(dir)
    }
  }

  console.log('[blockprotocol-poc] html template dir', HTML_TEMPLATE_BLOCK_DIR)

  await ensureHtmlTemplateAssets()

// Set up file watcher for a local block directory
function setupLocalBlockWatcher(dirPath: string): void {
  try {
    const resolvedPath = path.resolve(dirPath)
    console.log(`[local-block-watcher] Setting up watcher for: ${resolvedPath}`)

    // Ensure the directory exists
    if (!existsSync(resolvedPath)) {
      mkdirSync(resolvedPath, { recursive: true })
      console.log(`[local-block-watcher] Created directory: ${resolvedPath}`)
    }

    // Use Node.js fs.watch for file monitoring
    const watcher = watch(resolvedPath, { recursive: true }, (eventType, filename) => {
      if (filename) {
        const filePath = path.join(resolvedPath, filename)
        console.log(`[local-block-watcher] ${eventType} detected: ${filePath}`)

        // Only process relevant source files
        const ext = path.extname(filePath)
        const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.html', '.css', '.json']

        if (relevantExtensions.includes(ext)) {
          handleLocalBlockFileChange(filePath, eventType as 'change' | 'rename')
        }
      }
    })

    localBlockWatchers.set(resolvedPath, {
      watcher,
      dispose: () => {
        watcher.close()
        console.log(`[local-block-watcher] Cleaned up watcher for ${resolvedPath}`)
      }
    })

  } catch (error) {
    console.error(`[local-block-watcher] Failed to set up watcher for ${dirPath}:`, error)
  }
}

// Handle file changes in local block directories
function handleLocalBlockFileChange(filePath: string, changeType: 'change' | 'rename'): void {
  console.log(`[local-block-watcher] Processing ${changeType} for: ${filePath}`)

  // The localBlockBuilder will handle the rebuild automatically due to watchMode: true
  // The onBundleUpdate callback will broadcast the update
}

// Broadcast local block updates to connected clients
function broadcastLocalBlockUpdate(blockId: string): void {
  console.log(`[local-block-broadcast] Broadcasting update for block: ${blockId}`)

  // Send cache invalidation to all connected WebSocket clients
  for (const socket of liveSockets) {
    try {
      socket.send(JSON.stringify({
        type: 'cache:invalidate',
        payload: { blockId }
      }))
    } catch (error) {
      console.error('[local-block-broadcast] Error broadcasting to socket:', error)
    }
  }
}

// Helper function to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// Helper function to get content type from file extension
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.js':
    case '.mjs':
      return 'application/javascript'
    case '.css':
      return 'text/css'
    case '.html':
      return 'text/html'
    case '.json':
      return 'application/json'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'text/plain'
  }
}

  // Setup framework watchers if enabled
  if (enableFrameworkWatch) {
    try {
      frameworkWatchers = await setupFrameworkWatchers()
      globalFrameworkWatchers = frameworkWatchers
      console.log(`[framework-watch] Initialized ${frameworkWatchers.length} framework watchers`)
    } catch (error) {
      console.error('[framework-watch] Failed to setup framework watchers:', error)
    }
  }

  // Start indexing service
  try {
    await indexingService.start()
    console.log('[indexing-service] Indexing service started')
  } catch (error) {
    console.error('[indexing-service] Failed to start indexing service:', error)
  }

  // Start sidecar LSP client
  try {
    await sidecarLspClient.start()
    console.log('[sidecar-lsp] Sidecar LSP client started')
  } catch (error) {
    console.error('[sidecar-lsp] Failed to start sidecar LSP client:', error)
  }

  // Block resources cache middleware with local block priority
  app.use('/cache/:package/:version/*', async (req, res, next) => {
    try {
      const { package: packageName, version } = req.params
      const resourcePath = (req.params as any)[0] // Everything after package/version/

      // First, check if this block exists in local directories
      if (localBlockDirs.length > 0) {
        for (const localDir of localBlockDirs) {
          try {
            // Try to find the block in local directory
            const localBlockPath = path.join(localDir, packageName)
            const localResourcePath = path.join(localBlockPath, resourcePath)

            if (await fileExists(localResourcePath)) {
              console.log(`[cache-middleware] Serving local block resource: ${localResourcePath}`)
              const content = await fs.readFile(localResourcePath, 'utf8')
              const contentType = getContentType(resourcePath)

              res.set({
                'Content-Type': contentType,
                'Cache-Control': 'no-cache', // Local files should not be cached
                'X-Cache-Status': 'LOCAL',
                'X-Local-Block': 'true'
              })
              res.send(content)
              return
            }
          } catch (error) {
            // Continue to next local directory or remote source
          }
        }
      }

      // Fall back to remote cache
      const cacheResult = await blockResourcesCache.fetchBlock({
        name: packageName,
        version: version === 'latest' ? undefined : version
      })

      if (cacheResult.success && cacheResult.data) {
        // Find the specific resource
        const resource = cacheResult.data.resources.get(resourcePath)
        if (resource) {
          res.set({
            'Content-Type': resource.contentType,
            'Cache-Control': 'public, max-age=31536000', // 1 year
            'X-Cache-Status': 'HIT',
            'ETag': resource.etag || `"${resource.sha256.slice(0, 8)}"`
          })
          res.send(resource.content)
          return
        }
      }

      // Cache miss or error - add cache status header
      res.set('X-Cache-Status', 'MISS')
      next()
    } catch (error) {
      console.warn('[cache-middleware] Cache error:', error)
      res.set('X-Cache-Status', 'ERROR')
      next()
    }
  })

  // Static asset serving with production optimizations
  app.use('/external/html-template-block', express.static(HTML_TEMPLATE_PUBLIC_DIR, createOptimizedStaticOptions()))
  app.use('/external/resource-loader-block', express.static(RESOURCE_LOADER_BLOCK_DIR, createOptimizedStaticOptions()))
  app.use('/external/feature-showcase-block', express.static(path.resolve(ROOT_DIR, 'external/feature-showcase-block'), createOptimizedStaticOptions()))
  app.use('/external/custom-element-block', express.static(path.resolve(ROOT_DIR, 'external/custom-element-block'), createOptimizedStaticOptions()))
  app.use('/external/solidjs-task-block', express.static(path.resolve(ROOT_DIR, 'external/solidjs-task-block'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/status-pill', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/status-pill'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/person-chip', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/person-chip'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/table-view', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/table-view'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/board-view', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/board-view'), createOptimizedStaticOptions()))
  app.use('/templates', express.static(TEMPLATES_DIR, createOptimizedStaticOptions()))

  // Framework compiled assets with aggressive caching for hashed bundles
  app.use('/frameworks', express.static(path.resolve(ROOT_DIR, 'dist/frameworks'), createOptimizedStaticOptions()))

  // Also serve general blocks from /frameworks/general/ for bundle size tests
  app.use('/frameworks/general', express.static(path.resolve(ROOT_DIR, 'dist/frameworks'), createOptimizedStaticOptions()))

  // Serve SolidJS blocks from their individual directories
  app.use('/examples/blocks/solidjs-board-view', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/solidjs/board-view'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/solidjs-table-view', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/solidjs/table-view'), createOptimizedStaticOptions()))

  // Framework bundles API
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

  // Performance monitoring endpoint
  app.get('/api/performance', (req, res) => {
    const performance = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      },
      bundles: Array.from(globalFrameworkWatchers || []).map(watcher => ({
        framework: watcher.framework,
        bundleCount: watcher.bundles.size,
        bundles: Array.from(watcher.bundles.values()).map(bundle => ({
          id: bundle.id,
          size: bundle.assets.reduce((total, asset) => {
            try {
              const stat = statSync(path.join(ROOT_DIR, 'dist/frameworks', watcher.framework, asset))
              return total + stat.size
            } catch {
              return total
            }
          }, 0),
          lastModified: bundle.lastModified.toISOString(),
          hash: bundle.hash
        }))
      })),
      timestamp: new Date().toISOString()
    }

    res.json(performance)
  })

  // Bundle loading performance tracking
  app.post('/api/performance/bundle-load', express.json(), (req, res) => {
    const { bundleId, loadTime, framework, userAgent } = req.body

    console.log(`[performance] Bundle ${bundleId} (${framework}) loaded in ${loadTime}ms`)

    // In a real implementation, this would be stored in a database or monitoring system
    res.json({ recorded: true, bundleId, loadTime, framework })
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

  wss.on('connection', async (socket, request) => {
    liveSockets.add(socket)

    const requestUrl = new URL(request.url ?? '/ws', 'http://localhost')
    const scenarioId = requestUrl.searchParams.get('scenario') ?? 'hello-world'

    // Extract additional parameters for custom scenario
    const customParams = scenarioId === 'custom' ? {
      block: requestUrl.searchParams.get('block'),
      entityId: requestUrl.searchParams.get('entityId')
    } : {}

    // Always use IndexingService for all scenarios
    const scenario = scenarios[scenarioId] ?? scenarios['hello-world']
    const state = scenario.createState()

    // Special handling for indexing-service scenario
    let entityGraph = state.graph
    if (scenarioId === 'indexing-service') {
      // Get entities from IndexingService for the indexing-service scenario
      const allEntities = indexingService.getAllEntities()
      const entities = allEntities.map((metadata: any) => ({
        entityId: metadata.entityId,
        entityTypeId: metadata.entityTypeId || 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
        properties: metadata.properties,
        sourceType: metadata.sourceType,
        sourcePath: metadata.sourcePath
      }))
      entityGraph = { entities, links: [] }
    }

    // Register transport for Block Protocol operations (for LSP-driven updates)
    const transport = new WebSocketTransport(socket)
    const transportId = transportLayer.registerTransport(transport)
    console.log(`[transport] Registered transport ${transportId} for scenario ${scenario.id}`)

    // Send connection acknowledgment
    socket.send(
      JSON.stringify({
        type: 'connection_ack',
        timestamp: new Date().toISOString(),
        entityGraph,
        scenario: { id: scenario.id, title: scenario.title, description: scenario.description },
        transportId
      })
    )

    // Send block notifications for this scenario
    if (scenarioId === 'indexing-service') {
      // Special handling for indexing-service scenario
      socket.send(
        JSON.stringify({
          type: 'vivafolioblock-notification',
          payload: {
            blockId: 'table-view-block-1',
            blockType: 'https://vivafolio.dev/blocks/table-view/v1',
            entityId: 'table-view-entity',
            displayMode: 'multi-line',
            entityGraph,
            resources: [
              {
                logicalName: 'block-metadata.json',
                physicalPath: '/examples/blocks/table-view/block-metadata.json',
                cachingTag: nextCachingTag()
              },
              {
                logicalName: 'main.js',
                physicalPath: '/examples/blocks/table-view/general-block.umd.js',
                cachingTag: nextCachingTag()
              }
            ],
            supportsHotReload: false,
            initialHeight: 400
          }
        })
      )
    } else {
      dispatchScenarioNotifications(socket, scenario, state, customParams)
    }

    socket.on('close', () => {
      liveSockets.delete(socket)
      socketStates.delete(socket)
      transportLayer.unregisterTransport(transportId)
      console.log(`[transport] Unregistered transport ${transportId}`)
    })

    // All messages go through the IndexingService transport layer
    // For scenarios with applyUpdate (for testing), also handle scenario updates
    socket.on('message', (raw) => {
      try {
        const payload = JSON.parse(String(raw))
        console.log(`[transport] Message received: ${payload.type}`)

        // Handle cache invalidation from local block development
        if (payload?.type === 'cache:invalidate') {
          console.log(`[cache-invalidate] Received invalidation for block: ${payload.payload?.blockId}`)
          // The client should handle this by reloading the block
          return
        }

        // Transport layer handles all Block Protocol operations
        // For scenarios with applyUpdate, also apply updates for testing
        if (payload?.type === 'graph/update' && scenario.applyUpdate) {
          const connection = { scenario, state }
          scenario.applyUpdate({
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
          // Update the entityGraph for consistency
          // Note: In production, all updates would go through IndexingService only
          dispatchScenarioNotifications(socket, scenario, connection.state, request)
        }
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

    // Stop sidecar LSP client
    try {
      await sidecarLspClient.stop()
      console.log('[sidecar-lsp] Sidecar LSP client stopped')
    } catch (error) {
      console.error('[sidecar-lsp] Failed to stop sidecar LSP client:', error)
    }

    // Stop indexing service
    try {
      await indexingService.stop()
      console.log('[indexing-service] Indexing service stopped')
    } catch (error) {
      console.error('[indexing-service] Failed to stop indexing service:', error)
    }

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

    // Clean up framework watchers
    for (const watcher of globalFrameworkWatchers) {
      if (watcher.watcher) {
        watcher.watcher.close()
      }
    }
    globalFrameworkWatchers = []
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
  // Entry point when this file is run directly (not imported as a module)
  // Starts the Block Protocol POC development server with default configuration
  // Handles startup errors and ensures clean process termination
  startServer().catch((error) => {
    console.error('[blockprotocol-poc] failed to start server', error)
    process.exit(1)
  })
}
