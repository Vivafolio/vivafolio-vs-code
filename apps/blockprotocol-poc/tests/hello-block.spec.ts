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
})
