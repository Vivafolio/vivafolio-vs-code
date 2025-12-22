import { test, expect, type Page } from '@playwright/test'

/*
Three scenarios: 
(1) hydration smoke test verifying the server returns exactly the row + status schema entities
(2) UI rendering test ensuring the pill shows the current status and every linked option
(3) an end-to-end update test that checks the outgoing graph/update, the follow-up graph/ack, and the refreshed notification/DOM after choosing a new status. Assertions on the ack now focus on the entity id to accommodate transport variants.
*/
const STATUS_SCENARIO_URL = '/?scenario=status-pill-example&useIndexingService=true'

type RecordedMessage = {
  index: number
  direction: 'in' | 'out'
  data?: any
}

type MessagePredicate = (message: RecordedMessage) => boolean

interface WebSocketRecorder {
  waitForMessage: (predicate: MessagePredicate, options?: { timeout?: number, fromIndex?: number }) => Promise<RecordedMessage>
  messages: RecordedMessage[]
}

const isScenarioSocket = (url: string) => {
  try {
    return new URL(url, 'http://localhost').pathname === '/ws'
  } catch {
    return false
  }
}

const safeParse = (payload: string) => {
  try {
    return JSON.parse(payload)
  } catch {
    return undefined
  }
}

function createWebSocketRecorder(page: Page): WebSocketRecorder {
  const messages: RecordedMessage[] = []
  const waiters: Array<{ predicate: MessagePredicate, fromIndex: number, resolve: (message: RecordedMessage) => void, timeoutId: NodeJS.Timeout }> = []
  let counter = 0

  const extractPayload = (frame: { payload?: string | (() => string) }) => {
    if (typeof frame.payload === 'function') {
      return frame.payload()
    }
    return typeof frame.payload === 'string' ? frame.payload : ''
  }

  const notify = (message: RecordedMessage) => {
    messages.push(message)
    for (const waiter of [...waiters]) {
      if (message.index >= waiter.fromIndex && waiter.predicate(message)) {
        clearTimeout(waiter.timeoutId)
        waiter.resolve(message)
        const idx = waiters.indexOf(waiter)
        if (idx >= 0) {
          waiters.splice(idx, 1)
        }
      }
    }
  }

  const record = (direction: 'in' | 'out', payload: string) => {
    const data = safeParse(payload)
    if (!data) {
      return
    }
    notify({ index: counter++, direction, data })
  }

  page.on('websocket', (socket) => {
    if (!isScenarioSocket(socket.url())) {
      return
    }
    socket.on('framesent', (frame) => {
      const payload = extractPayload(frame)
      if (payload) {
        record('out', payload)
      }
    })
    socket.on('framereceived', (frame) => {
      const payload = extractPayload(frame)
      if (payload) {
        record('in', payload)
      }
    })
  })

  return {
    waitForMessage: (predicate, options) => {
      const fromIndex = options?.fromIndex ?? messages.length
      const timeout = options?.timeout ?? 15_000
      const existing = messages.find((message) => message.index >= fromIndex && predicate(message))
      if (existing) {
        return Promise.resolve(existing)
      }
      return new Promise<RecordedMessage>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const idx = waiters.findIndex((entry) => entry.timeoutId === timeoutId)
          if (idx >= 0) {
            waiters.splice(idx, 1)
          }
          reject(new Error('Timed out waiting for WebSocket message'))
        }, timeout)
        waiters.push({ predicate, fromIndex, resolve, timeoutId })
      })
    },
    messages
  }
}

const getStatusEntities = (graph: any) => {
  const entities = graph?.entities ?? []
  const rowEntity = entities.find((entity: any) => typeof entity?.properties?.statusOptionsEntityId === 'string')
  if (!rowEntity) {
    throw new Error('Status row entity not found in graph')
  }
  const statusOptionsEntityId = rowEntity.properties.statusOptionsEntityId
  const configEntity = entities.find((entity: any) => entity?.entityId === statusOptionsEntityId)
  if (!configEntity) {
    throw new Error('Status config entity not found in graph')
  }
  return { rowEntity, configEntity }
}

const getStatusOptions = (configEntity: any): Array<{ value: string, label: string }> => {
  const raw = configEntity?.properties?.availableStatuses
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((option: any) => ({
      value: typeof option?.value === 'string' ? option.value : '',
      label: typeof option?.label === 'string' ? option.label : ''
    }))
    .filter((option) => option.value && option.label)
}

