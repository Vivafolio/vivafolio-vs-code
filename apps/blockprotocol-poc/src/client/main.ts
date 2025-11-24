// renderHtmlBlock is no longer exported from @blockprotocol/core, implementing a simple replacement
import { GraphEmbedderHandler } from '@blockprotocol/graph'
import { VivafolioBlockLoader, BlockLoader, DEFAULT_ALLOWED_DEPENDENCIES, type VivafolioBlockNotification as LoaderBlockNotification } from '@vivafolio/block-loader'
import type { Entity, EntityGraph, VivafolioBlockNotification } from '@vivafolio/block-loader'

// For now, provide a minimal stdlib stub so published blocks can load
const stdlib = {
  getRoots: () => [],
  getEntities: () => [],
  getEntityRevision: () => null,
  buildSubgraph: () => ({}),
  // Add other commonly used functions as stubs
}

// BlockProtocol globals and container registry
const blockContainers = new Map<string, HTMLElement>()

// Proper implementation of renderHtmlBlock following BlockProtocol spec
async function renderHtmlBlock(mount: HTMLElement, options: { url: string }) {
  // Get blockId from the mount element
  const blockId = mount.dataset.blockId || 'html-template-block-1'

  // Register the container
  blockContainers.set(blockId, mount)

  // Set up BlockProtocol globals if not already done
  if (!(window as any).blockprotocol) {
    ;(window as any).blockprotocol = {
      getBlockContainer: (ref?: any) => {
        // For HTML blocks, we can extract blockId from various sources
        let containerBlockId = blockId // fallback to current blockId

        if (typeof ref === 'string' && ref.includes('blockId=')) {
          // Extract from URL query param
          const url = new URL(ref)
          containerBlockId = url.searchParams.get('blockId') || blockId
        } else if (ref && typeof ref === 'object' && ref.blockId) {
          // Direct blockId
          containerBlockId = ref.blockId
        }

        const container = blockContainers.get(containerBlockId)
        if (!container) {
          throw new Error(`Cannot find block container for ${containerBlockId}`)
        }
        return container
      },
      getBlockUrl: () => options.url,
      markScript: (script: HTMLScriptElement) => {
        // For module scripts, add blockId to URL
        if (script.type === 'module' && script.src) {
          const url = new URL(script.src, window.location.origin)
          url.searchParams.set('blockId', blockId)
          script.src = url.toString()
        }
      }
    }
  }

  const response = await fetch(options.url)
  if (!response.ok) {
    throw new Error(`Failed to load HTML from ${options.url}: ${response.status}`)
  }
  const html = await response.text()

  // Use createContextualFragment to properly execute scripts
  const range = document.createRange()
  range.selectNodeContents(mount)
  const fragment = range.createContextualFragment(html)
  mount.innerHTML = '' // Clear existing content
  mount.appendChild(fragment)
}

const urlParams = new URLSearchParams(window.location.search)
const scenarioId = urlParams.get('scenario') ?? 'hello-world'
const useIndexingService = urlParams.get('useIndexingService') === 'true'

document.querySelectorAll<HTMLElement>('[data-scenario-link]').forEach((link) => {
  if (link.dataset.scenarioLink === scenarioId) {
    link.classList.add('is-active')
  } else {
    link.classList.remove('is-active')
  }
})

const scenarioLabel = document.getElementById('scenario-label') as HTMLSpanElement
const scenarioDescription = document.getElementById('scenario-description') as HTMLSpanElement
const statusEl = document.getElementById('status') as HTMLSpanElement
const blockRegion = document.getElementById('block-region') as HTMLDivElement

let liveSocket: WebSocket | undefined
const pendingGraphUpdates: GraphUpdatePayload[] = []
const latestPayloads = new Map<string, VivafolioBlockNotification>()
const iframeControllers = new Map<string, { iframe: HTMLIFrameElement; ready: boolean }>()
const publishedLoaders = new Map<string, BlockLoader>()

type HtmlTemplateHandlers = {
  setEntity: (entity: Entity) => void
  setReadonly: (readonly: boolean) => void
}

function handleBlockUpdate(payload: { entityId: string; properties: Record<string, unknown>; blockId?: string }) {
  // Use a default blockId if not provided
  const blockId = payload.blockId || 'unknown-block'
  try {
    console.log('[Client] handleBlockUpdate: preparing graph/update', {
      blockId,
      entityId: payload.entityId,
      properties: payload.properties
    })
  } catch {}
  sendGraphUpdateMessage({
    blockId,
    entityId: payload.entityId,
    properties: payload.properties
  })
}

function adaptBlockNotification(notification: VivafolioBlockNotification): LoaderBlockNotification {
  return {
    blockId: notification.blockId,
    blockType: notification.blockType,
    displayMode: notification.displayMode,
    sourceUri: `vivafolio://poc/${notification.blockId}`,
    range: {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 100 }
    },
    entityId: notification.entityId,
    resources: notification.resources || [],
    entityGraph: notification.entityGraph
  }
}

