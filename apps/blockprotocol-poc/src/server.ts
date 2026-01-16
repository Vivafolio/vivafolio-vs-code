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
import { WebSocketServer, WebSocket } from 'ws'
// Local runtime transport and sidecar pieces stay as static imports
import { IndexingServiceTransportLayer, WebSocketTransport } from './TransportLayer.js'
import { SidecarLspClient, MockLspServerImpl } from './SidecarLspClient.js'
// Monorepo-internal packages are loaded from their built dist outputs to keep dev/prod consistent
// Types can be imported if needed, but runtime binding happens at module init
// import type { IndexingService as IndexingServiceType } from '../../../packages/indexing-service/dist/IndexingService.js'
// import type { BlockBuilder as BlockBuilderType } from '../../../blocks/dist/builder.js'
// import type { BlockResourcesCache as BlockResourcesCacheType } from '../../../packages/block-resources-cache/dist/index.js'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import fs from 'fs/promises'
import { readFileSync, existsSync, readdirSync } from 'fs'
import crypto from 'crypto'
import { BlockResourcesCache, type BlockIdentifier, type BlockResource, type CacheEntry } from '@vivafolio/block-resources-cache'

import type { ViteDevServer } from 'vite'
import type { AggregateArgs, AggregateResult, Entity, LinkEntity, EntityGraph, VivafolioBlockNotification } from '@vivafolio/block-core'


// Using shared Entity, LinkEntity, and EntityGraph from block-core via block-loader

interface ScenarioState {
  graph: EntityGraph
}

interface GraphUpdate {
  blockId: string
  kind: 'updateEntity'
  entityId: string
  properties: Record<string, unknown>
}

interface UpdateContext {
  state: ScenarioState
  update: GraphUpdate
  socket: WebSocket
  broadcast: (payload: VivafolioBlockNotification) => void
}

interface ScenarioDefinition {
  id: string
  title: string
  description: string
  createState(): ScenarioState
  buildNotifications(state: ScenarioState, request?: any): VivafolioBlockNotification[]
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
// App directory resolution
// In development (tsx), __dirname resolves to .../apps/blockprotocol-poc/src
// In production (node),   __dirname resolves to .../apps/blockprotocol-poc/dist/server
// We normalize both the project root (source) and the build root (dist) for reliable pathing.
const APP_DIR = path.resolve(__dirname, '..')
const IS_PROD = process.env.NODE_ENV === 'production'
// When built, APP_DIR === <project>/dist/server; project root sits two levels up
// Source layout: <project>/src; Build layout: <project>/dist/server
const PROJECT_ROOT = IS_PROD ? path.resolve(APP_DIR, '..') : APP_DIR
// Preserve legacy naming for existing code paths
const ROOT_DIR = PROJECT_ROOT
// Build root is <project>/dist
const BUILD_ROOT = IS_PROD ? path.resolve(PROJECT_ROOT, 'dist') : path.resolve(PROJECT_ROOT, 'dist')

// Client/dist directories and key files
// Vite builds client assets into <project>/dist/client per vite.config.ts
const DIST_CLIENT_DIR = path.resolve(BUILD_ROOT, 'client')
// In production we serve the built index from dist/client; in development (Vite middleware)
// we should read the source index.html from the project root for proper transformation.
const DIST_INDEX_HTML = path.resolve(DIST_CLIENT_DIR, 'index.html')
const SOURCE_INDEX_HTML = path.resolve(PROJECT_ROOT, 'index.html')
const TEMPLATES_DIR = path.resolve(PROJECT_ROOT, 'templates')

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

