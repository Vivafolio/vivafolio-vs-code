import { test, expect } from '@playwright/test'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

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
    await kanbanFrame?.waitForSelector('[data-column-id="todo"] li:has-text("Design nested block API")')

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
    await refreshedKanbanFrame?.waitForSelector('[data-column-id="doing"] li:has-text("Design nested block API")')

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
    await expect(paragraph).toContainText('The entityId of this block is html-template-block-entity')
    await expect(readonlyParagraph).toHaveText('Vivafolio Template Block')

    // Test interaction: update the input field
    await input.fill('Updated by test')
    await expect(input).toHaveValue('Updated by test')
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
  // Status Pill now has a dedicated spec in status-pill.spec.ts

  test('person chip example block renders with assignee data', async ({ page }) => {
    await page.goto('/?scenario=person-chip-example&useIndexingService=true')

    // Wait for the block to load
    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached()

    // Check for person chip component
    const personChip = container.locator('.person-chip-block')
    await expect(personChip).toBeVisible()

    // Should display some person/assignee information
    await expect(personChip).toContainText('Alice') // Default assignee from the block
  })

  test('table view example block renders table structure', async ({ page }) => {
    console.log('Starting table view test')

    // Listen for console messages from the page
    page.on('console', msg => {
      console.log('PAGE LOG:', msg.text())
    })

    await page.goto('/?scenario=table-view-example&useIndexingService=true')
    console.log('Page loaded, waiting for container...')

    // Wait for the block to load
    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached({ timeout: 15000 })
    console.log('Container attached, waiting for content...')


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

    const block = page.locator('.published-block-container').locator('.board-view-block')
    await expect(block).toBeVisible()

    // Should have a header
    const header = block.locator('h2').filter({ hasText: 'Task Board' })
    await expect(header).toBeVisible()

    // Should have kanban columns
    const columns = block.locator('.kanban-column')
    expect(await columns.count()).toBeGreaterThan(0) // Should have some columns
  })
})