// Using shared Entity, EntityGraph, VivafolioBlockNotification types from block-loader

interface GraphUpdatePayload {
  blockId: string
  entityId: string
  properties: Record<string, unknown>
  kind?: string
}

interface BlockGraphState {
  depth: number
  linkedEntities: Entity[]
  linkGroups: Array<Record<string, unknown>>
}

const DEFAULT_ENTITY_TYPE_ID =
  'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2'
const DEFAULT_ENTITY_EDITION_ID = 'initial'

interface BlockEntitySubgraphVertex {
  kind: 'entity'
  inner: {
  metadata: NonNullable<Entity['metadata']>
    properties: Record<string, unknown>
  }
}

type BlockEntitySubgraph = {
  roots: Array<{ baseId: string; revisionId: string }>
  vertices: Record<string, Record<string, BlockEntitySubgraphVertex>>
  edges: Record<string, Record<string, unknown[]>>
  depths: {
    hasLeftEntity: { incoming: number; outgoing: number }
    hasRightEntity: { incoming: number; outgoing: number }
    constrainsLinkDestinationsOn: { outgoing: number }
    constrainsLinksOn: { outgoing: number }
    constrainsPropertiesOn: { outgoing: number }
    constrainsValuesOn: { outgoing: number }
    inheritsFrom: { outgoing: number }
    isOfType: { outgoing: number }
  }
}

function createDefaultDepths(): BlockEntitySubgraph['depths'] {
  return {
    hasLeftEntity: { incoming: 0, outgoing: 0 },
    hasRightEntity: { incoming: 0, outgoing: 0 },
    constrainsLinkDestinationsOn: { outgoing: 0 },
    constrainsLinksOn: { outgoing: 0 },
    constrainsPropertiesOn: { outgoing: 0 },
    constrainsValuesOn: { outgoing: 0 },
    inheritsFrom: { outgoing: 0 },
    isOfType: { outgoing: 0 }
  }
}

function normalizeEntity(entity: Entity): Entity {
  const entityId = entity.entityId
  const entityTypeId = entity.entityTypeId ?? entity.metadata?.entityTypeId ?? DEFAULT_ENTITY_TYPE_ID
  const editionId = entity.metadata?.recordId.editionId ?? DEFAULT_ENTITY_EDITION_ID
  return {
    entityId,
    entityTypeId,
    properties: { ...(entity.properties ?? {}) },
    metadata: {
      recordId: {
        entityId,
        editionId
      },
      entityTypeId
    }
  }
}

function buildBlockEntitySubgraph(blockEntity: Entity, graph: BlockGraphState): BlockEntitySubgraph {
  const normalizedRoot = normalizeEntity(blockEntity as Entity)
  const vertices: BlockEntitySubgraph['vertices'] = {}
  const collect = (candidate: Entity) => {
    const normalized = normalizeEntity(candidate)
    const revisionId = normalized.metadata?.recordId.editionId ?? DEFAULT_ENTITY_EDITION_ID
    const baseId = normalized.entityId
    vertices[baseId] ??= {}
    vertices[baseId][revisionId] = {
      kind: 'entity',
      inner: {
        metadata: normalized.metadata!,
        properties: { ...normalized.properties }
      }
    }
  }

  collect(normalizedRoot)
  for (const linked of graph.linkedEntities as Entity[]) {
    collect(linked)
  }

  const roots: BlockEntitySubgraph['roots'] = [
    {
      baseId: normalizedRoot.entityId,
      revisionId: normalizedRoot.metadata?.recordId.editionId ?? DEFAULT_ENTITY_EDITION_ID
    }
  ]

  return {
    roots,
    vertices,
    edges: {},
    depths: createDefaultDepths()
  }
}

function deriveBlockEntity(notification: VivafolioBlockNotification): Entity {
  const entity =
    notification.entityGraph.entities.find((item: Entity) => item.entityId === notification.entityId) ??
    notification.entityGraph.entities[0] ?? {
      entityId: notification.entityId,
      entityTypeId: DEFAULT_ENTITY_TYPE_ID,
      properties: {}
    }

  return normalizeEntity(entity)
}

function deriveBlockGraph(notification: VivafolioBlockNotification): BlockGraphState {
  return {
    depth: 1,
    linkedEntities: notification.entityGraph.entities.map((entity: Entity) => normalizeEntity(entity)),
    linkGroups: []
  }
}

function mergeLinkedEntities(collection: Entity[], entity: Entity): Entity[] {
  const normalized = normalizeEntity(entity)
  const index = collection.findIndex((item) => item.entityId === normalized.entityId)
  if (index === -1) {
    return [...collection, normalized]
  }
  const next = collection.slice()
  next[index] = normalized
  return next
}

type GraphEmbedderOptions = ConstructorParameters<typeof GraphEmbedderHandler>[0]


