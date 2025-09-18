import { renderHtmlBlock } from '@blockprotocol/core'
import { GraphEmbedderHandler } from '@blockprotocol/graph'

const scenarioId = new URLSearchParams(window.location.search).get('scenario') ?? 'hello-world'

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
const latestPayloads = new Map<string, VivafolioBlockNotification>()
const iframeControllers = new Map<string, { iframe: HTMLIFrameElement; ready: boolean }>()

interface EntityMetadata {
  recordId: {
    entityId: string
    editionId: string
  }
  entityTypeId: string
}

interface Entity {
  entityId: string
  properties: Record<string, unknown>
  entityTypeId?: string
  metadata?: EntityMetadata
}

interface EntityGraph {
  entities: Entity[]
  links: Array<Record<string, unknown>>
}

type VivafolioBlockNotification = {
  blockId: string
  blockType: string
  entityId: string
  displayMode: 'multi-line' | 'inline'
  initialGraph: EntityGraph
  resources?: Array<{
    logicalName: string
    physicalPath: string
    cachingTag?: string
  }>
  supportsHotReload?: boolean
  initialHeight?: number
}

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
    metadata: EntityMetadata
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
  const normalizedRoot = normalizeEntity(blockEntity)
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
  for (const linked of graph.linkedEntities) {
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
    notification.initialGraph.entities.find((item) => item.entityId === notification.entityId) ??
    notification.initialGraph.entities[0] ?? {
      entityId: notification.entityId,
      entityTypeId: DEFAULT_ENTITY_TYPE_ID,
      properties: {}
    }

  return normalizeEntity(entity)
}