const waitForConnectionAck = (recorder: WebSocketRecorder) =>
  recorder.waitForMessage((message) => message.direction === 'in' && message.data?.type === 'connection_ack')

async function bootstrapStatusPillScenario(page: Page) {
  const recorder = createWebSocketRecorder(page)
  const ackPromise = waitForConnectionAck(recorder)
  await page.goto(STATUS_SCENARIO_URL)
  const ackMessage = await ackPromise
  const entityGraph = ackMessage.data?.entityGraph
  if (!entityGraph) {
    throw new Error('Connection ack missing entityGraph')
  }
  const { rowEntity, configEntity } = getStatusEntities(entityGraph)
  return { recorder, entityGraph, rowEntity, configEntity }
}

test.describe('Status Pill – Indexing Service integration', () => {
  test('hydrates exactly one task row and one status config entity', async ({ page }) => {
    const { entityGraph, rowEntity, configEntity } = await bootstrapStatusPillScenario(page)

    expect(entityGraph.entities).toHaveLength(2)
    expect(entityGraph.links).toHaveLength(0)
    expect(rowEntity.properties?.statusOptionsEntityId).toBe(configEntity.entityId)

    const options = getStatusOptions(configEntity)
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(typeof option.label).toBe('string')
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  test('renders the current status and offers every option from the linked entity', async ({ page }) => {
    const { rowEntity, configEntity } = await bootstrapStatusPillScenario(page)
    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached({ timeout: 15_000 })

    const host = container.locator('vivafolio-status-pill')
    const pill = host.locator('.status-pill-block')
    await expect(pill).toBeVisible({ timeout: 10_000 })

    const options = getStatusOptions(configEntity)
    const currentValue = typeof rowEntity?.properties?.status === 'string'
      ? rowEntity.properties.status
      : options[0]?.value
    const currentLabel = options.find((option) => option.value === currentValue)?.label ?? options[0]?.label
    if (!currentLabel) {
      throw new Error('Unable to determine expected label for status pill')
    }

    await expect(pill).toContainText(currentLabel)

    await pill.click()
    const menuItems = host.locator('[role="menuitem"] span')
    await expect(menuItems).toHaveCount(options.length)
    const renderedLabels = await menuItems.allTextContents()
    expect(new Set(renderedLabels)).toEqual(new Set(options.map((option) => option.label)))
  })

  test('sends graph/update with the new status and reflects the server notification', async ({ page }) => {
    const { recorder, rowEntity, configEntity } = await bootstrapStatusPillScenario(page)
    const container = page.locator('.published-block-container')
    const host = container.locator('vivafolio-status-pill')
    const pill = host.locator('.status-pill-block')
    await expect(pill).toBeVisible({ timeout: 10_000 })

    const options = getStatusOptions(configEntity)
    if (!options.length) {
      throw new Error('No status options available for test')
    }
    const currentValue = typeof rowEntity?.properties?.status === 'string'
      ? rowEntity.properties.status
      : options[0].value
    const nextOption = options.find((option) => option.value !== currentValue) ?? options[0]

    const pendingUpdate = recorder.waitForMessage(
      (message) => message.direction === 'out' && message.data?.type === 'graph/update'
    )
    const pendingAck = recorder.waitForMessage(
      (message) => message.direction === 'in' && message.data?.type === 'graph/ack'
    )
    const startingIndex = recorder.messages.length
    const pendingNotification = recorder.waitForMessage(
      (message) => message.direction === 'in' &&
        message.data?.type === 'vivafolioblock-notification' &&
        message.data?.payload?.blockId === 'status-pill-example-1' &&
        message.data?.payload?.entityGraph?.entities?.some((entity: any) => entity?.properties?.status === nextOption.value),
      { fromIndex: startingIndex }
    )

    await pill.click()
    const menuItem = host.locator('[role="menuitem"]').filter({ hasText: nextOption.label })
    await expect(menuItem).toBeVisible()
    await menuItem.click()

    const updateMessage = await pendingUpdate
    expect(updateMessage.data?.payload?.properties).toEqual({ status: nextOption.value })

    const ackMessage = await pendingAck
    expect(ackMessage.data?.payload?.entityId).toBe(rowEntity.entityId)

    await pendingNotification
    await expect(pill).toContainText(nextOption.label)
  })
})