type AggregateEntitiesDebugResult = {
  results: Entity[]
  operation: {
    entityTypeId: string | null
    pageNumber: number
    itemsPerPage: number
    pageCount: number
    totalCount: number
  }
}

type LinkedAggregationEntry = {
  aggregationId: string
  sourceEntityId: string
  path: string
  operation: Record<string, unknown>
}

interface PublishedBlockLoaderDiagnostics {
  bundleUrl: string
  evaluatedAt: string
  integritySha256?: string | null
  requiredDependencies: string[]
  blockedDependencies: string[]
  allowedDependencies: string[]
  localModules?: Array<{
    logicalName: string
    type: 'js' | 'css'
    integritySha256: string | null
  }>
}

type BlockResource = NonNullable<VivafolioBlockNotification['resources']>[number]

interface LocalModuleEntry {
  logicalName: string
  url: string
  type: 'js' | 'css'
  source: string
  integritySha256: string | null
  executed: boolean
  exports?: unknown
  styleElement?: HTMLStyleElement
}

type PublishedBlockDebug = {
  aggregateEntities: (
    input?: {
      entityTypeId?: string | null
      itemsPerPage?: number | null
      pageNumber?: number | null
    }
  ) => Promise<AggregateEntitiesDebugResult>
  createLinkedAggregation: (
    input?: Partial<LinkedAggregationEntry>
  ) => Promise<LinkedAggregationEntry>
  updateLinkedAggregation: (
    input: Partial<LinkedAggregationEntry> & { aggregationId: string }
  ) => Promise<LinkedAggregationEntry>
  deleteLinkedAggregation: (aggregationId: string) => Promise<boolean>
  listLinkedAggregations: () => Promise<LinkedAggregationEntry[]>
  loaderDiagnostics: () => Promise<PublishedBlockLoaderDiagnostics | null>
}

declare global {
  interface Window {
    __vivafolioPoc?: {
      publishedBlocks: Record<string, PublishedBlockDebug>
    }
  }
}

type ServerEnvelope =
  | {
      type: 'connection_ack'
      timestamp: string
      entityGraph: EntityGraph
      scenario?: { id: string; title: string; description?: string }
    }
  | { type: 'vivafolioblock-notification'; payload: VivafolioBlockNotification }
  | { type: 'graph/ack'; receivedAt: string; payload?: { entityId: string; properties: Record<string, unknown> } }
  | { type: 'status/persisted'; payload: { entityId: string; status: string; label?: string } }
  | { type: 'cache:invalidate'; payload: { blockId: string } }

const PLACEHOLDER_CLASS = 'block-region__placeholder'

function setStatus(text: string, className: string) {
  statusEl.textContent = text
  statusEl.className = className
}

function ensurePlaceholder(message: string) {
  if (!blockRegion.querySelector(`.${PLACEHOLDER_CLASS}`)) {
    const placeholder = createElement('div', PLACEHOLDER_CLASS, message)
    blockRegion.appendChild(placeholder)
  }
}

function clearPlaceholder() {
  blockRegion.querySelectorAll(`.${PLACEHOLDER_CLASS}`).forEach((node) => node.remove())
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (textContent) el.textContent = textContent
  return el
}

function sendGraphUpdateMessage(update: GraphUpdatePayload) {
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
    pendingGraphUpdates.push(update)
    try { console.warn('[Client] sendGraphUpdateMessage: socket not open, queued update', update) } catch {}
    return
  }
  try { console.log('[Client] sendGraphUpdateMessage: sending graph/update', update) } catch {}
  liveSocket.send(
    JSON.stringify({
      type: 'graph/update',
      payload: {
        blockId: update.blockId,
        entityId: update.entityId,
        kind: update.kind ?? 'updateEntity',
        properties: update.properties
      }
    })
  )
}

type BlockRenderer = (notification: VivafolioBlockNotification) => HTMLElement

const ALLOWED_CJS_DEPENDENCIES = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@blockprotocol/graph',
  '@blockprotocol/graph/stdlib',
  '@blockprotocol/graph/custom-element'
])

const renderers: Record<string, BlockRenderer> = {
  'https://blockprotocol.org/@local/blocks/hello-world/v1': renderHelloBlock,
  'https://vivafolio.dev/blocks/kanban-board/v1': renderKanbanBoard,
  'https://vivafolio.dev/blocks/task-list/v1': renderTaskList,
  'https://vivafolio.dev/blocks/iframe-kanban/v1': (notification) =>
    renderIframeBlock(notification, 'iframe-kanban', 'Kanban IFrame'),
  'https://vivafolio.dev/blocks/iframe-task-list/v1': (notification) =>
    renderIframeBlock(notification, 'iframe-task-list', 'Task List IFrame'),
  'https://blockprotocol.org/@blockprotocol/blocks/test-npm-block/v0': renderPublishedBlock,
  'https://blockprotocol.org/@blockprotocol/blocks/html-template/v0': renderPublishedBlock,
  'https://blockprotocol.org/@blockprotocol/blocks/feature-showcase/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/resource-loader/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/custom-element/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/solidjs-task/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/status-pill/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/person-chip/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/table-view/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/board-view/v1': renderPublishedBlock,
  'https://vivafolio.dev/blocks/d3-line-graph/v1': renderPublishedBlock
}