function deriveBlockGraph(notification: VivafolioBlockNotification): BlockGraphState {
  return {
    depth: 1,
    linkedEntities: notification.initialGraph.entities.map((entity) => normalizeEntity(entity)),
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

class VivafolioGraphEmbedderHandler extends GraphEmbedderHandler {
  private currentSubgraph: BlockEntitySubgraph

  constructor(options: GraphEmbedderOptions & { blockEntitySubgraph: BlockEntitySubgraph }) {
    const { blockEntitySubgraph, ...rest } = options
    super(rest)
    this.currentSubgraph = blockEntitySubgraph
  }

  override getInitPayload() {
    const payload = super.getInitPayload() as Record<string, unknown>
    return {
      ...payload,
      blockEntitySubgraph: this.currentSubgraph
    }
  }

  setBlockEntitySubgraph(subgraph: BlockEntitySubgraph) {
    this.currentSubgraph = subgraph
  }

  emitBlockEntitySubgraph() {
    void this.sendMessage({
      message: {
        messageName: 'blockEntitySubgraph',
        data: this.currentSubgraph
      }
    })
  }
}

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
  | { type: 'graph/ack'; receivedAt: string }

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
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return
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
  'react-dom/client'
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
  'https://vivafolio.dev/blocks/resource-loader/v1': renderPublishedBlock
}

function renderHelloBlock(notification: VivafolioBlockNotification): HTMLElement {
  const container = createElement('article', 'hello-block')
  container.dataset.blockId = notification.blockId

  const heading = createElement('h2', undefined, 'Hello Block')
  const entity = notification.initialGraph.entities[0]
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
  notification.initialGraph.entities.forEach((entity) => {
    entityMap.set(entity.entityId, entity)
  })

  const board = entityMap.get(notification.entityId)
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
  const tasks = notification.initialGraph.entities.filter(
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
  let controller = publishedControllers.get(notification.blockId)
  if (!controller) {
    controller = new PublishedBlockController(notification)
    publishedControllers.set(notification.blockId, controller)
  } else {
    controller.updateFromNotification(notification)
  }
  return controller.element
}


class PublishedBlockController {
  readonly element: HTMLElement
  private readonly runtime: HTMLDivElement
  private readonly description: HTMLParagraphElement
  private readonly resourcesList: HTMLUListElement
  private readonly metadataPanel: HTMLPreElement
  private blockEntity: Entity
  private blockGraph: BlockGraphState
  private blockSubgraph: BlockEntitySubgraph
  private resources: VivafolioBlockNotification['resources']
  private reactModule: typeof import('react') | undefined
  private reactRoot: ReturnType<typeof import('react-dom/client')['createRoot']> | undefined
  private blockComponent: unknown
  private embedder: VivafolioGraphEmbedderHandler | undefined
  private destroyed = false
  private readonly linkedAggregations = new Map<string, LinkedAggregationEntry>()
  private loaderDiagnostics: PublishedBlockLoaderDiagnostics | null = null
  private readonly mode: 'bundle' | 'html'
  private blockMount: HTMLDivElement | undefined
  private htmlTemplateHandlers: HtmlTemplateHandlers | undefined
  private localModuleCache: Map<string, LocalModuleEntry> = new Map()
  public readonly debug: PublishedBlockDebug

  constructor(private notification: VivafolioBlockNotification) {
    this.resources = notification.resources

    const mainResource = this.findResource('main.js')
    const htmlResource = this.findResource('app.html')
    if (mainResource) {
      this.mode = 'bundle'
    } else if (htmlResource) {
      this.mode = 'html'
    } else {
      this.mode = 'bundle'
    }

    this.blockEntity = deriveBlockEntity(notification)
    this.blockGraph = deriveBlockGraph(notification)
    this.blockSubgraph = buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)

    if (this.mode === 'html') {
      ensureHtmlTemplateHostBridge()
      htmlTemplateControllerRegistry.set(this.notification.blockId, this)
    }

    this.element = createElement(
      'article',
      this.mode === 'html' ? 'published-block published-block--html' : 'published-block'
    )
    this.element.dataset.blockId = notification.blockId

    const header = createElement('header', 'published-block__header', 'Published Block Runtime')
    this.description = createElement(
      'p',
      'published-block__description',
      'Preparing npm block runtime…'
    )
    this.runtime = createElement('div', 'published-block__runtime')
    this.runtime.textContent = 'Loading block…'

    const resourcesHeading = createElement('h3', 'published-block__subheading', 'Resources')
    this.resourcesList = createElement('ul', 'published-block__resources')
    const metadataHeading = createElement('h3', 'published-block__subheading', 'Metadata Snapshot')
    this.metadataPanel = createElement('pre', 'published-block__metadata')

    this.element.append(
      header,
      this.description,
      this.runtime,
      resourcesHeading,
      this.resourcesList,
      metadataHeading,
      this.metadataPanel
    )

    this.updateResourceList()
    this.updateMetadataPanel()

    this.debug = {
      aggregateEntities: async (input) => {
        const response = await this.handleAggregateEntities({ operation: input ?? {} })
        return response.data as AggregateEntitiesDebugResult
      },
      createLinkedAggregation: async (input) => {
        const response = await this.handleCreateLinkedAggregation(input)
        return response.data as LinkedAggregationEntry
      },
      updateLinkedAggregation: async (input) => {
        const response = await this.handleUpdateLinkedAggregation(input)
        if ('errors' in response && response.errors?.length) {
          throw new Error(response.errors.join(', '))
        }
        return response.data as LinkedAggregationEntry
      },
      deleteLinkedAggregation: async (aggregationId) => {
        const response = await this.handleDeleteLinkedAggregation({ aggregationId })
        return Boolean(response.data)
      },
      listLinkedAggregations: async () => Array.from(this.linkedAggregations.values()),
      loaderDiagnostics: async () => this.loaderDiagnostics
    }

    const registry = ensureDebugRegistry()
    registry.publishedBlocks[this.notification.blockId] = this.debug

    void this.initialize()
  }

  private findResource(logicalName: string) {
    return this.resources?.find((resource) => resource.logicalName === logicalName)
  }

  private resolveResourceUrl(logicalName: string): string | undefined {
    const resource = this.findResource(logicalName)
    if (!resource) return undefined
    const url = new URL(resource.physicalPath, window.location.origin)
    if (resource.cachingTag) {
      url.searchParams.set('cache', resource.cachingTag)
    }
    return url.pathname + url.search
  }

  updateFromNotification(notification: VivafolioBlockNotification) {
    this.destroyLocalModules()
    this.notification = notification
    this.blockEntity = deriveBlockEntity(notification)
    this.blockGraph = deriveBlockGraph(notification)
    this.blockSubgraph = buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)
    this.resources = notification.resources
    this.updateResourceList()
    this.updateMetadataPanel()
    if (this.embedder) {
      this.embedder.blockEntity({ data: this.blockEntity as Entity })
      this.embedder.blockGraph({ data: this.blockGraph })
      this.dispatchBlockEntitySubgraph()
      this.emitLinkedAggregations()
    }
    this.pushHtmlTemplateEntity()
    this.render()
  }

  destroy() {
    this.destroyed = true
    this.destroyLocalModules()
    this.embedder?.destroy()
    this.reactRoot?.unmount()
    const registry = getDebugRegistry()
    if (registry) {
      delete registry.publishedBlocks[this.notification.blockId]
    }
    if (this.mode === 'html') {
      htmlTemplateControllerRegistry.delete(this.notification.blockId)
    }
  }

  private async initialize() {
    try {
      if (this.mode === 'bundle') {
        await this.initializeBundle()
      } else {
        await this.initializeHtml()
      }
      this.description.textContent = this.describeBlock()
      this.render()
    } catch (error) {
      console.error('[blockprotocol-poc] Failed to initialize published block runtime', error)
      const message = error instanceof Error ? error.message : String(error)
      this.runtime.textContent = `Failed to load published block: ${message}`
    }
  }

  private async initializeBundle() {
    const [reactModule, reactDomModule] = await Promise.all([
      import('react'),
      import('react-dom/client')
    ])

    const bundleUrl = this.resolveResourceUrl('main.js')
    if (!bundleUrl) {
      throw new Error('Bundle resource missing (main.js)')
    }

    await this.prefetchLocalResources('main.js')

    const bundleResponse = await fetch(bundleUrl, { cache: 'no-store' })
    if (!bundleResponse.ok) {
      throw new Error(`Bundle request failed with ${bundleResponse.status}`)
    }
    const bundleBuffer = await bundleResponse.arrayBuffer()
    const decoder = new TextDecoder('utf-8')
    const bundleSource = decoder.decode(bundleBuffer)
    const integrity = await computeSha256Hex(bundleBuffer)

    const moduleShim: { exports: unknown } = { exports: {} }
    const exportsShim = moduleShim.exports as Record<string, unknown>
    const requiredDependencies: string[] = []
    const blockedDependencies: string[] = []
    const requireShim = (specifier: string) => {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        requiredDependencies.push(specifier)
        return this.loadLocalModule(specifier)
      }
      if (!ALLOWED_CJS_DEPENDENCIES.has(specifier)) {
        blockedDependencies.push(specifier)
        throw new Error(`Unsupported dependency: ${specifier}`)
      }
      requiredDependencies.push(specifier)
      switch (specifier) {
        case 'react':
        case 'react/jsx-runtime':
        case 'react/jsx-dev-runtime':
          return reactModule
        case 'react-dom':
        case 'react-dom/client':
          return reactDomModule
      }
      throw new Error(`Dependency resolution fallback hit for ${specifier}`)
    }
    const evaluator = new Function(
      'require',
      'module',
      'exports',
      `${bundleSource}
return module.exports;`
    ) as (
      require: unknown,
      module: { exports: unknown },
      exports: Record<string, unknown>
    ) => unknown

    const blockModule = evaluator(requireShim, moduleShim, exportsShim) ?? moduleShim.exports

    if (this.destroyed) {
      return
    }

    const localModulesDiagnostics = Array.from(this.localModuleCache.values()).map((entry) => ({
      logicalName: entry.logicalName,
      type: entry.type,
      integritySha256: entry.integritySha256
    }))

    this.loaderDiagnostics = {
      bundleUrl,
      evaluatedAt: new Date().toISOString(),
      integritySha256: integrity,
      requiredDependencies,
      blockedDependencies,
      allowedDependencies: Array.from(ALLOWED_CJS_DEPENDENCIES),
      localModules: localModulesDiagnostics
    }

    this.reactModule = reactModule
    const { createRoot } = reactDomModule
    this.reactRoot = createRoot(this.runtime)
    this.blockComponent = (blockModule?.default ?? blockModule?.App ?? blockModule) as unknown

    this.createEmbedder(this.runtime)
    this.emitLinkedAggregations()
    this.updateMetadataPanel()
  }

  private async initializeHtml() {
    const mount = createElement('div', 'html-block__container')
    mount.dataset.blockId = this.notification.blockId
    this.blockMount = mount
    this.runtime.innerHTML = ''
    this.runtime.appendChild(mount)

    this.createEmbedder(mount)

    const htmlUrl = this.resolveResourceUrl('app.html')
    if (!htmlUrl) {
      throw new Error('HTML entry (app.html) not provided')
    }

    await renderHtmlBlock(mount, { url: htmlUrl })
    if (this.destroyed) {
      return
    }

    this.embedder?.blockEntity({ data: this.blockEntity })
    this.embedder?.blockGraph({ data: this.blockGraph })
    this.dispatchBlockEntitySubgraph()
    this.pushHtmlTemplateEntity()

    this.loaderDiagnostics = {
      bundleUrl: htmlUrl,
      evaluatedAt: new Date().toISOString(),
      integritySha256: null,
      requiredDependencies: [],
      blockedDependencies: [],
      allowedDependencies: []
    }

    this.emitLinkedAggregations()
    this.updateMetadataPanel()
  }

  private createEmbedder(element: HTMLElement) {
    this.embedder = new VivafolioGraphEmbedderHandler({
      element,
      blockEntity: this.blockEntity as Entity,
      blockGraph: this.blockGraph,
      entityTypes: [],
      linkedAggregations: [],
      readonly: false,
      blockEntitySubgraph: this.blockSubgraph,
      callbacks: {
        updateEntity: async ({ data }) => this.handleBlockUpdate(data),
        getEntity: async ({ data }) => this.handleGetEntity(data),
        aggregateEntities: async ({ data }) => this.handleAggregateEntities(data),
        getLinkedAggregation: async ({ data }) => this.handleGetLinkedAggregation(data),
        createLinkedAggregation: async ({ data }) => this.handleCreateLinkedAggregation(data),
        updateLinkedAggregation: async ({ data }) => this.handleUpdateLinkedAggregation(data),
        deleteLinkedAggregation: async ({ data }) => this.handleDeleteLinkedAggregation(data)
      }
    })
    this.dispatchBlockEntitySubgraph()
  }

  private dispatchBlockEntitySubgraph() {
    if (!this.embedder) {
      return
    }
    if (!this.blockSubgraph) {
      this.blockSubgraph = buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)
    }
    this.embedder.setBlockEntitySubgraph(this.blockSubgraph)
    this.embedder.emitBlockEntitySubgraph()
  }

  attachHtmlTemplateHandlers(handlers: HtmlTemplateHandlers) {
    this.htmlTemplateHandlers = handlers
    this.pushHtmlTemplateEntity()
  }

  receiveHtmlTemplateUpdate(payload: { entityId?: string; properties?: Record<string, unknown> }) {
    void this.handleBlockUpdate(payload)
  }

  private pushHtmlTemplateEntity() {
    if (this.mode !== 'html') {
      return
    }
    const handlers = this.htmlTemplateHandlers
    if (!handlers) {
      return
    }
    handlers.setEntity?.(this.blockEntity)
    handlers.setReadonly?.(false)
  }

  private destroyLocalModules() {
    this.localModuleCache.forEach((entry) => {
      if (entry.type === 'css' && entry.styleElement?.parentNode) {
        entry.styleElement.remove()
      }
    })
    this.localModuleCache.clear()
  }

  private async prefetchLocalResources(mainLogicalName: string) {
    this.destroyLocalModules()
    const resources = this.resources ?? []
    const localResources = resources.filter((resource) => resource.logicalName !== mainLogicalName)

    for (const resource of localResources) {
      const logicalName = resource.logicalName
      const extension = logicalName.split('.').pop()?.toLowerCase()
      if (!extension) continue

      const relativeUrl = this.resolveResourceUrl(logicalName)
      if (!relativeUrl) {
        console.warn('[blockprotocol-poc] Missing resource path for', logicalName)
        continue
      }
      const absoluteUrl = new URL(relativeUrl, window.location.origin).toString()

      if (extension === 'js' || extension === 'cjs' || extension === 'mjs') {
        const response = await fetch(absoluteUrl, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Failed to fetch local module ${logicalName}: ${response.status}`)
        }
        const source = await response.text()
        const encoder = new TextEncoder()
        const integritySha256 = await computeSha256Hex(encoder.encode(source).buffer)
        this.localModuleCache.set(logicalName, {
          logicalName,
          url: absoluteUrl,
          type: 'js',
          source,
          integritySha256,
          executed: false
        })
        continue
      }

      if (extension === 'css') {
        const response = await fetch(absoluteUrl, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Failed to fetch stylesheet ${logicalName}: ${response.status}`)
        }
        const source = await response.text()
        const encoder = new TextEncoder()
        const integritySha256 = await computeSha256Hex(encoder.encode(source).buffer)
        this.localModuleCache.set(logicalName, {
          logicalName,
          url: absoluteUrl,
          type: 'css',
          source,
          integritySha256,
          executed: false
        })
      }
    }
  }

  private resolveLocalLogicalName(specifier: string, fromLogicalName?: string) {
    if (!specifier.startsWith('.')) {
      return specifier
    }

    const baseSegments = fromLogicalName ? fromLogicalName.split('/') : []
    if (baseSegments.length) {
      baseSegments.pop()
    }
    for (const segment of specifier.split('/')) {
      if (!segment || segment === '.') continue
      if (segment === '..') {
        if (baseSegments.length) {
          baseSegments.pop()
        }
        continue
      }
      baseSegments.push(segment)
    }
    return baseSegments.join('/')
  }

  private loadLocalModule(specifier: string) {
    const logicalName = this.resolveLocalLogicalName(specifier)
    return this.loadLocalModuleByLogicalName(logicalName)
  }

  private loadLocalModuleRelative(fromLogicalName: string, specifier: string) {
    const logicalName = this.resolveLocalLogicalName(specifier, fromLogicalName)
    return this.loadLocalModuleByLogicalName(logicalName)
  }

  private loadLocalModuleByLogicalName(logicalName: string) {
    const entry = this.localModuleCache.get(logicalName)
    if (!entry) {
      throw new Error(`Unsupported dependency: ${logicalName}`)
    }

    if (entry.type === 'css') {
      if (!entry.executed) {
        const styleElement = document.createElement('style')
        styleElement.dataset.blockId = this.notification.blockId
        styleElement.dataset.resource = logicalName
        styleElement.textContent = entry.source
        document.head.appendChild(styleElement)
        entry.styleElement = styleElement
        entry.executed = true
      }
      return undefined
    }

    if (!entry.executed) {
      const moduleShim: { exports: unknown } = { exports: {} }
      const exportsShim = moduleShim.exports as Record<string, unknown>
      const localRequire = (childSpecifier: string) => {
        if (childSpecifier.startsWith('./') || childSpecifier.startsWith('../')) {
          return this.loadLocalModuleRelative(logicalName, childSpecifier)
        }
        return this.loadLocalModule(childSpecifier)
      }
      const evaluator = new Function('require', 'module', 'exports', entry.source)
      evaluator(localRequire, moduleShim, exportsShim)
      entry.exports = moduleShim.exports
      entry.executed = true
    }

    return entry.exports
  }

  private async handleBlockUpdate(
    data?: { entityId?: string; properties?: Record<string, unknown> }
  ) {
    if (!data?.entityId) {
      return { errors: ['Missing entityId in updateEntity message'] }
    }

    const nextProperties = {
      ...(this.blockEntity.properties ?? {}),
      ...(data.properties ?? {})
    }
    const updatedEntity = normalizeEntity({
      ...this.blockEntity,
      entityId: data.entityId,
      entityTypeId: data.entityTypeId ?? this.blockEntity.entityTypeId,
      properties: nextProperties,
      metadata: {
        recordId: {
          entityId: data.entityId,
          editionId: this.blockEntity.metadata?.recordId.editionId ?? DEFAULT_ENTITY_EDITION_ID
        },
        entityTypeId:
          data.entityTypeId ??
          this.blockEntity.metadata?.entityTypeId ??
          this.blockEntity.entityTypeId ??
          DEFAULT_ENTITY_TYPE_ID
      }
    })

    this.blockEntity = updatedEntity
    this.blockGraph = {
      ...this.blockGraph,
      linkedEntities: mergeLinkedEntities(this.blockGraph.linkedEntities, updatedEntity)
    }
    this.blockSubgraph = buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)

    this.updateMetadataPanel()
    sendGraphUpdateMessage({
      blockId: this.notification.blockId,
      entityId: data.entityId,
      properties: data.properties ?? {}
    })
    this.dispatchBlockEntitySubgraph()
    this.pushHtmlTemplateEntity()
    this.render()
    return { data: this.blockEntity }
  }

  private async handleGetEntity(data?: { entityId?: string }) {
    const entityId = data?.entityId
    if (!entityId) {
      return { data: this.blockEntity }
    }

    const found = this.blockGraph.linkedEntities.find((entity) => entity.entityId === entityId)
    return { data: found ?? this.blockEntity }
  }

  private async handleAggregateEntities(data?: {
    operation?: {
      entityTypeId?: string | null
      itemsPerPage?: number | null
      pageNumber?: number | null
    }
  }) {
    const operation = data?.operation ?? {}
    const pageNumber = operation.pageNumber ?? 1
    const itemsPerPage = operation.itemsPerPage ?? this.blockGraph.linkedEntities.length

    const sliceStart = (pageNumber - 1) * itemsPerPage
    const sliceEnd = sliceStart + itemsPerPage
    const results = this.blockGraph.linkedEntities.slice(sliceStart, sliceEnd)

    return {
      data: {
        results,
        operation: {
          entityTypeId: operation.entityTypeId ?? null,
          pageNumber,
          itemsPerPage,
          pageCount: Math.max(1, Math.ceil(this.blockGraph.linkedEntities.length / itemsPerPage)),
          totalCount: this.blockGraph.linkedEntities.length
        }
      }
    }
  }

  private async handleGetLinkedAggregation(data?: { aggregationId?: string }) {
    if (!data?.aggregationId) {
      return { errors: ['aggregationId is required'] }
    }
    return { data: this.linkedAggregations.get(data.aggregationId) ?? null }
  }

  private async handleCreateLinkedAggregation(data?: {
    sourceEntityId?: string
    path?: string
    aggregationId?: string
    operation?: Record<string, unknown>
  }) {
    const aggregationId =
      data?.aggregationId ??
      `agg-${
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)
      }`
    const payload: LinkedAggregationEntry = {
      aggregationId,
      sourceEntityId: data?.sourceEntityId ?? this.blockEntity.entityId,
      path: data?.path ?? '',
      operation: data?.operation ?? {}
    }
    this.linkedAggregations.set(aggregationId, payload)
    this.emitLinkedAggregations()
    return { data: payload }
  }

  private async handleUpdateLinkedAggregation(data?: {
    aggregationId?: string
    operation?: Record<string, unknown>
  }) {
    if (!data?.aggregationId) {
      return { errors: ['aggregationId is required'] }
    }
    const current = this.linkedAggregations.get(data.aggregationId)
    if (!current) {
      return { errors: ['aggregation not found'] }
    }
    const next = { ...current, operation: data.operation ?? current.operation }
    this.linkedAggregations.set(data.aggregationId, next)
    this.emitLinkedAggregations()
    return { data: next }
  }

  private async handleDeleteLinkedAggregation(data?: { aggregationId?: string }) {
    if (!data?.aggregationId) {
      return { errors: ['aggregationId is required'] }
    }
    const existed = this.linkedAggregations.delete(data.aggregationId)
    this.emitLinkedAggregations()
    return { data: existed }
  }

  private emitLinkedAggregations(): LinkedAggregationEntry[] {
    const snapshot = Array.from(this.linkedAggregations.values())
    if (this.embedder) {
      this.embedder.linkedAggregations({ data: snapshot })
    }
    return snapshot
  }

  private updateResourceList() {
    this.resourcesList.innerHTML = ''
    const resources = this.resources ?? []
    if (!resources.length) {
      const item = createElement('li', 'published-block__resource-empty', 'No runtime resources provided.')
      this.resourcesList.appendChild(item)
      return
    }

    resources.forEach((resource) => {
      const item = createElement('li', 'published-block__resource-item')
      const name = createElement('strong')
      name.textContent = resource.logicalName
      const path = createElement('code')
      path.textContent = resource.physicalPath
      item.append(name, document.createTextNode(': '), path)
      if (resource.cachingTag) {
        const tag = createElement('span', 'published-block__resource-tag', ` (cache ${resource.cachingTag})`)
        item.appendChild(tag)
      }
      this.resourcesList.appendChild(item)
    })
  }

  private updateMetadataPanel() {
    const properties = this.blockEntity.properties ?? {}
    this.metadataPanel.textContent = JSON.stringify(properties, null, 2)
  }

  private describeBlock() {
    const properties = this.blockEntity.properties ?? {}
    const baseName =
      typeof properties.name === 'string'
        ? properties.name
        : (properties[
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
          ] as string | undefined) ?? 'test-npm-block'
    const version = typeof properties.version === 'string' ? properties.version : undefined
    const versionLabel = version ? ` v${version}` : ''
    if (this.mode === 'html') {
      return `Loaded HTML entry block ${baseName}${versionLabel} via the Block Protocol host shim.`
    }
    return `Loaded from npm package ${baseName}${versionLabel} via the Block Protocol host shim.`
  }

  private render() {
    if (this.mode === 'html') {
      return
    }
    if (!this.reactModule || !this.reactRoot || !this.blockComponent) {
      return
    }

    const graphProps = {
      graph: {
        blockEntity: this.blockEntity,
        blockGraph: this.blockGraph,
        entityTypes: [],
        linkedAggregations: [],
        readonly: false
      }
    }

    const element = this.reactModule.createElement(this.blockComponent as any, graphProps)
    this.reactRoot.render(element)
  }
}
const publishedControllers = new Map<string, PublishedBlockController>()

