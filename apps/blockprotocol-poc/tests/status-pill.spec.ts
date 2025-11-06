import { test, expect } from '@playwright/test'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Server reads/writes CSV at apps/blockprotocol-poc/data/status-pill.csv
const CSV_PATH = path.resolve(__dirname, '..', 'data', 'status-pill.csv')

async function readCsv() {
  try {
    const content = await fs.readFile(CSV_PATH, 'utf8')
    return content.trim()
  } catch (err) {
    return ''
  }
}

async function writeCsv(value: string) {
  await fs.mkdir(path.dirname(CSV_PATH), { recursive: true })
  await fs.writeFile(CSV_PATH, `${value}\n`, 'utf8')
}

// Wait for status/persisted from the dev server after triggering an update
async function waitForPersisted(page: import('@playwright/test').Page, expectedLabel: string) {
  // Listen to network WS frames for our persisted message
  // Playwright doesn't expose direct WS messages from the page-level WebSocket easily,
  // so rely on polling the CSV as a fallback with a generous timeout.
  for (let i = 0; i < 80; i++) {
    const value = await readCsv()
    if (value === expectedLabel) return
    await page.waitForTimeout(250)
  }
}

test.describe('Status Pill – CSV integration', () => {
  test('reads initial status from CSV and reflects file changes on reload', async ({ page }) => {
    page.on('console', (msg) => {
      // Surface browser logs in test output to debug update flow
      console.log(`[browser:${msg.type()}]`, msg.text())
    })
    await writeCsv('In Progress')
    await page.goto('/?scenario=status-pill-example&useIndexingService=true')

  const container = page.locator('.published-block-container')
  await expect(container).toBeAttached({ timeout: 15000 })

  // The status pill renders inside a custom element (light DOM descendants)
  const host = container.locator('vivafolio-status-pill')
  await expect(host).toBeVisible({ timeout: 10000 })
  const pill = container.locator('vivafolio-status-pill .status-pill-block')
  await expect(pill).toBeVisible({ timeout: 10000 })
  await expect(pill).toContainText('In Progress')

    // Change the CSV and verify the block reflects it after a reload
    await writeCsv('Review')
  await page.reload()
  const hostReload = page.locator('.published-block-container').locator('vivafolio-status-pill')
  const pillReload = page.locator('.published-block-container').locator('vivafolio-status-pill .status-pill-block')
  await expect(pillReload).toBeVisible({ timeout: 10000 })
  await expect(pillReload).toContainText('Review')
  })

  test('selecting a new option writes correct text to CSV', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser:${msg.type()}]`, msg.text())
    })
    await writeCsv('To Do')
    await page.goto('/?scenario=status-pill-example&useIndexingService=true')

  const container = page.locator('.published-block-container')
  await expect(container).toBeAttached({ timeout: 15000 })

  const host = container.locator('vivafolio-status-pill')
  await expect(host).toBeVisible({ timeout: 10000 })
  const pill = container.locator('vivafolio-status-pill .status-pill-block')
  await expect(pill).toBeVisible({ timeout: 10000 })

    // Open and pick "Blocked"
  await pill.click()
  // Give the menu a moment to render before selecting
  await page.waitForTimeout(200)
  // Scope the role query within the custom element host to pierce shadow DOM
  const pick = container.locator('vivafolio-status-pill [role="menuitem"]').filter({ hasText: 'Blocked' })
  await expect(pick).toBeVisible()
  await pick.click()
  // Wait until the CSV persistence is observed and verified
  await waitForPersisted(page, 'Blocked')
  const persisted = await readCsv()
  expect(persisted).toBe('Blocked')

    // Reload the page to force a fresh read from CSV by the server's scenario init
  await page.reload()
    // Re-acquire references after reload to avoid stale handles
  const host2 = page.locator('.published-block-container').locator('vivafolio-status-pill')
  const pill2 = page.locator('.published-block-container').locator('vivafolio-status-pill .status-pill-block')
    await expect(pill2).toBeVisible({ timeout: 10000 })
    await expect(pill2).toContainText('Blocked')

    // Optional: confirm CSV content directly with a short poll
    let finalCsv = await readCsv()
    if (finalCsv !== 'Blocked') {
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(200)
        finalCsv = await readCsv()
        if (finalCsv === 'Blocked') break
      }
    }
    expect(finalCsv).toBe('Blocked')
  })

  test('changing status twice keeps a single pill and persists CSV', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser:${msg.type()}]`, msg.text())
    })

    // Start from a known CSV value
    await writeCsv('To Do')
    await page.goto('/?scenario=status-pill-example&useIndexingService=true')

  const container = page.locator('.published-block-container')
  await expect(container).toBeAttached({ timeout: 15000 })

  const host = container.locator('vivafolio-status-pill')
  await expect(host).toBeVisible({ timeout: 10000 })
  const pill = container.locator('vivafolio-status-pill .status-pill-block')
  await expect(pill).toBeVisible({ timeout: 10000 })
    await expect(pill).toContainText('To Do')
  await expect(container.locator('vivafolio-status-pill .status-pill-block')).toHaveCount(1)

    // First change: pick "Blocked"
  await pill.click()
  await page.waitForTimeout(200)
  const chooseBlocked = container.locator('vivafolio-status-pill [role="menuitem"]').filter({ hasText: 'Blocked' })
    await expect(chooseBlocked).toBeVisible()
    await chooseBlocked.click()
    await waitForPersisted(page, 'Blocked')
  await expect(container.locator('vivafolio-status-pill .status-pill-block')).toHaveCount(1)
    await expect(pill).toContainText('Blocked')

    // Second change: pick "Review"
  await pill.click()
  await page.waitForTimeout(200)
  const chooseReview = container.locator('vivafolio-status-pill [role="menuitem"]').filter({ hasText: 'Review' })
    await expect(chooseReview).toBeVisible()
    await chooseReview.click()
    await waitForPersisted(page, 'Review')
  await expect(container.locator('vivafolio-status-pill .status-pill-block')).toHaveCount(1)
    await expect(pill).toContainText('Review')

    // Final sanity: reload and ensure still single pill and latest text
  await page.reload()
  const hostAfter = page.locator('.published-block-container').locator('vivafolio-status-pill')
  const pillAfter = page.locator('.published-block-container').locator('vivafolio-status-pill .status-pill-block')
  await expect(pillAfter).toBeVisible({ timeout: 10000 })
    await expect(pillAfter).toContainText('Review')
  await expect(page.locator('.published-block-container').locator('vivafolio-status-pill .status-pill-block')).toHaveCount(1)
  })
})