function renderHelloBlock(notification: VivafolioBlockNotification): HTMLElement {
  const container = createElement('article', 'hello-block')
  container.dataset.blockId = notification.blockId

  const heading = createElement('h2', undefined, 'Hello Block')
  const entity = notification.entityGraph.entities[0]
  const name = String(entity?.properties?.name ?? 'Unknown')
  const summary = createElement('p')
  summary.innerHTML = `👋 Greetings, <strong>${name}</strong>!`

  const meta = createElement('pre')
  meta.textContent = JSON.stringify(notification, null, 2)

  container.append(heading, summary, meta)
  return container
}


function renderKanbanBoard(notification: VivafolioBlockNotification): HTMLElement {
  const entityMap = new Map<string, Entity>()
  notification.entityGraph.entities.forEach((entity: Entity) => {
    entityMap.set(entity.entityId, entity)
  })

  const board = notification.entityId ? entityMap.get(notification.entityId) : undefined
  const columns = (board?.properties?.columns as Array<Record<string, unknown>>) ?? []

  const article = createElement('article', 'kanban-board')
  article.dataset.blockId = notification.blockId

  const boardTitle = String(board?.properties?.title ?? 'Untitled Board')
  article.appendChild(createElement('header', 'kanban-board__header', boardTitle))

  const columnRow = createElement('div', 'kanban-board__columns')

  columns.forEach((column) => {
    const columnEl = createElement('section', 'kanban-column')
    columnEl.dataset.columnId = String(column.id ?? column.title ?? '')
    columnEl.appendChild(createElement('h3', 'kanban-column__title', String(column.title ?? column.id ?? 'Column')))

    const tasksContainer = createElement('div', 'kanban-column__tasks')

    // Add drop event handlers to the tasks container
    tasksContainer.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      tasksContainer.classList.add('kanban-column__tasks--drag-over')
    })

    tasksContainer.addEventListener('dragleave', () => {
      tasksContainer.classList.remove('kanban-column__tasks--drag-over')
    })

    tasksContainer.addEventListener('drop', (e) => {
      e.preventDefault()
      tasksContainer.classList.remove('kanban-column__tasks--drag-over')

      const taskEntityId = e.dataTransfer!.getData('text/plain')
      const newStatus = String(column.id ?? column.title ?? '')

      if (taskEntityId && newStatus) {
        // Send graph update to change the task's status
        sendGraphUpdateMessage({
          blockId: notification.blockId,
          entityId: taskEntityId,
          properties: { status: newStatus }
        })
      }
    })

    const taskIds = (column.taskIds as string[]) || []
    taskIds.forEach((taskId) => {
      const taskEntity = entityMap.get(taskId)
      if (!taskEntity) return
      const task = createTaskCard(taskEntity, entityMap)
      tasksContainer.appendChild(task)
    })

    columnEl.appendChild(tasksContainer)
    columnRow.appendChild(columnEl)
  })

  article.appendChild(columnRow)
  return article
}

function renderTaskList(notification: VivafolioBlockNotification): HTMLElement {
  const container = createElement('article', 'task-list')
  container.dataset.blockId = notification.blockId

  const header = createElement('header', 'task-list__header', 'Task List')
  container.appendChild(header)

  const list = createElement('ul', 'task-list__items')
  const tasks = (notification.entityGraph.entities as Entity[]).filter(
    (entity) => entity.entityTypeId === 'https://vivafolio.dev/entity-types/task/v1'
  )

  tasks.forEach((task) => {
    const item = createElement('li', 'task-list__item')
    item.dataset.entityId = task.entityId

    const title = createElement('span', 'task-list__title', String(task.properties.title ?? 'Untitled task'))
    const status = createElement('span', 'task-list__status', String(task.properties.status ?? 'todo'))

    const actions = createElement('div', 'task-list__actions')
    const nextStatus = getNextStatus(String(task.properties.status ?? 'todo'))
    if (nextStatus) {
      const advanceButton = createElement(
        'button',
        'task-list__button',
        `Move to ${statusLabel(nextStatus)}`
      )
      advanceButton.dataset.action = 'advance-status'
      advanceButton.addEventListener('click', () => {
        sendGraphUpdateMessage({
          blockId: notification.blockId,
          entityId: task.entityId,
          properties: { status: nextStatus }
        })
      })
      actions.appendChild(advanceButton)
    } else {
      const doneLabel = createElement('span', 'task-list__complete', 'Complete')
      actions.appendChild(doneLabel)
    }

    item.append(title, status, actions)
    list.appendChild(item)
  })

  container.appendChild(list)
  return container
}

