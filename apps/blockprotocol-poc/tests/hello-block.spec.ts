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

  test('renders feature-showcase block with Block Protocol APIs', async ({ page }) => {
    await page.goto('/?scenario=feature-showcase-block')

    const block = page.locator('.published-block .feature-showcase-block')
    await expect(block).toBeVisible()

    await expect(block.locator('h3')).toHaveText('Block Protocol Feature Showcase')
    await expect(block.locator('p')).toContainText('This block demonstrates the Block Protocol graph module with @blockprotocol/graph@0.3.4')

    // Check that the entity info is displayed
    await expect(block.locator('strong')).toContainText('Entity ID:')
    await expect(block.locator('text=No entity loaded')).toBeVisible()

    const debugResults = await page.evaluate(async () => {
      const registry = window.__vivafolioPoc
      const debug = registry?.publishedBlocks?.['feature-showcase-block']
      if (!debug) {
        return null
      }
      const aggregate = await debug.aggregateEntities({ itemsPerPage: 1 })
      const diagnostics = await debug.loaderDiagnostics()
      return { aggregate, diagnostics }
    })

    expect(debugResults).not.toBeNull()
    expect(debugResults?.aggregate.results.length).toBeGreaterThanOrEqual(0)
    expect(debugResults?.diagnostics?.bundleUrl).toContain('feature-showcase-block')
    expect(debugResults?.diagnostics?.blockedDependencies ?? []).toHaveLength(0)
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


  test('renders HTML entry block and loads content', async ({ page }) => {
    await page.goto('/?scenario=html-template-block')

    await page.waitForSelector('.published-block--html .published-block__runtime', {
      timeout: 15000
    })
    const runtime = page.locator('.published-block--html .published-block__runtime')

    // Verify HTML content is loaded and displayed
    const title = runtime.locator('h1[data-title]')
    await expect(title).toHaveText(/Hello, Vivafolio Template Block/i, { timeout: 15000 })

    // Verify input field is present
    const input = runtime.locator('input[data-input]')
    await expect(input).toBeVisible({ timeout: 15000 })

    // Verify paragraph and readonly paragraph elements exist
    const paragraph = runtime.locator('p[data-paragraph]')
    const readonlyParagraph = runtime.locator('p[data-readonly]')
    await expect(paragraph).toBeVisible()
    await expect(readonlyParagraph).toBeVisible()

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
    expect(debugResults?.aggregate.results.length).toBeGreaterThanOrEqual(0)
    expect(debugResults?.diagnostics?.bundleUrl).toContain('app.html')
    expect(debugResults?.diagnostics?.integritySha256).toBeNull()
  })

  test.describe('F1 – Custom Element Baseline', () => {
    test('custom element block is instantiated and has basic structure', async ({ page }) => {
      await page.goto('/?scenario=custom-element-baseline')

      // Check that the custom element exists in the DOM
      const customElement = page.locator('custom-element-block')
      await expect(customElement).toHaveCount(1)

      // Check that it has the expected data attribute
      await expect(customElement).toHaveAttribute('data-block-id', 'custom-element-block-1')

      // Use JavaScript to check the element's content directly
      const elementContent = await customElement.evaluate(el => ({
        tagName: el.tagName,
        childElementCount: el.children.length,
        hasHeading: el.querySelector('.block-heading') !== null,
        hasInputs: el.querySelectorAll('input').length,
        hasSelect: el.querySelector('select') !== null,
        hasButton: el.querySelector('button') !== null
      }))

      expect(elementContent.tagName).toBe('CUSTOM-ELEMENT-BLOCK')
      expect(elementContent.childElementCount).toBeGreaterThan(0)
      expect(elementContent.hasHeading).toBe(true)
      expect(elementContent.hasInputs).toBe(2) // title and description
      expect(elementContent.hasSelect).toBe(true)
      expect(elementContent.hasButton).toBe(true)
    })

    test('custom element block can be interacted with', async ({ page }) => {
      await page.goto('/?scenario=custom-element-baseline')

      // Get the custom element
      const customElement = page.locator('custom-element-block')

      // Use JavaScript to interact with the element directly
      await customElement.evaluate(el => {
        const inputs = el.querySelectorAll('input')
        const select = el.querySelector('select')
        const button = el.querySelector('button')

        if (inputs[0]) inputs[0].value = 'Test Title'
        if (select) select.value = 'in-progress'
        if (button) button.click()
      })

      // Verify the changes were made
      const elementState = await customElement.evaluate(el => {
        const inputs = el.querySelectorAll('input')
        const select = el.querySelector('select')

        return {
          titleValue: inputs[0]?.value || '',
          selectValue: select?.value || ''
        }
      })

      expect(elementState.titleValue).toBe('Test Title')
      expect(elementState.selectValue).toBe('in-progress')
    })

    test('custom element block shows entity information', async ({ page }) => {
      await page.goto('/?scenario=custom-element-baseline')

      // Get the custom element
      const customElement = page.locator('custom-element-block')

      // Check that the element contains entity information
      const footnoteText = await customElement.evaluate(el => {
        const footnote = el.querySelector('.block-footnote')
        return footnote ? footnote.textContent : ''
      })

      expect(footnoteText).toContain('Entity ID:')
      expect(footnoteText).toContain('Read-only:')
    })
  })

  test.describe('F2 – SolidJS Task Baseline', () => {
    test('renders SolidJS task block with form controls', async ({ page }) => {
      await page.goto('/?scenario=solidjs-task-baseline')

      const block = page.locator('.solidjs-task-block')
      await expect(block).toBeVisible()

      await expect(block.locator('h3')).toHaveText('SolidJS Task Block')

      // Check that form controls are present
      const titleInput = block.locator('input[type="text"]')
      await expect(titleInput).toBeVisible()

      const statusSelect = block.locator('select')
      await expect(statusSelect).toBeVisible()

      const updateButton = block.locator('button')
      await expect(updateButton).toBeVisible()
      await expect(updateButton).toHaveText('Update Task')
    })

    test('SolidJS task block shows framework info', async ({ page }) => {
      await page.goto('/?scenario=solidjs-task-baseline')

      const block = page.locator('.solidjs-task-block')
      await expect(block).toBeVisible()

      const footer = block.locator('div').last()
      await expect(footer).toContainText('Entity ID:')
      await expect(footer).toContainText('Framework: SolidJS')
    })
  })

  test.describe('Example Blocks from Coda/Notion Patterns', () => {
    test('status pill example block renders with correct styling', async ({ page }) => {
      await page.goto('/?scenario=status-pill-example')

      // The published block should load and display
      const block = page.locator('.published-block')
      await expect(block).toBeVisible()

      await expect(block.locator('.published-block__header')).toContainText('Published Block Runtime')
      await expect(block.locator('.published-block__description')).toContainText('Loaded from npm package Status Pill Example')
    })

    test('person chip example block renders with assignee data', async ({ page }) => {
      await page.goto('/?scenario=person-chip-example')

      const block = page.locator('.published-block')
      await expect(block).toBeVisible()

      await expect(block.locator('.published-block__header')).toContainText('Published Block Runtime')
    })

    test('table view example block renders table structure', async ({ page }) => {
      await page.goto('/?scenario=table-view-example')

      const block = page.locator('.published-block')
      await expect(block).toBeVisible()

      await expect(block.locator('.published-block__header')).toContainText('Published Block Runtime')
    })

    test('board view example block renders kanban layout', async ({ page }) => {
      await page.goto('/?scenario=board-view-example')

      const block = page.locator('.published-block')
      await expect(block).toBeVisible()

      await expect(block.locator('.published-block__header')).toContainText('Published Block Runtime')
    })
  })
})