        // Add security headers: allow same-origin iframes (needed for iframe-based blocks)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'SAMEORIGIN')
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

const INDEXING_SERVICE_DIST_PATH = path.resolve(REPO_ROOT, 'packages/indexing-service/dist/index.js')
const BLOCKS_SERVER_DIST_PATH = path.resolve(REPO_ROOT, 'blocks/dist/server.js')

// Load monorepo packages from compiled output so dev/prod share the same artifacts
const { IndexingService } = await import(pathToFileURL(INDEXING_SERVICE_DIST_PATH).href)
const { startBlockServer } = await import(pathToFileURL(BLOCKS_SERVER_DIST_PATH).href)

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

export interface FrameworkBundle {
  id: string
  hash: string
  assets: string[]
  metadata: Record<string, unknown>
  entryPoint: string
  lastModified: Date
}

interface StartServerOptions {
  port?: number
  host?: string
  attachSignalHandlers?: boolean
  enableVite?: boolean
  blockServerPort?: number
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

// --- Status Pill tasks.csv integration helpers --------------------------------
// We materialize status metadata directly from statusOptionsConfig.json so the UI reflects
// labels/colors configured by content authors rather than hard-coded enums.
const TASKS_CSV_BASENAME = 'tasks.csv'
const STATUS_PILL_CONFIG_BASENAME = 'statusOptionsConfig.json'
const CSV_ROW_ID_REGEX = /-row-(\d+)$/

function cloneEntityMetadata(entity: Entity): Entity {
  const cloned: Entity = {
    ...entity,
    properties: { ...(entity.properties ?? {}) }
  }
  if ((entity as any).metadata) {
    ; (cloned as any).metadata = JSON.parse(JSON.stringify((entity as any).metadata))
  }
  return cloned
}

function extractRowIndex(entityId: string): number {
  const match = entityId.match(CSV_ROW_ID_REGEX)
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY
}

const liveSockets = new Set<WebSocket>()
const socketStates = new Map<
  WebSocket,
  {
    scenario: ScenarioDefinition
    state: ScenarioState
    context?: Record<string, unknown>
  }
>()

let resourceCounter = 0
let blockResourcesCache: BlockResourcesCache | undefined
let blockServerInvalidationClient: WebSocket | undefined

// Build a cache key for the current block server origin (used by the cache storage)
function blockCacheIdentifier(blockName: string): BlockIdentifier {
  return { name: blockName, version: 'latest', registry: blockServerOrigin }
}

// Write a minimal manifest for a block into the shared cache and the in-memory map
async function persistBlockResourcesToCache(
  blockName: string,
  metadata: any,
  resources: Array<{ logicalName: string, physicalPath: string, cachingTag: string }>
) {
  blockResourceCache.set(blockName, { origin: blockServerOrigin, resources })
  if (!blockResourcesCache) return

  try {
    const manifest = {
      metadata: { ...metadata, __origin: blockServerOrigin },
      resources
    }
    const manifestContent = JSON.stringify(manifest)
    const manifestResource: BlockResource = {
      url: `${blockServerOrigin}/blocks/${blockName}/block-metadata.json`,
      content: manifestContent,
      contentType: 'application/json',
      sha256: crypto.createHash('sha256').update(manifestContent).digest('hex'),
      size: Buffer.byteLength(manifestContent, 'utf8')
    }
    const entry: CacheEntry = {
      metadata: manifest.metadata,
      resources: new Map([['manifest.json', manifestResource]]),
      cachedAt: new Date(),
      version: metadata.version ?? 'latest',
      integrity: ''
    }
    const storage = (blockResourcesCache as any)?.storage
    if (storage?.set) {
      await storage.set(blockCacheIdentifier(blockName), entry)
    }
  } catch (error) {
    console.warn('[block-cache] failed to persist manifest for', blockName, error)
  }
}

// Try to restore block resources for a given block name from the cache on disk
async function hydrateBlockResourcesFromCache(blockName: string) {
  if (!blockResourcesCache) return
  try {
    const storage = (blockResourcesCache as any)?.storage
    if (!storage?.get) return
    const cached = await storage.get(blockCacheIdentifier(blockName))
    if (!cached) return
    const resourcesMap = cached.resources instanceof Map ? cached.resources : new Map(Object.entries(cached.resources ?? {}))
    const manifestResource = resourcesMap.get('manifest.json')
    if (!manifestResource?.content) return
    const parsed = JSON.parse(manifestResource.content)
    if (parsed?.resources && parsed?.metadata?.__origin === blockServerOrigin) {
      blockResourceCache.set(blockName, { origin: blockServerOrigin, resources: parsed.resources })
    }
  } catch (error) {
    console.warn('[block-cache] failed to hydrate', blockName, error)
  }
}

// On startup, scan local blocks and pre-fill the in-memory map from cached manifests
async function warmBlockResourceCacheFromDisk() {
  try {
    const blocksDir = path.resolve(REPO_ROOT, 'blocks')
    const entries = await fs.readdir(blocksDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const blockName = entry.name
      const metadataPath = path.join(blocksDir, blockName, 'dist', 'block-metadata.json')
      if (!existsSync(metadataPath)) continue
      await hydrateBlockResourcesFromCache(blockName)
    }
  } catch (error) {
    console.warn('[block-cache] warm-up failed', error)
  }
}

// Remove a block from both the in-memory map and the persistent cache
async function evictBlockResourceCache(blockName: string) {
  blockResourceCache.delete(blockName)
  if (!blockResourcesCache) return
  try {
    await blockResourcesCache.evict(blockCacheIdentifier(blockName))
  } catch (error) {
    console.warn('[block-cache] eviction failed for', blockName, error)
  }
}

// Send cache invalidation messages to all connected demo-server clients
function broadcastCacheInvalidation(blockId: string) {
  for (const socket of liveSockets) {
    try {
      socket.send(JSON.stringify({ type: 'cache:invalidate', payload: { blockId } }))
    } catch (error) {
      console.warn('[block-cache] failed to broadcast cache:invalidate', error)
    }
  }
}

// Bridge: subscribe to the block server WebSocket and forward its cache:invalidate events
function startBlockServerInvalidationBridge(wsUrl: string) {
  try {
    const client = new WebSocket(wsUrl)
    blockServerInvalidationClient = client
    client.on('message', async (raw) => {
      try {
        const message = JSON.parse(String(raw))
        if (message?.type === 'cache:invalidate' && typeof message?.payload?.blockId === 'string') {
          const blockId = message.payload.blockId as string
          console.log('[block-cache] invalidation received from block server:', blockId)
          await evictBlockResourceCache(blockId)
          broadcastCacheInvalidation(blockId)
        }
      } catch (error) {
        console.warn('[block-cache] failed to process invalidation message', error)
      }
    })
    client.on('error', (error) => {
      console.warn('[block-cache] block server WS error', error)
    })
  } catch (error) {
    console.warn('[block-cache] failed to connect to block server for invalidations', error)
  }
}

function nextCachingTag() {
  // Generates a unique cache-busting tag for resources to ensure browsers fetch fresh content
  // Used in VivafolioBlock notifications to invalidate cached resources
  resourceCounter += 1
  return `v${resourceCounter}`
}

const SYNTHETIC_SOURCE_TYPE = 'scenario'

function syntheticEntity(args: { entityId: string; entityTypeId: string; properties?: Record<string, unknown> }): Entity {
  return {
    entityId: args.entityId,
    entityTypeId: args.entityTypeId,
    editionId: 1,
    sourcePath: `vivafolio://scenario/${args.entityId}`,
    sourceType: SYNTHETIC_SOURCE_TYPE,
    properties: args.properties
  }
}

function syntheticLinkEntity(args: {
  entityId: string
  entityTypeId: string
  leftEntityId: string
  rightEntityId: string
  properties?: Record<string, unknown>
}): LinkEntity {
  return {
    entityId: args.entityId,
    entityTypeId: args.entityTypeId,
    editionId: 1,
    sourcePath: `vivafolio://scenario/${args.entityId}`,
    sourceType: SYNTHETIC_SOURCE_TYPE,
    properties: args.properties ?? {},
    linkData: {
      leftEntityId: args.leftEntityId,
      rightEntityId: args.rightEntityId
    }
  }
}

// Helper to hydrate a Line Chart subgraph with config + dataset rows
function buildLineChartSubgraph(params: {
  rows: Array<Record<string, unknown>>
}): EntityGraph {
  const configEntity = syntheticEntity({
    entityId: 'linechart-config',
    entityTypeId: 'vivafolio:viz:LineChartConfig',
    properties: {
      title: 'Line Chart',
      mapping: { x: 'time_period', y: 'obs_value', series: 'geo' },
      datasetEntityId: 'linechart-dataset',
      // Provide inline data as a first-class source to maximize block compatibility
      // The block prefers config.properties.rows when available
      rows: params.rows,
      xField: 'time_period',
      yField: 'obs_value',
      seriesField: 'geo',
      width: 400,
      height: 400
    }
  })
  const datasetEntity = syntheticEntity({
    entityId: 'linechart-dataset',
    entityTypeId: 'vivafolio:data:Dataset',
    properties: { rows: params.rows }
  })
  return { entities: [configEntity, datasetEntity], links: [] }
}

const DEFAULT_FRAMEWORKS = ['solidjs', 'vue', 'svelte', 'lit', 'angular']

// Seed a sensible default so resources built during module init still point to the block server
let blockServerOrigin = `http://localhost:${process.env.BLOCK_SERVER_PORT ?? 5006}`
const blockResourceCache = new Map<
  string,
  {
    origin: string
    resources: Array<{ logicalName: string, physicalPath: string, cachingTag: string }>
  }
>()

function buildBlockResource(blockName: string, fileName: string, cachingTag?: string) {
  return {
    logicalName: fileName,
    physicalPath: `${blockServerOrigin}/blocks/${blockName}/${fileName}`,
    cachingTag: cachingTag ?? nextCachingTag()
  }
}

function buildBlockStaticResource(blockName: string, relativePath: string, cachingTag?: string) {
  const normalized = relativePath.replace(/^\//, '')
  const logicalName = normalized.split('/').pop() || normalized
  return {
    logicalName,
    physicalPath: `${blockServerOrigin}/${blockName}/${normalized}`,
    cachingTag: cachingTag ?? nextCachingTag()
  }
}

function buildBlockResources(blockName: string) {
  const cached = blockResourceCache.get(blockName)
  if (cached && cached.origin === blockServerOrigin) return cached.resources

  try {
    const distDir = path.resolve(REPO_ROOT, 'blocks', blockName, 'dist')

    // Try to read metadata if present, but don't require resources field
    let metadata: { icon?: string, version?: string } = { version: 'latest' }
    const metadataPath = path.join(distDir, 'block-metadata.json')
    if (existsSync(metadataPath)) {
      try {
        const raw = readFileSync(metadataPath, 'utf8')
        const parsed = JSON.parse(raw) as { icon?: string, version?: string }
        metadata = { ...metadata, ...parsed }
      } catch (e) {
        console.warn('[block-resources] failed to parse block-metadata.json for', blockName, e)
      }
    }

    const resources: Array<{ logicalName: string, physicalPath: string, cachingTag: string }> = []

    // Always include metadata file if it exists
    if (existsSync(metadataPath)) {
      resources.push(buildBlockResource(blockName, 'block-metadata.json'))
    }

    // Walk the dist directory (non-recursive for now) and add every file as a resource
    const entries = readdirSync(distDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const relativePath = entry.name
      const normalized = relativePath.replace(/^\.\//, '')

      // We've already added block-metadata.json explicitly above
      if (normalized === 'block-metadata.json') continue

      resources.push(buildBlockResource(blockName, normalized))
    }

    console.log('[block-resources] built resources from dist', { blockName, origin: blockServerOrigin, resources })
    void persistBlockResourcesToCache(blockName, metadata, resources)
    return resources
  } catch (error) {
    console.warn(`[block-resources] failed to build resources for ${blockName}:`, error)
    const fallback = [buildBlockResource(blockName, 'block-metadata.json')]
    void persistBlockResourcesToCache(blockName, { version: 'latest' }, fallback)
    return fallback
  }
}


function buildFrameworkResource(framework: string, entryPoint: string, cachingTag?: string) {
  return {
    logicalName: entryPoint,
    physicalPath: `${blockServerOrigin}/frameworks/${framework}/${entryPoint}`,
    cachingTag: cachingTag ?? nextCachingTag()
  }
}

function createHelloWorldGraph(): EntityGraph {
  // Creates a simple entity graph for the hello-world scenario
  // Demonstrates basic Block Protocol entity structure with a single person entity
  // Used in Milestone 0 to verify basic Block Protocol wiring
  const blockEntity = syntheticEntity({
    entityId: 'entity-hello-world',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/person/v1',
    properties: {
      name: 'Vivafolio Explorer',
      message: 'Welcome to the Block Protocol POC!',
      timestamp: new Date().toISOString()
    }
  })

  return { entities: [blockEntity], links: [] }
}

function createKanbanGraph(): EntityGraph {
  // Creates a complex entity graph for Kanban board scenarios (Milestones 1-3)
  // Includes tasks, users, and board structure to demonstrate nested block composition
  // Shows how different block types (task, user, board) can work together
  const tasks: Entity[] = [
    syntheticEntity({
      entityId: 'task-1',
      entityTypeId: 'https://vivafolio.dev/entity-types/task/v1',
      properties: {
        title: 'Design nested block API',
        assigneeId: 'user-1',
        status: 'todo',
        description: 'Sketch how Kanban, task and user profile blocks communicate.'
      }
    }),
    syntheticEntity({
      entityId: 'task-2',
      entityTypeId: 'https://vivafolio.dev/entity-types/task/v1',
      properties: {
        title: 'Implement host scaffolding',
        assigneeId: 'user-2',
        status: 'doing',
        description: 'Serve nested block resources via the simulated host.'
      }
    }),
    syntheticEntity({
      entityId: 'task-3',
      entityTypeId: 'https://vivafolio.dev/entity-types/task/v1',
      properties: {
        title: 'Write Playwright coverage',
        assigneeId: 'user-1',
        status: 'done',
        description: 'Assert that task and user blocks render within the board.'
      }
    })
  ]

  const users: Entity[] = [
    syntheticEntity({
      entityId: 'user-1',
      entityTypeId: 'https://vivafolio.dev/entity-types/user/v1',
      properties: {
        name: 'Dana Developer',
        role: 'Frontend',
        avatar: '🧪'
      }
    }),
    syntheticEntity({
      entityId: 'user-2',
      entityTypeId: 'https://vivafolio.dev/entity-types/user/v1',
      properties: {
        name: 'Sam Systems',
        role: 'Platform',
        avatar: '🧰'
      }
    })
  ]

  const board = syntheticEntity({
    entityId: 'kanban-board-1',
    entityTypeId: 'https://vivafolio.dev/entity-types/board/v1',
    properties: {
      title: 'Iteration Zero',
      columns: buildBoardColumns(tasks)
    }
  })

  const links: LinkEntity[] = tasks.map((task) => {
    const assigneeId = typeof task.properties?.['assigneeId'] === 'string'
      ? task.properties?.['assigneeId'] as string
      : ''
    return syntheticLinkEntity({
      entityId: `link-${task.entityId}-assignee`,
      entityTypeId: 'https://vivafolio.dev/link-types/assignee/v1',
      leftEntityId: task.entityId,
      rightEntityId: assigneeId,
      properties: {}
    })
  })

  return { entities: [board, ...tasks, ...users] as Entity[], links }
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
      .filter((task) => {
        const status = typeof task.properties?.['status'] === 'string'
          ? task.properties?.['status'] as string
          : 'todo'
        return status === id
      })
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
    buildNotifications: (state, request) => {
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
        entities: [syntheticEntity({
          entityId: 'custom-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: { name: 'Custom Test Entity' }
        })],
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
      const normalizedBlockName = blockParam.replace('@', '')
      const blockType = isLocalBlock
        ? `https://blockprotocol.org/@local/blocks/${normalizedBlockName}/v1`
        : `https://vivafolio.dev/blocks/${blockParam}/v1`
      console.log('[custom-scenario] isLocalBlock:', isLocalBlock, 'blockType:', blockType)

      const resources = isLocalBlock ? [
        buildBlockResource(normalizedBlockName, 'block-metadata.json', nextCachingTag()),
        buildBlockResource(normalizedBlockName, 'main.cjs', nextCachingTag())
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
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }

      if ((entity as Entity).entityTypeId === 'https://vivafolio.dev/entity-types/task/v1') {
        const tasks = (state.graph.entities as Entity[]).filter(
          (item) => item.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1'
        )
        const board = state.graph.entities.find(
          (item: Entity) => item.entityId === 'kanban-board-1'
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
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }

      if ((entity as Entity).entityTypeId === 'https://vivafolio.dev/entity-types/task/v1') {
        const tasks = (state.graph.entities as Entity[]).filter(
          (item) => item.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1'
        )
        const board = state.graph.entities.find(
          (item: Entity) => item.entityId === 'kanban-board-1'
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
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }

      if ((entity as Entity).entityTypeId === 'https://vivafolio.dev/entity-types/task/v1') {
        const tasks = (state.graph.entities as Entity[]).filter(
          (item) => item.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1'
        )
        const board = state.graph.entities.find((item: Entity) => item.entityId === 'kanban-board-1')
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
      const entity = state.graph.entities.find((item: any) => (item as any).entityId === update.entityId)
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
      const entity = state.graph.entities.find((item: any) => (item as any).entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
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
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
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
        entities: [],
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
        resources: buildBlockResources('status-pill')
      }
    ]
  },
  'person-chip-example': {
    id: 'person-chip-example',
    title: 'Person Chip Block Example',
    description: 'Demonstrates the PersonChipBlock - shows assignees with avatars',
    createState: () => ({
      graph: {
        entities: [syntheticEntity({
          entityId: 'person-chip-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Person Chip Example',
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Person Chip Example',
            assignees: ['alice', 'bob']
          }
        })],
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
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
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
          syntheticEntity({
            entityId: 'table-view-entity',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Table View Example',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Table View Example'
            }
          }),
          // Mock table row entities (simulating what indexing service would provide)
          syntheticEntity({
            entityId: 'project_tasks-row-0',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'Task Name': 'Design new API',
              'Assignee': 'Alice',
              'Status': 'In Progress',
              'Priority': 'High',
              'Due Date': '2025-09-20'
            }
          }),
          syntheticEntity({
            entityId: 'project_tasks-row-1',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'Task Name': 'Update documentation',
              'Assignee': 'Bob',
              'Status': 'Completed',
              'Priority': 'Medium',
              'Due Date': '2025-09-15'
            }
          }),
          syntheticEntity({
            entityId: 'project_tasks-row-2',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'Task Name': 'Fix login bug',
              'Assignee': 'Charlie',
              'Status': 'Not Started',
              'Priority': 'Low',
              'Due Date': '2025-09-25'
            }
          })
        ],
        links: []
      }
    }),
    buildNotifications: (state, request) => [
      {
        blockId: 'table-view-example-1',
        blockType: 'https://vivafolio.org/blocks/table-view-vanilla',
        entityId: state.graph.entities[0]?.entityId ?? 'table-view-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 400,
        resources: buildBlockResources('table-view')
      }
    ],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
    }
  },
  'table-view-tanstack-example': {
    id: 'table-view-tanstack-example',
    title: 'Table View (TanStack) – tasks.csv',
    description: 'TanStack table backed by IndexingService pagination over apps/blockprotocol-poc/data/tasks.csv.',
    createState: () => ({
      graph: {
        entities: [syntheticEntity({
          entityId: 'table-view-tanstack-config',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            collectionId: TASKS_CSV_BASENAME,
            pageSize: 50,
            columns: [
              { id: 'task_id', title: 'Task ID', path: 'task_id', type: 'number', width: 90 },
              { id: 'title', title: 'Title', path: 'title', type: 'text', width: 260 },
              { id: 'assignee', title: 'Assignee', path: 'assignee', type: 'text', width: 140 },
              { id: 'due_date', title: 'Due Date', path: 'due_date', type: 'date', width: 130 },
              { id: 'status', title: 'Status', path: 'status', type: 'text', width: 140 },
              { id: 'progress', title: 'Progress', path: 'progress', type: 'text', width: 110 }
            ]
          }
        })],
        links: []
      }
    }),
    buildNotifications: (state, request) => [
      {
        blockId: 'table-view-tanstack-example-1',
        blockType: 'https://vivafolio.org/blocks/table-view',
        entityId: state.graph.entities[0]?.entityId ?? 'table-view-tanstack-config',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 520,
        resources: [
          // This block keeps metadata at the package root, while built assets live in dist/
          buildBlockStaticResource('table-view-tanstack', 'block-metadata.json'),
          buildBlockResource('table-view-tanstack', 'main.cjs'),
          buildBlockResource('table-view-tanstack', 'styles.css')
        ]
      }
    ]
  },
  'board-view-example': {
    id: 'board-view-example',
    title: 'Board View Block Example',
    description: 'Demonstrates the BoardViewBlock - Kanban-style task management',
    createState: () => ({
      graph: {
        entities: [syntheticEntity({
          entityId: 'board-view-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Board View Example',
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Board View Example'
          }
        })],
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
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
      if (!entity) return
      entity.properties = { ...entity.properties, ...update.properties }
    }
  },
  'd3-line-graph-example': {
    id: 'd3-line-graph-example',
    title: 'D3 Line Graph Example',
    description: 'GDP per capita line chart with selectable countries (Eurostat CSV).',
    createState: () => ({
      graph: {
        entities: [syntheticEntity({
          entityId: 'd3-line-graph-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'D3 Line Graph – GDP per capita'
          }
        })],
        links: []
      }
    }),
    buildNotifications: (state) => [
      {
        blockId: 'd3-line-graph-1',
        blockType: 'https://vivafolio.dev/blocks/d3-line-graph/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'd3-line-graph-entity',
        displayMode: 'multi-line',
        entityGraph: state.graph,
        supportsHotReload: true,
        initialHeight: 480,
        resources: buildBlockResources('d3-line-chart'),
      }
    ],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
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
        entities: [syntheticEntity({
          entityId: 'framework-demo-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Framework Demo',
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Framework Demo',
            status: 'in-progress'
          }
        })],
        links: []
      }
    }),
    buildNotifications: (state, request) => {
      const notifications: VivafolioBlockNotification[] = []

      // Add the original static status-pill block
      notifications.push({
        blockId: 'status-pill-static',
        blockType: 'https://vivafolio.dev/blocks/status-pill/v1',
        entityId: state.graph.entities[0]?.entityId ?? 'framework-demo-entity',
        displayMode: 'inline',
        entityGraph: state.graph,
        supportsHotReload: false,
        initialHeight: 40,
        resources: buildBlockResources('status-pill')
      })

      const frameworkBundles: Record<string, FrameworkBundle[]> = (request as any)?.frameworkBundles ?? {}
      for (const [framework, bundles] of Object.entries(frameworkBundles)) {
        for (const bundle of bundles) {
          notifications.push({
            blockId: `status-pill-${framework}`,
            blockType: `https://vivafolio.dev/blocks/status-pill-${framework}/v1`,
            entityId: state.graph.entities[0]?.entityId ?? 'framework-demo-entity',
            displayMode: 'inline',
            entityGraph: state.graph,
            supportsHotReload: true,
            initialHeight: 40,
            resources: [buildFrameworkResource(framework, bundle.entryPoint, bundle.hash)]
          })
        }
      }

      return notifications
    },
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
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
          syntheticEntity({
            entityId: 'parent-entity',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Cross-Framework Parent',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Cross-Framework Parent'
            }
          }),
          syntheticEntity({
            entityId: 'child-entity-1',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'SolidJS Child',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'SolidJS Child',
              status: 'todo'
            }
          }),
          syntheticEntity({
            entityId: 'child-entity-2',
            entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
            properties: {
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Vue Child',
              'https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1': 'Vue Child',
              status: 'in-progress'
            }
          })
        ],
        links: []
      }
    }),
    buildNotifications: (state, request) => {
      const notifications: VivafolioBlockNotification[] = []

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
      const frameworkBundles: Record<string, FrameworkBundle[]> = (request as any)?.frameworkBundles ?? {}
      const solidjsBundle = frameworkBundles.solidjs?.[0]
      if (solidjsBundle) {
        notifications.push({
          blockId: 'child-solidjs',
          blockType: 'https://vivafolio.dev/blocks/child-solidjs/v1',
          entityId: 'child-entity-1',
          displayMode: 'inline',
          entityGraph: state.graph,
          supportsHotReload: true,
          initialHeight: 60,
          resources: [buildFrameworkResource('solidjs', solidjsBundle.entryPoint, solidjsBundle.hash)]
        })
      }

      const vueBundle = frameworkBundles.vue?.[0]
      if (vueBundle) {
        notifications.push({
          blockId: 'child-vue',
          blockType: 'https://vivafolio.dev/blocks/child-vue/v1',
          entityId: 'child-entity-2',
          displayMode: 'inline',
          entityGraph: state.graph,
          supportsHotReload: true,
          initialHeight: 60,
          resources: [buildFrameworkResource('vue', vueBundle.entryPoint, vueBundle.hash)]
        })
      }

      return notifications
    },
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find((item: Entity) => item.entityId === update.entityId)
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
  const entity = syntheticEntity({
    entityId: 'html-template-block-entity',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
    properties: {
      [namePropertyBase]: 'Vivafolio Template Block',
      [namePropertyVersioned]: 'Vivafolio Template Block'
    }
  })

  return { entities: [entity], links: [] }
}

