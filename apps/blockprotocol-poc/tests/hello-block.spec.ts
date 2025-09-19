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
    // Listen for console messages
    const consoleMessages: string[] = []
    page.on('console', msg => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`)
    })

    await page.goto('/?scenario=feature-showcase-block')

    // Check if the container exists and has content
    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached() // Just check it exists in DOM

    // Wait for content to appear (block loader is async)
    await page.waitForTimeout(5000)

    // Check the container's HTML content
    const containerHtml = await container.innerHTML()
    console.log('Container HTML:', containerHtml)

    // Check what's inside the block-mount div
    const blockMount = container.locator('.block-mount')
    if (await blockMount.isVisible()) {
      const blockMountHtml = await blockMount.innerHTML()
      console.log('Block mount HTML:', blockMountHtml)
    }

    // Log all console messages
    console.log('Console messages:', consoleMessages)

    // Check if there's content (block-mount should be there)
    expect(containerHtml).toContain('block-mount')

    // Check if there's an error message in the container
    const errorDiv = container.locator('.block-error')
    if (await errorDiv.isVisible()) {
      const errorText = await errorDiv.textContent()
      console.log('Block loading error:', errorText)
      throw new Error(`Block failed to load: ${errorText}`)
    }

    // Check for the actual rendered React component content
    const featureShowcaseBlock = container.locator('.feature-showcase-block')
    await expect(featureShowcaseBlock).toBeVisible()

    await expect(featureShowcaseBlock.locator('h3')).toHaveText('Block Protocol Feature Showcase')
    await expect(featureShowcaseBlock.locator('p').first()).toContainText('This block demonstrates the Block Protocol graph module')

    // Check that the entity info is displayed
    const entityInfo = featureShowcaseBlock.locator('div').last()
    await expect(entityInfo).toContainText('Entity ID:')
    await expect(entityInfo).toContainText('feature-showcase-block')
  })

  test('loads CommonJS block with local chunk and stylesheet', async ({ page }) => {
    await page.goto('/?scenario=resource-loader')

    const container = page.locator('.published-block-container')
    await expect(container).toBeVisible()

    // Check what's actually rendered
    const containerHtml = await container.innerHTML()
    console.log('Resource loader container HTML:', containerHtml)

    const block = container.locator('.cjs-resource-block')
    await expect(block).toBeVisible()
    await expect(block.locator('h2')).toHaveText('Resource Loader Diagnostic')
    await expect(block.locator('p').first()).toContainText('Local chunk.js executed successfully.')
    await expect(block.locator('.cjs-resource-block__name')).toContainText('Entity name: CJS Resource Block')

    const borderColor = await block.evaluate((element) => window.getComputedStyle(element).borderColor)
    expect(borderColor).toMatch(/59, 130, 246/)
  })


  test('renders HTML entry block and loads content', async ({ page }) => {
    // Listen for console messages
    const consoleMessages: string[] = []
    page.on('console', msg => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`)
    })

    await page.goto('/?scenario=html-template-block')

    // Wait for the block to load
    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached()

    // Wait a bit more for async loading
    await page.waitForTimeout(3000)

    // Check what's actually rendered
    const containerHtml = await container.innerHTML()
    console.log('HTML template container HTML:', containerHtml)

    // Log console messages
    console.log('Console messages for HTML template:', consoleMessages.filter(msg => msg.includes('BlockLoader') || msg.includes('POC')))

    // The HTML template block renders its content directly in the container
    const title = container.locator('h1[data-title]')
    const input = container.locator('input[data-input]')
    const paragraph = container.locator('p[data-paragraph]')
    const readonlyParagraph = container.locator('p[data-readonly]')

    // Check that elements exist
    await expect(title).toBeAttached()
    await expect(input).toBeAttached()
    await expect(paragraph).toBeAttached()
    await expect(readonlyParagraph).toBeAttached()

    // Verify actual content from the HTML template
    await expect(title).toHaveText('Hello, Vivafolio Template Block')
    await expect(input).toHaveValue('Vivafolio Template Block')
    await expect(paragraph).toContainText('This HTML template block demonstrates Block Protocol integration')
    await expect(readonlyParagraph).toHaveText('Vivafolio Template Block')

    // Test interaction: update the input field
    await input.fill('Updated by test')
    await expect(input).toHaveValue('Updated by test')
  })
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

      // Check initial state
      const initialState = await customElement.evaluate(el => {
        const inputs = el.querySelectorAll('input')
        const select = el.querySelector('select')
        const button = el.querySelector('button')

        return {
          titleValue: inputs[0]?.value || '',
          descValue: inputs[1]?.value || '',
          selectValue: select?.value || '',
          hasButton: !!button
        }
      })

      expect(initialState.titleValue).toBe('Custom Element Baseline')
      expect(initialState.descValue).toBe('Demonstrates vanilla WebComponent integration')
      expect(initialState.selectValue).toBe('todo')
      expect(initialState.hasButton).toBe(true)

      // Verify elements are interactive (not disabled)
      const isInteractive = await customElement.evaluate(el => {
        const inputs = el.querySelectorAll('input')
        const select = el.querySelector('select')

        return {
          titleEnabled: !inputs[0]?.disabled,
          descEnabled: !inputs[1]?.disabled,
          selectEnabled: !select?.disabled
        }
      })

      expect(isInteractive.titleEnabled).toBe(true)
      expect(isInteractive.descEnabled).toBe(true)
      expect(isInteractive.selectEnabled).toBe(true)
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
      const inputs = block.locator('input[type="text"]')
      await expect(inputs).toHaveCount(2) // Title and Description inputs

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

      // Wait for the block to load
      const container = page.locator('.published-block-container')
      await expect(container).toBeAttached()

      // Check for the status pill component
      const statusPill = container.locator('.status-pill-block')
      await expect(statusPill).toBeVisible()

      // Should display status text
      await expect(statusPill).toContainText('In Progress')

      // Check the visual styling (should have background color)
      const backgroundColor = await statusPill.evaluate((el) => window.getComputedStyle(el).backgroundColor)
      expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)') // Should have a visible background

      // Should be clickable (has cursor pointer)
      const cursor = await statusPill.evaluate((el) => window.getComputedStyle(el).cursor)
      expect(cursor).toBe('pointer')
    })

    test('person chip example block renders with assignee data', async ({ page }) => {
      await page.goto('/?scenario=person-chip-example')

      // Wait for the block to load
      const container = page.locator('.published-block-container')
      await expect(container).toBeAttached()

      // Check for person chip component
      const personChip = container.locator('.person-chip-block')
      await expect(personChip).toBeVisible()

      // Should display some person/assignee information
      await expect(personChip).toContainText('Alice') // Default assignee from the block
    })

    test.skip('table view example block renders table structure', async ({ page }) => {
      // TODO: Fix table view block loading in static scenarios
      // Currently the block works with WebSocket transport but not in static published mode
      await page.goto('/?scenario=table-view-example')

      // Wait for the block to load
      const container = page.locator('.published-block-container')
      await expect(container).toBeAttached()

      // Check for table view block structure
      const tableView = container.locator('.table-view-block')
      await expect(tableView).toBeVisible()

      // Should contain a table
      const table = tableView.locator('table')
      await expect(table).toBeVisible()

      // Should have table headers
      const headers = table.locator('thead th')
      expect(await headers.count()).toBeGreaterThan(0) // Should have some headers

      // Should have table rows
      const rows = table.locator('tbody tr')
      expect(await rows.count()).toBeGreaterThan(0) // Should have some rows
    })

    test('board view example block renders kanban layout', async ({ page }) => {
      await page.goto('/?scenario=board-view-example')

      // Wait for the block to load
      const container = page.locator('.published-block-container')
      await expect(container).toBeAttached()

      // Check for kanban board structure
      const board = container.locator('.board-view-block')
      await expect(board).toBeVisible()

      // Should have kanban columns
      const columns = board.locator('.kanban-column')
      expect(await columns.count()).toBeGreaterThan(0) // Should have some columns
    })
  })
