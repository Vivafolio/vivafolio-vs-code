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

interface Entity {
  entityId: string
  properties: Record<string, unknown>
  entityTypeId?: string
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

type BlockRenderer = (notification: VivafolioBlockNotification) => HTMLElement

const renderers: Record<string, BlockRenderer> = {
  'https://blockprotocol.org/@local/blocks/hello-world/v1': renderHelloBlock,
  'https://vivafolio.dev/blocks/kanban-board/v1': renderKanbanBoard,
  'https://vivafolio.dev/blocks/task-list/v1': renderTaskList,
  'https://vivafolio.dev/blocks/iframe-kanban/v1': (notification) =>
    renderIframeBlock(notification, 'iframe-kanban', 'Kanban IFrame'),
  'https://vivafolio.dev/blocks/iframe-task-list/v1': (notification) =>
    renderIframeBlock(notification, 'iframe-task-list', 'Task List IFrame')
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
        if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return
        liveSocket.send(
          JSON.stringify({
            type: 'graph/update',
            payload: {
              blockId: notification.blockId,
              kind: 'updateEntity',
              entityId: task.entityId,
              properties: { status: nextStatus }
            }
          })
        )
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

function handleEnvelope(data: ServerEnvelope) {
  switch (data.type) {
    case 'connection_ack': {
      blockRegion.innerHTML = ''
      latestPayloads.clear()
      iframeControllers.forEach((controller) => {
        controller.ready = false
      })
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