function createFeatureShowcaseGraph(): EntityGraph {
  const namePropertyBase = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
  const namePropertyVersioned = `${namePropertyBase}v/1`
  const entity = syntheticEntity({
    entityId: 'feature-showcase-block',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
    properties: {
      [namePropertyBase]: 'Block Protocol Feature Showcase',
      [namePropertyVersioned]: 'Block Protocol Feature Showcase',
      version: '0.1.0',
      description: 'Demonstrates the Block Protocol graph module with stdlib integration'
    }
  })

  return { entities: [entity], links: [] }
}

function createCustomElementGraph(): EntityGraph {
  const namePropertyBase = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
  const namePropertyVersioned = `${namePropertyBase}v/1`
  const entity = syntheticEntity({
    entityId: 'custom-element-entity',
    entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
    properties: {
      [namePropertyBase]: 'Custom Element Baseline',
      [namePropertyVersioned]: 'Custom Element Baseline',
      title: 'Custom Element Baseline',
      description: 'Demonstrates vanilla WebComponent integration',
      status: 'todo'
    }
  })

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
  const blockServerPort = options.blockServerPort ?? Number(process.env.BLOCK_SERVER_PORT ?? 5006)
  const blockServerHost = process.env.BLOCK_SERVER_HOST ?? host

  const app = express()

  // Enable CORS for cross-origin block loading (dev-server on different port)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }
    next()
  })

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

  app.use(express.json())

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime()
    })
  })

  const blockServer = await startBlockServer({
    host: blockServerHost,
    port: blockServerPort,
    blocksDir: path.resolve(REPO_ROOT, 'blocks'),
    enableHotReload: true,
    enableFrameworkBuilder: false
  })
  const printableBlockHost =
    blockServerHost === '0.0.0.0' || blockServerHost === '::' ? 'localhost' : blockServerHost
  blockServerOrigin = `http://${printableBlockHost}:${blockServerPort}`
  const cacheDir = process.env.BLOCK_CACHE_DIR ?? path.resolve(REPO_ROOT, '.block-cache')
  blockResourcesCache = new BlockResourcesCache({
    cacheDir,
    maxEntries: 2000,
    maxSize: 200 * 1024 * 1024,
    ttl: 24 * 60 * 60 * 1000
  })
  await warmBlockResourceCacheFromDisk()
  startBlockServerInvalidationBridge(`ws://${printableBlockHost}:${blockServerPort}`)

  // Initialize indexing service
  const pocDataDir = path.resolve(REPO_ROOT, 'apps', 'blockprotocol-poc', 'data')
  const indexingService = new IndexingService({
    watchPaths: [
      // Scan/index the demo data tree up-front (CSV/JSON/Markdown)
      pocDataDir
    ],
    supportedExtensions: ['csv', 'md', 'json'], // Only direct data files, not source files
    excludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/vivafolio-data-examples/**'],
    csv: {
      // Enable typing so numeric columns (e.g., OBS_VALUE, TIME_PERIOD) are numbers
      typing: true,
      nullPolicy: 'loose'
    }
  })

  // Initialize transport layer
  const transportLayer = new IndexingServiceTransportLayer(indexingService)

  // Broadcast function for LSP-driven block notifications
  const broadcastLspNotification = (notification: VivafolioBlockNotification) => {
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

  // Start indexing service (performs an upfront scan before serving WebSockets/scenarios)
  console.log('[indexing-service] Starting indexing service (initial scan)...')
  await indexingService.start()
  console.log('[indexing-service] Indexing service started')

  // Start sidecar LSP client
  try {
    await sidecarLspClient.start()
    console.log('[sidecar-lsp] Sidecar LSP client started')
  } catch (error) {
    console.error('[sidecar-lsp] Failed to start sidecar LSP client:', error)
  }

  // Block resources cache middleware with local block priority
  const proxyJson = async (targetUrl: string, res: express.Response, fallbackData: any = {}, okStatus = 200) => {
    try {
      const upstream = await fetch(targetUrl)
      if (!upstream.ok) {
        res.status(okStatus).json(fallbackData)
        return
      }
      const text = await upstream.text()
      const asJson = text ? JSON.parse(text) : fallbackData
      res.status(upstream.status).json(asJson)
    } catch (error) {
      console.warn('[block-server-proxy] falling back for', targetUrl, error)
      res.status(okStatus).json(fallbackData)
    }
  }

  // Proxy block metadata APIs to the block server
  app.get('/api/blocks', async (_req, res) => {
    await proxyJson(`${blockServerOrigin}/api/blocks`, res, [])
  })

  app.get('/api/blocks/:blockName', async (req, res) => {
    const { blockName } = req.params
    await proxyJson(`${blockServerOrigin}/api/blocks/${blockName}`, res, { error: 'not found' }, 404)
  })

  // Proxy framework bundle metadata to the block server; return empty arrays if the builder is disabled
  app.get('/api/frameworks/:framework/bundles', async (req, res) => {
    const { framework } = req.params
    await proxyJson(`${blockServerOrigin}/api/frameworks/${framework}/bundles`, res, { bundles: [] })
  })

  app.get('/api/frameworks/bundles', async (_req, res) => {
    const bundles: Record<string, any[]> = {}
    for (const framework of DEFAULT_FRAMEWORKS) {
      try {
        const upstream = await fetch(`${blockServerOrigin}/api/frameworks/${framework}/bundles`)
        if (upstream.ok) {
          const data = await upstream.json()
          bundles[framework] = data?.bundles ?? data ?? []
        } else {
          bundles[framework] = []
        }
      } catch {
        bundles[framework] = []
      }
    }
    res.json({ bundles })
  })

  app.get('/frameworks/manifest.json', async (_req, res) => {
    const byFramework = await fetchFrameworkBundles()
    const bundles: Array<FrameworkBundle & { framework: string, sourcePath: string }> = []
    for (const [framework, list] of Object.entries(byFramework)) {
      for (const bundle of list) {
        bundles.push({
          ...bundle,
          framework,
          sourcePath: path.resolve(REPO_ROOT)
        })
      }
    }
    res.json({
      generatedAt: new Date().toISOString(),
      bundles
    })
  })

  // Static asset serving with production optimizations
  app.use('/external/html-template-block', express.static(HTML_TEMPLATE_PUBLIC_DIR, createOptimizedStaticOptions()))
  app.use('/external/feature-showcase-block', express.static(path.resolve(ROOT_DIR, 'external/feature-showcase-block'), createOptimizedStaticOptions()))
  app.use('/external/custom-element-block', express.static(path.resolve(ROOT_DIR, 'external/custom-element-block'), createOptimizedStaticOptions()))
  app.use('/external/solidjs-task-block', express.static(path.resolve(ROOT_DIR, 'external/solidjs-task-block'), createOptimizedStaticOptions()))
  // Ensure the ESM helper path serves a CJS-compatible shim for the BlockLoader
  app.get('/external/d3-line-graph/libs/d3/dist/index.js', (_req, res) => {
    res.sendFile(path.resolve(REPO_ROOT, 'blocks', 'libs', 'd3', 'dist', 'cjs', 'index.js'))
  })
  // Serve the shared D3 helpers under the expected relative path
  app.use('/external/d3-line-graph/libs', express.static(path.resolve(REPO_ROOT, 'blocks', 'libs'), createOptimizedStaticOptions()))
  // Serve d3-line-graph block directly from workspace dist after build
  app.use('/external/d3-line-graph', express.static(path.resolve(REPO_ROOT, 'blocks', 'd3-line-chart'), createOptimizedStaticOptions()))
  app.use('/blocks/status-pill', express.static(path.resolve(REPO_ROOT, 'blocks', 'status-pill'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/person-chip', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/person-chip'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/table-view', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/table-view'), createOptimizedStaticOptions()))
  app.use('/examples/blocks/board-view', express.static(path.resolve(ROOT_DIR, 'dist/frameworks/board-view'), createOptimizedStaticOptions()))
  app.use('/templates', express.static(TEMPLATES_DIR, createOptimizedStaticOptions()))

  const fetchFrameworkBundles = async (): Promise<Record<string, FrameworkBundle[]>> => {
    const bundles: Record<string, FrameworkBundle[]> = {}
    for (const framework of DEFAULT_FRAMEWORKS) {
      try {
        const upstream = await fetch(`${blockServerOrigin}/api/frameworks/${framework}/bundles`)
        if (upstream.ok) {
          const data = await upstream.json()
          bundles[framework] = data?.bundles ?? []
        } else {
          bundles[framework] = []
        }
      } catch (error) {
        console.warn(`[framework-bundles] failed to load for ${framework}:`, error)
        bundles[framework] = []
      }
    }
    return bundles
  }

  app.use('/templates', express.static(TEMPLATES_DIR, createOptimizedStaticOptions()))

  app.get('/api/performance', async (_req, res) => {
    const bundlesByFramework = await fetchFrameworkBundles()
    const performance = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      },
      bundles: Object.entries(bundlesByFramework).map(([framework, bundles]) => ({
        framework,
        bundleCount: bundles.length,
        bundles: bundles.map((bundle) => ({
          id: bundle.id,
          hash: bundle.hash,
          entryPoint: bundle.entryPoint,
          assets: bundle.assets
        }))
      })),
      timestamp: new Date().toISOString()
    }
    res.json(performance)
  })

  app.post('/api/performance/bundle-load', async (req, res) => {
    const { bundleId, loadTime, framework, userAgent } = req.body ?? {}
    res.json({ recorded: true, bundleId, loadTime, framework, userAgent })
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

  app.get('*', async (req, res, next) => {
    try {
      if (viteServer) {
        const url = req.originalUrl
        // Read the source index in dev so Vite can transform it correctly.
        let html = await fs.readFile(SOURCE_INDEX_HTML, 'utf8')
        html = await viteServer.transformIndexHtml(url, html)
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
        return
      }

      const html = await fs.readFile(DIST_INDEX_HTML, 'utf8')
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

    const frameworkBundles =
      (scenarioId === 'framework-compilation-demo' || scenarioId === 'cross-framework-nesting')
        ? await fetchFrameworkBundles()
        : undefined
    const requestContext = { ...customParams, frameworkBundles }

    // Always use IndexingService for all scenarios
    const scenario = scenarios[scenarioId] ?? scenarios['hello-world']
    const state = scenario.createState()

    // Special handling for indexing-service and d3-line-graph scenarios
    let entityGraph = state.graph
    const connectionContext: Record<string, unknown> = {}

    if (scenarioId === 'status-pill-example') {
      const sortedTasks = indexingService
        .getEntitiesByBasename(TASKS_CSV_BASENAME, { sourceType: 'csv' })
        .filter((meta: any) => meta && typeof meta.entityId === 'string')
        .sort((a: any, b: any) => extractRowIndex(a.entityId) - extractRowIndex(b.entityId))
      const taskMetadata = sortedTasks[0]
      const [statusConfigMetadata] = indexingService.getEntitiesByBasename(STATUS_PILL_CONFIG_BASENAME)

      if (taskMetadata && statusConfigMetadata) {
        const taskEntity = cloneEntityMetadata(taskMetadata as Entity)
        const statusConfigEntity = cloneEntityMetadata(statusConfigMetadata as Entity)
        taskEntity.properties = {
          ...(taskEntity.properties ?? {}),
          statusOptionsEntityId: statusConfigEntity.entityId
        }

        state.graph = {
          entities: [taskEntity, statusConfigEntity],
          links: []
        }
        entityGraph = state.graph
      } else {
        console.warn('[status-pill] missing task row or status config entity; leaving graph empty')
      }
    }
    if (scenarioId === 'indexing-service') {
      // Get entities from IndexingService for the indexing-service scenario
      const allEntities = indexingService.getAllEntities()
      const entities = allEntities.map((metadata: any) => ({
        entityId: metadata.entityId,
        entityTypeId: metadata.entityTypeId || 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
        editionId: metadata.editionId,
        properties: metadata.properties,
        sourceType: metadata.sourceType,
        sourcePath: metadata.sourcePath
      }))
      entityGraph = { entities, links: [] }
    } else if (scenarioId === 'd3-line-graph-example') {
      // Wait for initial index scan to yield CSV entities
      for (let i = 0; i < 50; i++) {
        const hasCsv = indexingService.getAllEntities().some((m: any) => m.sourceType === 'csv')
        if (hasCsv) break
        await new Promise(r => setTimeout(r, 100))
      }
      // Prefer exact CSV basename match to avoid mixing datasets
      const targetName = 'sdg_08_10_page_linear_2_0.csv'
      // Filter entities locally (helpers may not be present in built dist)
      const allEntities = indexingService.getAllEntities()
      const fromTargetCsv = allEntities.filter((m: any) => m.sourceType === 'csv' && path.basename(m.sourcePath) === targetName)
      const allCsv = allEntities.filter((m: any) => m.sourceType === 'csv')
      console.log('[d3-line-graph] target matches:', fromTargetCsv.length, 'all csv:', allCsv.length)

      const selected = (fromTargetCsv.length ? fromTargetCsv : allCsv)
      const materializedRows: Array<Record<string, unknown>> = selected.map((m: any) => m.properties).filter(Boolean)

      // Debug: write an indexer snapshot to logs for investigation
      try {
        const LOG_DIR = path.resolve(ROOT_DIR, 'logs')
        await fs.mkdir(LOG_DIR, { recursive: true })
        const snapshot = {
          timestamp: new Date().toISOString(),
          targetName,
          counts: { fromTargetCsv: fromTargetCsv.length, allCsv: allCsv.length, rows: materializedRows.length },
          sampleTarget: fromTargetCsv.slice(0, 5).map((m: any) => ({ entityId: m.entityId, sourcePath: m.sourcePath, properties: m.properties })),
          sampleAllCsv: allCsv.slice(0, 5).map((m: any) => ({ entityId: m.entityId, sourcePath: m.sourcePath, properties: m.properties }))
        }
        const filePath = path.join(LOG_DIR, `indexer-snapshot-${Date.now()}.json`)
        await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8')
        console.log('[d3-line-graph] wrote indexer snapshot:', filePath)
      } catch (e) {
        console.warn('[d3-line-graph] failed to write indexer snapshot:', e)
      }
      console.log('[d3-line-graph] sending rows:', materializedRows.length)
      entityGraph = buildLineChartSubgraph({ rows: materializedRows })
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
    } else if (scenarioId === 'd3-line-graph-example') {
      // Send the D3 line graph notification with the populated entityGraph from IndexingService
      const notifications = scenario.buildNotifications(state, requestContext)
      for (const base of notifications) {
        const payload = { ...base, entityGraph, entityId: 'linechart-config' }
        socket.send(
          JSON.stringify({
            type: 'vivafolioblock-notification',
            payload
          })
        )
      }
    } else {
      dispatchScenarioNotifications(socket, scenario, state, requestContext)
    }

    socketStates.set(socket, {
      scenario,
      state,
      context: Object.keys(connectionContext).length ? connectionContext : undefined
    })

    socket.on('close', () => {
      liveSockets.delete(socket)
      socketStates.delete(socket)
      transportLayer.unregisterTransport(transportId)
      console.log(`[transport] Unregistered transport ${transportId}`)
    })

    // All messages go through the IndexingService transport layer
    // For historical scenarios, we still broadcast notifications, but updates delegate to IndexingService
    socket.on('message', async (raw) => {
      try {
        const payload = JSON.parse(String(raw))
        console.log(`[transport] Message received: ${payload.type}`)

        // Handle cache invalidation from local block development
        if (payload?.type === 'cache:invalidate') {
          console.log(`[cache-invalidate] Received invalidation for block: ${payload.payload?.blockId}`)
          // The client should handle this by reloading the block
          return
        }

        // Transport layer handles all Block Protocol operations via IndexingService
        if (payload?.type === 'graph/update') {
          console.log('[transport] graph/update payload received:', JSON.stringify(payload.payload))
          const upd = payload.payload as GraphUpdate
          try {
            const persistenceProps: Record<string, unknown> = upd.properties
            const ok = await indexingService.updateEntity(upd.entityId, persistenceProps)

            // Maintain scenario-specific derived state if applyUpdate is provided; otherwise shallow merge
            // This should be removed after all scenarios are migrated to IndexingService-driven updates 
            if (typeof scenario.applyUpdate === 'function') {
              try {
                scenario.applyUpdate({
                  state,
                  update: upd,
                  socket,
                  broadcast: (notification) => {
                    try {
                      socket.send(JSON.stringify({ type: 'vivafolioblock-notification', payload: notification }))
                    } catch (e) {
                      console.warn('[transport] broadcast failed:', e)
                    }
                  }
                })
              } catch (e) {
                console.warn('[transport] scenario.applyUpdate failed, falling back to direct merge:', e)
                const entity = state.graph.entities.find((e: any) => e.entityId === upd.entityId)
                if (entity) {
                  entity.properties = { ...entity.properties, ...upd.properties }
                }
              }
            } else {
              // Reflect the update in the local scenario state as a basic fallback
              const entity = state.graph.entities.find((e: any) => e.entityId === upd.entityId)
              if (entity) {
                entity.properties = { ...entity.properties, ...upd.properties }
              }
            }
            // Push refreshed notifications to the client after state has been updated
            dispatchScenarioNotifications(socket, scenario, state, requestContext)

            // Send ack
            socket.send(
              JSON.stringify({
                type: 'graph/ack',
                payload: { entityId: upd.entityId, properties: upd.properties, ok }
              })
            )
          } catch (e) {
            console.error('[transport] updateEntity failed:', e)
            try {
              socket.send(JSON.stringify({ type: 'graph/ack', payload: { entityId: upd.entityId, ok: false } }))
            } catch { }
          }
        }

        if (payload?.type === 'graph/aggregate') {
          const receivedAt = new Date().toISOString()
          const requestId = Number(payload?.payload?.requestId)
          const args = payload?.payload?.args as AggregateArgs
          try {
            const result = await indexingService.aggregateEntities(args)
            socket.send(
              JSON.stringify({
                type: 'graph/aggregate:result',
                receivedAt,
                payload: { requestId, result } as { requestId: number; result: AggregateResult<Entity> }
              })
            )
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e)
            try {
              socket.send(
                JSON.stringify({
                  type: 'graph/aggregate:error',
                  receivedAt,
                  payload: { requestId, error }
                })
              )
            } catch { }
          }
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

    if (blockServerInvalidationClient) {
      try {
        blockServerInvalidationClient.close()
      } catch (error) {
        console.warn('[block-server] failed to close invalidation client', error)
      } finally {
        blockServerInvalidationClient = undefined
      }
    }

    try {
      await blockServer.stop()
      console.log('[block-server] stopped')
    } catch (error) {
      console.error('[block-server] failed to stop', error)
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

  return { app, httpServer, wss, close, blockServer }
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
