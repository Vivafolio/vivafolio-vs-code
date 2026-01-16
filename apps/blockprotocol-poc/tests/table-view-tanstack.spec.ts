import { test, expect, type Page } from '@playwright/test'

type RecordedMessage = {
  index: number
  direction: 'in' | 'out'
  data?: any
}

type MessagePredicate = (message: RecordedMessage) => boolean

interface WebSocketRecorder {
  waitForMessage: (predicate: MessagePredicate, options?: { timeout?: number; fromIndex?: number }) => Promise<RecordedMessage>
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
  const waiters: Array<{
    predicate: MessagePredicate
    fromIndex: number
    resolve: (message: RecordedMessage) => void
    timeoutId: NodeJS.Timeout
  }> = []
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
    if (!data) return
    notify({ index: counter++, direction, data })
  }

  page.on('websocket', (socket) => {
    if (!isScenarioSocket(socket.url())) return
    socket.on('framesent', (frame) => {
      const payload = extractPayload(frame)
      if (payload) record('out', payload)
    })
    socket.on('framereceived', (frame) => {
      const payload = extractPayload(frame)
      if (payload) record('in', payload)
    })
  })

  return {
    waitForMessage: (predicate, options) => {
      const fromIndex = options?.fromIndex ?? messages.length
      const timeout = options?.timeout ?? 20_000
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

test.describe('Table View (TanStack) – POC scenario', () => {
  test('renders and shows column headers', async ({ page }) => {
    const aggregateRequests: any[] = []
    const recorder = createWebSocketRecorder(page)

    await page.route('**/graph/aggregate', async (route) => {
      const req = route.request()
      if (req.method() === 'POST') {
        try {
          aggregateRequests.push(req.postDataJSON())
        } catch {
          // ignore non-JSON bodies
        }
      }
      await route.continue()
    })

    await page.goto('/?scenario=table-view-tanstack-example&useIndexingService=true')

    await recorder.waitForMessage(
      (message) => message.direction === 'in' && message.data?.type === 'connection_ack'
    )
    await recorder.waitForMessage(
      (message) => message.direction === 'in' &&
        message.data?.type === 'vivafolioblock-notification' &&
        message.data?.payload?.blockId === 'table-view-tanstack-example-1'
    )

    const container = page.locator('.published-block-container[data-block-id="table-view-tanstack-example-1"]')
    await expect(container).toBeAttached({ timeout: 20000 })

    const tableEl = container.locator('vivafolio-table-view')
    await expect.poll(async () => await tableEl.count()).toBe(1)
    await expect(tableEl).toBeVisible({ timeout: 15000 })

    // TanStack/Solid block renders inside the custom element (typically via shadow DOM)
    await expect.poll(async () => {
      return tableEl.evaluate((el) => {
        const root = (el as any).shadowRoot as ShadowRoot | null
        if (!root) return false
        return !!root.querySelector('.vf-table-view')
      })
    }).toBe(true)

    const headers = await tableEl.evaluate((el) => {
      const root = (el as any).shadowRoot as ShadowRoot | null
      if (!root) return []
      return Array.from(root.querySelectorAll('.th'))
        .map((node) => (node.textContent ?? '').trim())
        .filter(Boolean)
    })

    expect(headers).toEqual(expect.arrayContaining(['Task ID', 'Title', 'Assignee']))

    await expect.poll(() => aggregateRequests.length).toBeGreaterThan(0)
    const reqBody = aggregateRequests[0] ?? {}
    expect(reqBody).toEqual(expect.objectContaining({ collectionId: 'tasks.csv' }))
    expect(reqBody).toEqual(expect.objectContaining({ pageNumber: expect.any(Number), itemsPerPage: expect.any(Number) }))
  })
})
