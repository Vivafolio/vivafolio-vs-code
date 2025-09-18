import { test, expect } from '@playwright/test'

test.describe('Milestone 0 – Hello Block', () => {
  test('renders hello block payload on connect', async ({ page }) => {
    await page.goto('/?scenario=hello-world')

    const status = page.locator('#status')
    await expect(status).toHaveText(/connected/i)

    const block = page.locator('.hello-block')
    await expect(block).toBeVisible()

    await expect(block.locator('h2')).toHaveText('Hello Block')
    await expect(block.locator('p')).toContainText('Vivafolio Explorer')

    const payload = block.locator('pre')
    const payloadText = await payload.textContent()
    expect(payloadText).toContain('hello-block-1')
    expect(payloadText).toContain('https://blockprotocol.org/@local/blocks/hello-world/v1')
  })

  test('renders nested Kanban block with task and user cards', async ({ page }) => {
    await page.goto('/?scenario=nested-kanban')

    const board = page.locator('.kanban-board')
    await expect(board).toBeVisible()
    await expect(board.locator('.kanban-board__header')).toHaveText(/Iteration Zero/)

    const columns = board.locator('.kanban-column')
    await expect(columns).toHaveCount(3)

    const taskCards = board.locator('.task-card')
    await expect(taskCards).toHaveCount(3)

    const firstTask = taskCards.first()
    await expect(firstTask.locator('.task-card__title')).toContainText('Design nested block API')
    await expect(firstTask.locator('.user-profile__info strong')).toContainText('Dana Developer')
  })

  test('keeps Kanban and task list views in sync', async ({ page }) => {
    await page.goto('/?scenario=multi-view-sync')

    const board = page.locator('.kanban-board')
    const list = page.locator('.task-list')
    await expect(board).toBeVisible()
    await expect(list).toBeVisible()

    const todoColumnTitles = board.locator('[data-column-id="todo"] .task-card__title')
    await expect(todoColumnTitles).toContainText('Design nested block API')

    const advanceButton = list.locator('[data-entity-id="task-1"] button[data-action="advance-status"]')
    await advanceButton.click()

    const inProgressColumn = board.locator('[data-column-id="doing"] .task-card__title')
    const designTaskInProgress = inProgressColumn.filter({ hasText: 'Design nested block API' })
    await expect(designTaskInProgress).toHaveCount(1)

    const designTaskInTodo = todoColumnTitles.filter({ hasText: 'Design nested block API' })
    await expect(designTaskInTodo).toHaveCount(0)
  })

  test('loads iframe scenario and propagates iframe-driven updates', async ({ page }) => {
    await page.goto('/?scenario=iframe-webviews')

    const kanbanFrameElement = await page.waitForSelector('iframe[data-block-id="iframe-kanban-1"]')
    const kanbanFrame = await kanbanFrameElement.contentFrame()
    await kanbanFrame?.waitForSelector('[data-column-id="todo"] li', {
      hasText: 'Design nested block API'
    })

    const taskListFrameElement = await page.waitForSelector(
      'iframe[data-block-id="iframe-task-list-1"]'
    )
    const initialTaskListSrc = await taskListFrameElement.getAttribute('src')
    const taskListFrame = await taskListFrameElement.contentFrame()
    await taskListFrame?.waitForSelector('button[data-action="advance-status"][data-entity-id="task-1"]')

    await taskListFrame?.click('button[data-action="advance-status"][data-entity-id="task-1"]')

    const refreshedKanbanFrameElement = await page.waitForSelector(
      'iframe[data-block-id="iframe-kanban-1"]'
    )
    const refreshedKanbanFrame = await refreshedKanbanFrameElement.contentFrame()
    await refreshedKanbanFrame?.waitForSelector('[data-column-id="doing"] li', {
      hasText: 'Design nested block API'
    })

    const refreshedTaskListSrc = await taskListFrameElement.getAttribute('src')
    expect(initialTaskListSrc).not.toBe(refreshedTaskListSrc)
    expect(refreshedTaskListSrc).toContain('cache=')
  })

  test('executes published npm block across multiple views', async ({ page }) => {
    await page.goto('/?scenario=real-test-block')

    const blocks = page.locator('.published-block')
    await expect(blocks).toHaveCount(2)

    const firstRuntime = blocks.nth(0).locator('.published-block__runtime')
    const secondRuntime = blocks.nth(1).locator('.published-block__runtime')

    const firstHeading = firstRuntime.locator('h1')
    const secondHeading = secondRuntime.locator('h1')
    await expect(firstHeading).toHaveText(/Hello, /)
    await expect(secondHeading).toHaveText(/Hello, /)

    const initialFirstHeading = await firstHeading.textContent()
    const initialSecondHeading = await secondHeading.textContent()

    const metadata = blocks.locator('.published-block__metadata')
    await expect(metadata.nth(0)).toContainText('"name": "test-npm-block"')
    await expect(metadata.nth(1)).toContainText('"name": "test-npm-block"')

    const initialMetadataRaw = await metadata.nth(0).textContent()
    const initialMetadata = initialMetadataRaw ? JSON.parse(initialMetadataRaw) : {}

    const updateButton = firstRuntime.getByRole('button', { name: /Update Name/i })
    await updateButton.click()

    await expect.poll(async () => {
      const raw = await metadata.nth(0).textContent()
      if (!raw) return initialMetadata.name
      try {
        const parsed = JSON.parse(raw)
        return parsed.name
      } catch {
        return initialMetadata.name
      }
    }).not.toBe(initialMetadata.name)

    await expect
      .poll(async () => {
        const raw = await metadata.nth(1).textContent()
        if (!raw) return initialMetadata.name
        try {
          const parsed = JSON.parse(raw)
          return parsed.name
        } catch {
          return initialMetadata.name
        }
      })
      .not.toBe(initialMetadata.name)

    await expect.poll(async () => firstHeading.textContent()).not.toBe(initialFirstHeading)
    await expect.poll(async () => secondHeading.textContent()).not.toBe(initialSecondHeading)

    const firstResources = blocks.nth(0).locator('.published-block__resources li')
    const secondResources = blocks.nth(1).locator('.published-block__resources li')
    await expect(firstResources).toHaveCount(3)
    await expect(secondResources).toHaveCount(3)
    await expect(firstResources.nth(0)).toContainText('block-metadata.json')
    await expect(firstResources.nth(1)).toContainText('main.js')
    await expect(firstResources.nth(2)).toContainText('icon.svg')
    await expect(secondResources.nth(0)).toContainText('block-metadata.json')
    await expect(secondResources.nth(1)).toContainText('main.js')
    await expect(secondResources.nth(2)).toContainText('icon.svg')

    const debugResults = await page.evaluate(async () => {
      const registry = window.__vivafolioPoc
      const debug = registry?.publishedBlocks?.['test-npm-block']
      if (!debug) {
        return null
      }
      const aggBefore = await debug.aggregateEntities({ itemsPerPage: 1 })
      const created = await debug.createLinkedAggregation({ path: 'tasks' })
      const linkedAfterCreate = await debug.listLinkedAggregations()
      const updated = await debug.updateLinkedAggregation({
        aggregationId: created.aggregationId,
        operation: { filter: 'status:todo' }
      })
      const linkedAfterUpdate = await debug.listLinkedAggregations()
      const removed = await debug.deleteLinkedAggregation(created.aggregationId)
      const linkedAfterDelete = await debug.listLinkedAggregations()
      const loaderDiagnostics = await debug.loaderDiagnostics()
      return {
        aggBefore,
        created,
        updated,
        linkedAfterCreate,
        linkedAfterUpdate,
        removed,
        linkedAfterDelete,
        loaderDiagnostics
      }
    })

    expect(debugResults).not.toBeNull()
    expect(debugResults?.aggBefore.results.length).toBe(1)
    expect(debugResults?.aggBefore.operation.totalCount).toBeGreaterThanOrEqual(1)
    expect(debugResults?.created.path).toBe('tasks')
    expect(debugResults?.linkedAfterCreate).toHaveLength(1)
    expect(debugResults?.updated.operation).toEqual({ filter: 'status:todo' })
    expect(debugResults?.linkedAfterUpdate).toHaveLength(1)
    expect(debugResults?.removed).toBe(true)
    expect(debugResults?.linkedAfterDelete).toHaveLength(0)
    expect(debugResults?.loaderDiagnostics?.bundleUrl).toContain('test-npm-block')
    expect(debugResults?.loaderDiagnostics?.blockedDependencies ?? []).toHaveLength(0)
    if (debugResults?.loaderDiagnostics?.integritySha256) {
      expect(debugResults.loaderDiagnostics.integritySha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  test('loads CommonJS block with local chunk and stylesheet', async ({ page }) => {
    await page.goto('/?scenario=resource-loader')

    const block = page.locator('.published-block .cjs-resource-block')
    await expect(block).toBeVisible()
    await expect(block.locator('h2')).toHaveText('Resource Loader Diagnostic')
    await expect(block.locator('p').first()).toContainText('Local chunk.js executed successfully.')
    await expect(block.locator('.cjs-resource-block__name')).toContainText('Entity name: CJS Resource Block')

    const borderColor = await block.evaluate((element) => window.getComputedStyle(element).borderColor)
    expect(borderColor).toMatch(/59, 130, 246/)
  })

  test('renders custom element block with helper wiring', async ({ page }) => {
    page.on('console', (message) => {
      console.log('[browser]', message.type(), message.text())
    })

    await page.goto('/?scenario=custom-element-baseline')

    const block = page.locator('vivafolio-custom-block')
    await expect(block).toBeVisible()

    const shadow = block.evaluateHandle((el) => el.shadowRoot)
    const contentLocator = block.locator('shadow=.entity-copy')
    await expect(contentLocator).toContainText('Custom Element Baseline')

    const input = block.locator('shadow=.name-input')
    await input.fill('Updated via Custom Element')
    await input.blur()

    await expect(contentLocator).toContainText('Updated via Custom Element')
  })

  test('renders HTML entry block and propagates updates', async ({ page }) => {
    await page.goto('/?scenario=html-template-block')

    await page.waitForSelector('.published-block--html .published-block__runtime', {
      timeout: 15000
    })
    const runtime = page.locator('.published-block--html .published-block__runtime')

    const title = runtime.locator('h1[data-title]')
    await expect(title).toHaveText(/Hello, Vivafolio Template Block/i, { timeout: 15000 })

    const input = runtime.locator('input[data-input]')
    await expect(input).toBeVisible({ timeout: 15000 })

    await input.fill('Updated Template Name')
    await input.blur()

    await expect.poll(async () => title.textContent()).toContain('Updated Template Name')

    const metadata = page.locator('.published-block--html .published-block__metadata')
    await expect.poll(async () => metadata.textContent()).toContain('Updated Template Name')

    const debugResults = await page.evaluate(async () => {
      const registry = window.__vivafolioPoc
      const debug = registry?.publishedBlocks?.['html-template-block-1']
      if (!debug) {
        return null
      }
      const aggregate = await debug.aggregateEntities({ itemsPerPage: 10 })
      const diagnostics = await debug.loaderDiagnostics()
      return { aggregate, diagnostics }
    })

    expect(debugResults).not.toBeNull()
    expect(debugResults?.aggregate.results.length).toBeGreaterThan(0)
    expect(debugResults?.diagnostics?.bundleUrl).toContain('app.html')
    expect(debugResults?.diagnostics?.integritySha256).toBeNull()
  })
})