function getNextStatus(current: string): string | null {
  switch (current) {
    case 'todo':
      return 'doing'
    case 'doing':
      return 'done'
    default:
      return null
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'todo':
      return 'To Do'
    case 'doing':
      return 'In Progress'
    case 'done':
      return 'Done'
    default:
      return status
  }
}

function createTaskCard(taskEntity: Entity, entityMap: Map<string, Entity>): HTMLElement {
  const container = createElement('article', 'task-card')
  container.dataset.entityId = taskEntity.entityId
  container.draggable = true

  // Add drag event handlers
  container.addEventListener('dragstart', (e) => {
    e.dataTransfer!.setData('text/plain', taskEntity.entityId)
    e.dataTransfer!.effectAllowed = 'move'
    container.classList.add('task-card--dragging')
  })

  container.addEventListener('dragend', () => {
    container.classList.remove('task-card--dragging')
  })

  const title = String(taskEntity.properties.title ?? 'Untitled task')
  container.appendChild(createElement('h4', 'task-card__title', title))

  const description = String(taskEntity.properties.description ?? '')
  if (description) {
    container.appendChild(createElement('p', 'task-card__description', description))
  }

  const assigneeId = String(taskEntity.properties.assigneeId ?? '')
  if (assigneeId && entityMap.has(assigneeId)) {
    const profile = createUserProfile(entityMap.get(assigneeId) as Entity)
    container.appendChild(profile)
  }

  return container
}

function createUserProfile(userEntity: Entity): HTMLElement {
  const container = createElement('div', 'user-profile')
  container.dataset.entityId = userEntity.entityId

  const avatar = String(userEntity.properties.avatar ?? '🙂')
  container.appendChild(createElement('span', 'user-profile__avatar', avatar))

  const info = createElement('div', 'user-profile__info')
  info.appendChild(createElement('strong', undefined, String(userEntity.properties.name ?? 'Unnamed User')))
  const role = String(userEntity.properties.role ?? '')
  if (role) {
    info.appendChild(createElement('span', 'user-profile__role', role))
  }

  container.appendChild(info)
  return container
}

function renderIframeBlock(
  notification: VivafolioBlockNotification,
  className: string,
  heading: string
): HTMLElement {
  const resource = notification.resources?.[0]
  const resourcePath = resource?.physicalPath ?? ''
  const controller = iframeControllers.get(notification.blockId)
  let iframe: HTMLIFrameElement

  if (controller) {
    iframe = controller.iframe
    if (resourcePath) {
      const nextSrc = buildFrameSrc(resourcePath, notification.blockId, resource?.cachingTag)
  //console.log('[Client] (iframe reuse) setting src for', notification.blockId, 'to', nextSrc)
      if (iframe.src !== window.location.origin + nextSrc) {
        iframe.src = nextSrc
        controller.ready = false
      }
    }
  } else {
    iframe = document.createElement('iframe')
    iframe.className = 'iframe-block__frame'
    iframe.dataset.blockId = notification.blockId
    iframeControllers.set(notification.blockId, { iframe, ready: false })
    if (resourcePath) {
      iframe.src = buildFrameSrc(resourcePath, notification.blockId, resource?.cachingTag)
  //console.log('[Client] (iframe create) initial src for', notification.blockId, 'is', iframe.src)
    }
  }

  const wrapper = createElement('article', `iframe-block ${className}`)
  wrapper.dataset.blockId = notification.blockId
  wrapper.appendChild(createElement('header', 'iframe-block__header', heading))
  wrapper.appendChild(iframe)
  requestFrameInit(notification.blockId)
  return wrapper
}

function buildFrameSrc(resourcePath: string, blockId: string, cachingTag?: string): string {
  const url = new URL(resourcePath, window.location.origin)
  url.searchParams.set('blockId', blockId)
  if (cachingTag) {
    url.searchParams.set('cache', cachingTag)
  }
  const finalSrc = url.pathname + url.search
  console.log('[Client] buildFrameSrc()', {
    resourcePath,
    blockId,
    cachingTag,
    finalSrc
  })
  return url.pathname + url.search
}

function renderFallback(notification: VivafolioBlockNotification): HTMLElement {
  const container = createElement('article', 'block-fallback')
  container.dataset.blockId = notification.blockId
  container.innerHTML = `
    <h2>Unsupported Block</h2>
    <p>No renderer registered for <code>${notification.blockType}</code>.</p>
    <pre>${JSON.stringify(notification, null, 2)}</pre>
  `
  return container
}