type HtmlTemplateHandlers = {
  setEntity: (entity: Entity) => void
  setReadonly: (readonly: boolean) => void
}

const htmlTemplateControllerRegistry = new Map<string, PublishedBlockController>()

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
    return
  }

  win.__vivafolioHtmlTemplateHost = {
    register(blockId, handlers) {
      const controller = htmlTemplateControllerRegistry.get(blockId)
      if (!controller) {
        console.warn('[published-block] missing html template controller', blockId)
        return {
          updateEntity() {
            console.warn(
              '[published-block] dropping html template update – controller missing',
              blockId
            )
          }
        }
      }
      controller.attachHtmlTemplateHandlers(handlers)
      return {
        updateEntity(payload) {
          controller.receiveHtmlTemplateUpdate(payload)
        }
      }
    }
  }
}

function cleanupPublishedControllers() {
  publishedControllers.forEach((controller) => controller.destroy())
  publishedControllers.clear()
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
      cleanupPublishedControllers()
      const scenarioTitle = data.scenario?.title ?? 'Unknown Scenario'
      scenarioLabel.textContent = scenarioTitle
      scenarioDescription.textContent = data.scenario?.description ?? ''
      ensurePlaceholder(`Awaiting VivafolioBlock notifications for ${scenarioTitle}…`)
      break
    }
    case 'vivafolioblock-notification': {
      clearPlaceholder()
      latestPayloads.set(data.payload.blockId, data.payload)
      const renderer = renderers[data.payload.blockType] ?? renderFallback
      const element = renderer(data.payload)
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
      break
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
      graph: payload.initialGraph
    },
    '*'
  )
}

function bootstrap() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${protocol}//${location.host}/ws?scenario=${encodeURIComponent(scenarioId)}`)
  liveSocket = socket

  socket.addEventListener('open', () => {
    setStatus('connected', 'connected')
  })

  socket.addEventListener('close', () => {
    setStatus('disconnected', 'disconnected')
  })

  socket.addEventListener('message', (event) => {
    try {
      const data: ServerEnvelope = JSON.parse(event.data)
      handleEnvelope(data)
    } catch (error) {
      console.error('Failed to parse message', error)
    }
  })
}

document.addEventListener('DOMContentLoaded', bootstrap)

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