test.describe('Local Block Development', () => {
  test.skip(!process.env.TEST_LOCAL_BLOCKS, 'Requires TEST_LOCAL_BLOCKS=1')

  test('local block development workflow - priority resolution', async ({ page }) => {
    const testBlockName = '@vivafolio/test-priority-block'
    const testBlockPath = path.join(process.cwd(), 'test-blocks', testBlockName)

    try {
      // Create test block directory structure
      await fs.mkdir(testBlockPath, { recursive: true })

      // Create custom block metadata
      const blockMetadata = {
        blockprotocol: {
          name: testBlockName,
          version: '1.0.0',
          displayName: 'Test Priority Block',
          blockType: {
            entryPoint: '1.0',
            tag: 'test-priority'
          },
          protocol: '0.3'
        },
        vivafolio: {
          build: {
            entry: 'index.html',
            output: 'index.html'
          },
          development: {
            port: 3001,
            hotReload: true
          },
          resources: {
            caching: 'aggressive',
            integrity: true
          }
        }
      }
      await fs.writeFile(
        path.join(testBlockPath, 'block-metadata.json'),
        JSON.stringify(blockMetadata, null, 2)
      )

      // Create custom HTML content that proves it's the local version
      const blockHtml = `<div style="border: 3px solid #ff6b6b; padding: 20px; background: linear-gradient(45deg, #ffeaa7, #fab1a0); border-radius: 8px; font-family: Arial, sans-serif; text-align: center;">
  <div style="background: #e17055; color: white; padding: 10px; border-radius: 4px; font-weight: bold; margin: 10px 0;">LOCAL BLOCK PRIORITY TEST</div>
  <div>This block was served from local test-blocks directory</div>
  <div>Block ID: <span id="block-id">custom-block-1</span></div>
  <div>Entity ID: <span id="entity-id">test-priority-entity</span></div>
</div>`
      await fs.writeFile(path.join(testBlockPath, 'index.html'), blockHtml)

      // Test that the local block is served directly via cache URL
      const cacheUrl = `/cache/${encodeURIComponent(testBlockName)}/latest/index.html`
      await page.goto(cacheUrl)

      // Verify that the local block HTML is served correctly
      const blockDiv = page.locator('div').filter({ hasText: 'LOCAL BLOCK PRIORITY TEST' }).first()
      await expect(blockDiv).toBeVisible()

      // Verify the content
      await expect(blockDiv).toContainText('LOCAL BLOCK PRIORITY TEST')
      await expect(blockDiv).toContainText('This block was served from local test-blocks directory')
      await expect(blockDiv).toContainText('Block ID: custom-block-1')
      await expect(blockDiv).toContainText('Entity ID: test-priority-entity')

    } finally {
      // Clean up test block
      try {
        await fs.rm(testBlockPath, { recursive: true, force: true })
      } catch (error) {
        console.warn('Failed to clean up test block:', error)
      }
    }
  })

  test('local block development workflow - real-time updates', async ({ page }) => {
    const testBlockName = '@vivafolio/test-realtime-block'
    const testBlockPath = path.join(process.cwd(), 'test-blocks', testBlockName)

    try {
      // Create test block directory structure
      await fs.mkdir(testBlockPath, { recursive: true })

      // Create initial block metadata
      const blockMetadata = {
        blockprotocol: {
          name: testBlockName,
          version: '1.0.0',
          displayName: 'Test Realtime Block',
          blockType: {
            entryPoint: '1.0',
            tag: 'test-realtime'
          },
          protocol: '0.3'
        },
        vivafolio: {
          build: {
            entry: 'index.html',
            output: 'index.html'
          },
          development: {
            port: 3001,
            hotReload: true
          },
          resources: {
            caching: 'aggressive',
            integrity: true
          }
        }
      }
      await fs.writeFile(
        path.join(testBlockPath, 'block-metadata.json'),
        JSON.stringify(blockMetadata, null, 2)
      )

      // Create initial HTML content
      const initialHtml = `<div class="realtime-test-block">
  <div class="status-indicator">INITIAL CONTENT</div>
  <div class="content-display" id="content">INITIAL CONTENT</div>
  <div>Block ID: <span id="block-id">custom-block-1</span></div>
  <div>Last Updated: <span id="timestamp">${new Date().toLocaleTimeString()}</span></div>
</div>

<style>
.realtime-test-block {
  border: 2px solid #3498db;
  padding: 20px;
  background: #ecf0f1;
  border-radius: 8px;
  font-family: Arial, sans-serif;
  text-align: center;
}
.content-display {
  font-size: 18px;
  font-weight: bold;
  color: #2c3e50;
  margin: 10px 0;
}
.status-indicator {
  background: #27ae60;
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  display: inline-block;
  margin: 10px 0;
}
</style>`
      await fs.writeFile(path.join(testBlockPath, 'index.html'), initialHtml)

      // Test that the cache serves the initial content
      const cacheUrl = `/cache/${encodeURIComponent(testBlockName)}/latest/index.html`
      await page.goto(cacheUrl)

      // Verify initial content is served
      const contentDiv = page.locator('div').filter({ hasText: 'INITIAL CONTENT' }).first()
      await expect(contentDiv).toBeVisible()
      await expect(contentDiv).toContainText('INITIAL CONTENT')

      // Modify the block file
      const updatedHtml = `<div style="border: 2px solid #3498db; padding: 20px; background: #ecf0f1; border-radius: 8px; font-family: Arial, sans-serif; text-align: center;">
  <div style="background: #e74c3c; color: white; padding: 5px 10px; border-radius: 4px; display: inline-block; margin: 10px 0;">FILE MODIFIED</div>
  <div style="font-size: 18px; font-weight: bold; color: #2c3e50; margin: 10px 0;" id="content">MODIFIED CONTENT</div>
  <div>Block ID: <span id="block-id">custom-block-1</span></div>
  <div>Last Updated: <span id="timestamp">${new Date().toLocaleTimeString()}</span></div>
</div>`
      await fs.writeFile(path.join(testBlockPath, 'index.html'), updatedHtml)

      // Wait for file change to be detected (file watcher should invalidate cache)
      await page.waitForTimeout(2000)

      // Reload the page to get the updated content
      await page.reload()

      // Verify that the cache serves the modified content
      const modifiedDiv = page.locator('div').filter({ hasText: 'FILE MODIFIED' }).first()
      await expect(modifiedDiv).toBeVisible()
      await expect(modifiedDiv).toContainText('MODIFIED CONTENT')

    } finally {
      // Clean up test block
      try {
        await fs.rm(testBlockPath, { recursive: true, force: true })
      } catch (error) {
        console.warn('Failed to clean up test block:', error)
      }
    }
  })

  test('local block development workflow - cache invalidation', async ({ page }) => {
    const testBlockName = '@vivafolio/test-cache-block'
    const testBlockPath = path.join(process.cwd(), 'test-blocks', testBlockName)

    try {
      // Create test block directory structure
      await fs.mkdir(testBlockPath, { recursive: true })

      // Create block metadata
      const blockMetadata = {
        blockprotocol: {
          name: testBlockName,
          version: '1.0.0',
          displayName: 'Test Cache Block',
          blockType: {
            entryPoint: '1.0',
            tag: 'test-cache'
          },
          protocol: '0.3'
        },
        vivafolio: {
          build: {
            entry: 'index.html',
            output: 'index.html'
          },
          development: {
            port: 3001,
            hotReload: true
          },
          resources: {
            caching: 'aggressive',
            integrity: true
          }
        }
      }
      await fs.writeFile(
        path.join(testBlockPath, 'block-metadata.json'),
        JSON.stringify(blockMetadata, null, 2)
      )

      // Create initial block content
      const blockHtml = `<div class="cache-test-block">
  <div id="cache-status">CACHE TEST BLOCK - INITIAL</div>
  <div id="message-log">Waiting for messages...</div>
</div>

<style>
.cache-test-block {
  padding: 20px;
  border: 2px solid #9b59b6;
  border-radius: 8px;
  background: #f4f1f7;
  font-family: Arial, sans-serif;
  text-align: center;
}
#cache-status {
  font-size: 18px;
  font-weight: bold;
  color: #8e44ad;
  margin: 10px 0;
}
#message-log {
  font-size: 14px;
  color: #666;
  margin: 10px 0;
}
</style>`
      await fs.writeFile(path.join(testBlockPath, 'index.html'), blockHtml)

      // Test that the cache serves the block content
      const cacheUrl = `/cache/${encodeURIComponent(testBlockName)}/latest/index.html`
      await page.goto(cacheUrl)

      // Verify that the cache serves the block content
      const cacheDiv = page.locator('div').filter({ hasText: 'CACHE TEST BLOCK - INITIAL' }).first()
      await expect(cacheDiv).toBeVisible()
      await expect(cacheDiv).toContainText('CACHE TEST BLOCK - INITIAL')
      await expect(cacheDiv).toContainText('Waiting for messages...')

    } finally {
      // Clean up test block
      try {
        await fs.rm(testBlockPath, { recursive: true, force: true })
      } catch (error) {
        console.warn('Failed to clean up test block:', error)
      }
    }
  })
})