function renderPublishedBlock(notification: VivafolioBlockNotification): HTMLElement {
  console.log('[POC] renderPublishedBlock called for:', notification.blockId, notification.blockType)
  try {
    const initStatus = (notification.entityGraph?.entities?.[0]?.properties as any)?.status
    console.log('[POC] Initial entityGraph status for block', notification.blockId, ':', initStatus)
  } catch (e) {
    console.warn('[POC] Failed to log initial entity status', e)
  }

  // Use the actual block loader to load and execute real block packages
  let loader = publishedLoaders.get(notification.blockId)
  const adaptedNotification = adaptBlockNotification(notification)
  const existing = document.querySelector<HTMLElement>(`[data-block-id="${notification.blockId}"]`)

  if (!loader) {
    console.log('[POC] Creating new VivafolioBlockLoader for:', notification.blockId)
    console.log('[POC] Adapted notification:', JSON.stringify(adaptedNotification, null, 2))
    loader = new VivafolioBlockLoader(adaptedNotification, {
      allowedDependencies: DEFAULT_ALLOWED_DEPENDENCIES,
      enableIntegrityChecking: true,
      enableDiagnostics: true,
      onBlockUpdate: (payload) => {
        console.log('[POC] Block update received:', payload)
        handleBlockUpdate({ ...payload, blockId: notification.blockId })
      }
    })
    publishedLoaders.set(notification.blockId, loader)

    // First render: create container and load
    const container = document.createElement('div')
    container.className = 'published-block-container'
    container.dataset.blockId = notification.blockId
    console.log('[POC] Created container with ID:', notification.blockId)

    console.log('[POC] Starting block loader for:', notification.blockId)
    console.log('[POC] Adapted notification resources:', adaptedNotification.resources)
    console.log('[POC] About to call loader.loadBlock...')
    loader.loadBlock(adaptedNotification, container).then(() => {
      console.log('[POC] Block loaded successfully:', notification.blockId)
      console.log('[POC] Container HTML after load:', container.innerHTML.substring(0, 500))
      console.log('[POC] Container children count:', container.children.length)
      console.log('[POC] Container first child:', container.firstElementChild?.tagName, container.firstElementChild?.className)
      console.log('[POC] Loader diagnostics:', JSON.stringify(loader!.getDiagnostics(), null, 2))
      container.style.display = 'block'
    }).catch(error => {
      console.error('[POC] Block loader failed:', error.message)
      console.error('[POC] Full error:', error)
      console.error('[POC] Error stack:', error.stack)
      container.innerHTML = `
        <div class="block-error" style="
          padding: 20px;
          border: 2px solid #ef4444;
          border-radius: 8px;
          background-color: #fef2f2;
          color: #dc2626;
          font-family: monospace;
        ">
          <h3 style="margin: 0 0 10px 0;">Block Loading Failed</h3>
          <p style="margin: 0 0 10px 0;">${notification.blockType}</p>
          <pre style="margin: 0; white-space: pre-wrap; font-size: 12px;">${error.message}</pre>
        </div>
      `
      container.style.display = 'block'
    })
    return container
  }

  // Subsequent updates: reuse loader + existing container; avoid reloading/evaluating bundle again
  console.log('[POC] Reusing existing loader for:', notification.blockId)
  if (existing) {
    try {
      const before = existing.querySelector('.status-pill-block')?.textContent?.trim()
      console.log('[POC] Reuse path before updateBlock pill text =', before)
    } catch {}
    loader.updateBlock(adaptedNotification)
    try {
      const after = existing.querySelector('.status-pill-block')?.textContent?.trim()
      console.log('[POC] Reuse path after updateBlock pill text =', after)
    } catch {}
    return existing
  }

  // Fallback: if no existing container in DOM, create and load
  const container = document.createElement('div')
  container.className = 'published-block-container'
  container.dataset.blockId = notification.blockId
  console.log('[POC] Created container with ID:', notification.blockId)
  loader.loadBlock(adaptedNotification, container).catch(error => {
    console.error('[POC] Block loader failed:', error)
  })
  return container
}


// PublishedBlockController removed - replaced with @vivafolio/block-loader

function ensureHtmlTemplateHostBridge() {
  const win = window as typeof window & {
    __vivafolioHtmlTemplateHost?: {
      register: (
        blockId: string,
        handlers: HtmlTemplateHandlers
      ) => {
        updateEntity: (payload: { entityId: string; properties: Record<string, unknown> }) => void
      }
    }
  }

  if (win.__vivafolioHtmlTemplateHost) {
    console.log('[client] ensureHtmlTemplateHostBridge: bridge already exists')
    return
  }

  console.log('[client] ensureHtmlTemplateHostBridge: setting up bridge')
  win.__vivafolioHtmlTemplateHost = {
    register(blockId, handlers) {
      console.log('[client] bridge register called for blockId:', blockId)
      const loader = publishedLoaders.get(blockId)
      if (!loader) {
        console.warn('[published-block] missing html template loader', blockId)
        return {
          updateEntity() {
            console.warn(
              '[published-block] dropping html template update – loader missing',
              blockId
            )
          }
        }
      }
      // HTML template handlers are managed internally by the loader
      return {
        updateEntity(payload) {
          // HTML template updates are handled through the loader's update mechanism
          console.log('[client] HTML template update:', payload)
        }
      }
    }
  }
}

