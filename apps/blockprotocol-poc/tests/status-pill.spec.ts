import { test, expect } from '@playwright/test'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TASKS_CSV_PATH = path.resolve(__dirname, '..', 'data', 'tasks.csv')

const STATUS_HEADER = 'Status'

type TasksTable = {
  headers: string[]
  rows: string[][]
}

let originalTasksCsv: string | undefined

function hasMeaningfulContent(row: string[] | undefined): row is string[] {
  if (!row) {
    return false
  }
  return row.some((cell) => typeof cell === 'string' && cell.trim().length > 0)
}

async function readTasksTable(): Promise<TasksTable> {
  const content = await fs.readFile(TASKS_CSV_PATH, 'utf8')
  const records = parse(content, { skip_empty_lines: false }) as string[][]
  if (!records.length) {
    throw new Error('tasks.csv is missing a header row')
  }
  const [headers, ...rest] = records
  const rows = rest.filter(hasMeaningfulContent).map((row) => row.map((cell) => cell ?? ''))
  return { headers: headers.map((cell) => cell ?? ''), rows }
}

function normalizeRowLength(row: string[], desiredLength: number): string[] {
  if (row.length >= desiredLength) {
    return row.slice(0, desiredLength)
  }
  return [...row, ...Array(desiredLength - row.length).fill('')]
}

async function writeTasksTable(table: TasksTable): Promise<void> {
  const normalizedRows = table.rows.map((row) => normalizeRowLength(row, table.headers.length))
  const payload = [table.headers, ...normalizedRows]
  const output = stringify(payload, { header: false })
  await fs.writeFile(TASKS_CSV_PATH, output, 'utf8')
}

function findColumnIndex(headers: string[], target: string): number {
  const normalizedTarget = target.trim().toLowerCase()
  return headers.findIndex((header) => header.trim().toLowerCase() === normalizedTarget)
}

async function getFirstTaskStatus(): Promise<string> {
  const table = await readTasksTable()
  const statusIndex = findColumnIndex(table.headers, STATUS_HEADER)
  if (statusIndex === -1) {
    throw new Error('tasks.csv is missing the Status column')
  }
  if (!table.rows.length) {
    throw new Error('tasks.csv has no task rows to read from')
  }
  return table.rows[0][statusIndex] ?? ''
}

async function setFirstTaskStatus(value: string): Promise<void> {
  const table = await readTasksTable()
  const statusIndex = findColumnIndex(table.headers, STATUS_HEADER)
  if (statusIndex === -1) {
    throw new Error('tasks.csv is missing the Status column')
  }
  if (!table.rows.length) {
    throw new Error('tasks.csv has no task rows to update')
  }
  table.rows[0][statusIndex] = value
  await writeTasksTable(table)
}

async function waitForPersistedStatus(
  page: import('@playwright/test').Page,
  expected: string,
  timeoutMs = 15_000
) {
  const normalizedExpected = expected.trim().toLowerCase()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = (await getFirstTaskStatus()).trim().toLowerCase()
    if (current === normalizedExpected) {
      return
    }
    await page.waitForTimeout(250)
  }
  throw new Error(`Timed out waiting for ${expected} to persist to tasks.csv`)
}

test.beforeAll(async () => {
  originalTasksCsv = await fs.readFile(TASKS_CSV_PATH, 'utf8')
})

test.afterEach(async () => {
  if (originalTasksCsv !== undefined) {
    await fs.writeFile(TASKS_CSV_PATH, originalTasksCsv, 'utf8')
  }
})

// Ensures the status pill scenario reads and writes task status via tasks.csv through the indexing service
test.describe('Status Pill – tasks.csv integration', () => {
  test('reads initial status from CSV and reflects file changes on reload', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser:${msg.type()}]`, msg.text())
    })

    await setFirstTaskStatus('In Progress')
    await page.goto('/?scenario=status-pill-example&useIndexingService=true')

    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached({ timeout: 15000 })

    const host = container.locator('vivafolio-status-pill')
    await expect(host).toBeVisible({ timeout: 10000 })
    const pill = container.locator('vivafolio-status-pill .status-pill-block')
    await expect(pill).toBeVisible({ timeout: 10000 })
    await expect(pill).toContainText('In Progress')

    await setFirstTaskStatus('Review')
    await page.reload()

    const hostReload = page.locator('.published-block-container').locator('vivafolio-status-pill')
    const pillReload = hostReload.locator('.status-pill-block')
    await expect(pillReload).toBeVisible({ timeout: 10000 })
    await expect(pillReload).toContainText('Review')
  })

  test('selecting a new option writes correct text to CSV', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser:${msg.type()}]`, msg.text())
    })

    await setFirstTaskStatus('To Do')
    await page.goto('/?scenario=status-pill-example&useIndexingService=true')

    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached({ timeout: 15000 })

    const host = container.locator('vivafolio-status-pill')
    await expect(host).toBeVisible({ timeout: 10000 })
    const pill = host.locator('.status-pill-block')
    await expect(pill).toBeVisible({ timeout: 10000 })

    await pill.click()
    await page.waitForTimeout(200)
    const pickBlocked = host.locator('[role="menuitem"]').filter({ hasText: 'Blocked' })
    await expect(pickBlocked).toBeVisible()
    await pickBlocked.click()

    await waitForPersistedStatus(page, 'Blocked')
    const persisted = await getFirstTaskStatus()
    expect(persisted).toBe('Blocked')

    await page.reload()
    const pillAfterReload = page.locator('.published-block-container').locator('vivafolio-status-pill .status-pill-block')
    await expect(pillAfterReload).toBeVisible({ timeout: 10000 })
    await expect(pillAfterReload).toContainText('Blocked')
  })

  test('changing status twice keeps a single pill and persists CSV', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser:${msg.type()}]`, msg.text())
    })

    await setFirstTaskStatus('To Do')
    await page.goto('/?scenario=status-pill-example&useIndexingService=true')

    const container = page.locator('.published-block-container')
    await expect(container).toBeAttached({ timeout: 15000 })

    const host = container.locator('vivafolio-status-pill')
    await expect(host).toBeVisible({ timeout: 10000 })
    const pill = host.locator('.status-pill-block')
    await expect(pill).toBeVisible({ timeout: 10000 })
    await expect(pill).toContainText('To Do')
    await expect(host.locator('.status-pill-block')).toHaveCount(1)

    await pill.click()
    await page.waitForTimeout(200)
    const chooseBlocked = host.locator('[role="menuitem"]').filter({ hasText: 'Blocked' })
    await expect(chooseBlocked).toBeVisible()
    await chooseBlocked.click()
    await waitForPersistedStatus(page, 'Blocked')
    await expect(host.locator('.status-pill-block')).toHaveCount(1)
    await expect(pill).toContainText('Blocked')

    await pill.click()
    await page.waitForTimeout(200)
    const chooseReview = host.locator('[role="menuitem"]').filter({ hasText: 'Review' })
    await expect(chooseReview).toBeVisible()
    await chooseReview.click()
    await waitForPersistedStatus(page, 'Review')
    await expect(host.locator('.status-pill-block')).toHaveCount(1)
    await expect(pill).toContainText('Review')

    await page.reload()
    const pillAfter = page.locator('.published-block-container').locator('vivafolio-status-pill .status-pill-block')
    await expect(pillAfter).toBeVisible({ timeout: 10000 })
    await expect(pillAfter).toContainText('Review')
    await expect(page.locator('.published-block-container').locator('vivafolio-status-pill .status-pill-block')).toHaveCount(1)
  })
})