function cleanupPublishedLoaders() {
  publishedLoaders.forEach((loader) => loader.destroy())
  publishedLoaders.clear()
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  try {
    if (!('crypto' in window) || !window.crypto.subtle) {
      return null
    }
    const digest = await window.crypto.subtle.digest('SHA-256', buffer)
    const bytes = new Uint8Array(digest)
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch (error) {
    console.warn('[blockprotocol-poc] failed to compute bundle hash', error)
    return null
  }
}

function ensureDebugRegistry() {
  const win = window as typeof window & {
    __vivafolioPoc?: { publishedBlocks: Record<string, PublishedBlockDebug> }
  }
  if (!win.__vivafolioPoc) {
    win.__vivafolioPoc = { publishedBlocks: {} }
  }
  return win.__vivafolioPoc
}

function getDebugRegistry() {
  const win = window as typeof window & {
    __vivafolioPoc?: { publishedBlocks: Record<string, PublishedBlockDebug> }
  }
  return win.__vivafolioPoc
}

function handleEnvelope(data: ServerEnvelope) {
  switch (data.type) {
    case 'connection_ack': {
      blockRegion.innerHTML = ''
      latestPayloads.clear()
      iframeControllers.forEach((controller) => {
        controller.ready = false
      })
      cleanupPublishedLoaders()
      const scenarioTitle = data.scenario?.title ?? 'Unknown Scenario'
      scenarioLabel.textContent = scenarioTitle
      scenarioDescription.textContent = data.scenario?.description ?? ''
      
      // Set up global graph context for blocks that need direct access to entity data
      if (data.entityGraph) {
        ;(window as any).__vivafolioGraphContext = { graph: data.entityGraph }
        console.log('[Client] Set up global graph context with', data.entityGraph.entities?.length || 0, 'entities')
      } else {
        console.log('[Client] No entityGraph in connection_ack')
      }
      
      ensurePlaceholder(`Awaiting VivafolioBlock notifications for ${scenarioTitle}…`)
      break
    }
  case 'cache:invalidate': {
    console.log('[Client] Received cache:invalidate for blockId:', data.payload.blockId)
    const blockId = data.payload.blockId
    if (blockId) {
      // Reload the block by re-rendering with the latest payload
      const payload = latestPayloads.get(blockId)
      if (payload) {
        console.log('[Client] Reloading block:', blockId, '- forcing iframe reload')
        const existing = blockRegion.querySelector<HTMLElement>(
          `[data-block-id="${blockId}"]`
        )
        if (existing) {
          // For iframe-based blocks, force a full reload by recreating the iframe
          const iframe = existing.querySelector('iframe')
          if (iframe) {
            const src = iframe.src
            console.log('[Client] Reloading iframe with cache-busting:', src)
            // Add cache-busting parameter to force reload
            const cacheBuster = `_reload=${Date.now()}`
            const newSrc = src.includes('?') ? `${src}&${cacheBuster}` : `${src}?${cacheBuster}`
            iframe.src = newSrc
          } else {
            // Non-iframe block: re-render from scratch
            const renderer = renderers[payload.blockType] ?? renderFallback
            const element = renderer(payload)
            existing.replaceWith(element)
            requestFrameInit(blockId)
          }
        }
      } else {
        console.warn('[Client] No cached payload found for blockId:', blockId, '- block may need full reload')
      }
    }
    break
  }
  case 'vivafolioblock-notification': {
    console.log('[Client] Received vivafolioblock-notification:', {
      blockId: data.payload.blockId,
      blockType: data.payload.blockType,
      entityId: data.payload.entityId
    })
    // Ensure global graph context is available for blocks that read directly from window
    if (data.payload.entityGraph) {
      ;(window as any).__vivafolioGraphContext = { graph: data.payload.entityGraph }
      console.log('[Client] Updated global graph context from notification with', data.payload.entityGraph.entities?.length || 0, 'entities')
    }
    clearPlaceholder()
    latestPayloads.set(data.payload.blockId, data.payload)
    const renderer = renderers[data.payload.blockType] ?? renderFallback
    console.log('[Client] Using renderer:', renderer.name || 'renderFallback')
    if (!renderers[data.payload.blockType]) {
      console.warn('[blockprotocol-poc] missing renderer for', data.payload.blockType)
      console.warn('[blockprotocol-poc] available renderers', Object.keys(renderers))
    }
    console.log('[Client] Calling renderer for block:', data.payload.blockId)
    const element = renderer(data.payload)
    console.log('[Client] Renderer returned element:', element)
      const existing = blockRegion.querySelector<HTMLElement>(
        `[data-block-id="${data.payload.blockId}"]`
      )
      if (existing) {
        existing.replaceWith(element)
      } else {
        blockRegion.appendChild(element)
      }
      requestFrameInit(data.payload.blockId)
      break
    }
    case 'graph/ack':
      try {
        // Lightweight visibility for test debugging
        console.log('[Client] graph/ack received:', JSON.stringify(data.payload))
      } catch {}
      break
    case 'status/persisted': {
      console.log('[Client] Status persisted:', data.payload)
      break
    }
    default:
      console.warn('Unrecognized envelope', data)
  }
}

function requestFrameInit(blockId: string) {
  const controller = iframeControllers.get(blockId)
  if (!controller?.ready) return
  const payload = latestPayloads.get(blockId)
  if (!payload) return
  controller.iframe.contentWindow?.postMessage(
    {
      type: 'graph:init',
      blockId,
      graph: payload.entityGraph
    },
    '*'
  )
}

function bootstrap() {
  console.log('[Client] Bootstrap called')
  console.log('[Client] scenarioId:', scenarioId)
  console.log('[Client] useIndexingService:', useIndexingService)
  console.log('[Client] URL params:', location.search)

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams()
  params.set('scenario', scenarioId)
  if (useIndexingService) {
    params.set('useIndexingService', 'true')
  }

  // For custom scenario, include block parameter from URL
  if (scenarioId === 'custom') {
    const urlParams = new URLSearchParams(location.search)
    const blockParam = urlParams.get('block')
    if (blockParam) {
      params.set('block', blockParam)
    }
    const entityIdParam = urlParams.get('entityId')
    if (entityIdParam) {
      params.set('entityId', entityIdParam)
    }
  }
  const wsUrl = `${protocol}//${location.host}/ws?${params.toString()}`
  console.log('[Client] Connecting to WebSocket:', wsUrl)
  const socket = new WebSocket(wsUrl)
  liveSocket = socket

  socket.addEventListener('open', () => {
    console.log('[Client] WebSocket connected')
    setStatus('connected', 'connected')

    // Flush any pending graph/update messages
    if (pendingGraphUpdates.length) {
      try { console.log('[Client] Flushing pending graph updates:', pendingGraphUpdates.length) } catch {}
      for (const upd of pendingGraphUpdates.splice(0)) {
        sendGraphUpdateMessage(upd)
      }
    }
  })

  socket.addEventListener('close', () => {
    console.log('[Client] WebSocket disconnected')
    setStatus('disconnected', 'disconnected')
  })

  socket.addEventListener('message', (event) => {
    console.log('[Client] WebSocket message received:', event.data)
    try {
      const data: ServerEnvelope = JSON.parse(event.data)
      console.log('[Client] Parsed message type:', data.type)
      handleEnvelope(data)
    } catch (error) {
      console.error('Failed to parse message', error)
    }
  })

  socket.addEventListener('error', (error) => {
    console.error('[Client] WebSocket error:', error)
  })

  // Connect to block dev-server for hot reload notifications
  const blockDevServerUrl = `ws://localhost:3001`
  console.log('[Client] Connecting to block dev-server:', blockDevServerUrl)
  const blockDevSocket = new WebSocket(blockDevServerUrl)

  blockDevSocket.addEventListener('open', () => {
    console.log('[Client] Block dev-server WebSocket connected')
  })

  blockDevSocket.addEventListener('close', () => {
    console.log('[Client] Block dev-server WebSocket disconnected')
  })

  blockDevSocket.addEventListener('message', (event) => {
    console.log('[Client] Block dev-server message received:', event.data)
    try {
      const data = JSON.parse(event.data)
      console.log('[Client] Block dev-server message type:', data.type)
      // Handle hot reload messages from block dev-server
      if (data.type === 'cache:invalidate') {
        handleEnvelope(data)
      }
    } catch (error) {
      console.error('[Client] Failed to parse block dev-server message', error)
    }
  })

  blockDevSocket.addEventListener('error', (error) => {
    console.error('[Client] Block dev-server WebSocket error:', error)
  })
}

document.addEventListener('DOMContentLoaded', bootstrap)

// Fallback route disabled: rely on loader onBlockUpdate only
window.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  const { type, blockId } = data as { type?: string; blockId?: string }
  if (!blockId) return

  switch (type) {
    case 'block-ready': {
      const controller = iframeControllers.get(blockId)
      if (!controller) return
      controller.ready = true
      requestFrameInit(blockId)
      break
    }
    case 'graph:update': {
      // Forward iframe-driven graph updates to the dev server (used by iframe-webviews scenario)
      const update = data as {
        blockId: string
        entityId: string
        properties: Record<string, unknown>
        kind?: string
      }
      if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return
      liveSocket.send(
        JSON.stringify({
          type: 'graph/update',
          payload: {
            blockId: update.blockId,
            entityId: update.entityId,
            kind: update.kind ?? 'updateEntity',
            properties: update.properties ?? {}
          }
        })
      )
      break
    }
    default:
      break
  }
})
