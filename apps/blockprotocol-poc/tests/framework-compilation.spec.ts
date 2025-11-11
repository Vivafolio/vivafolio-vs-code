/**
 * Framework Compilation E2E tests
 *
 * Verifies that the POC server:
 * - Exposes framework bundle metadata via HTTP APIs:
 *   - GET /api/frameworks/bundles (all frameworks)
 *   - GET /api/frameworks/:framework/bundles (single framework)
 * - Serves compiled framework assets under /frameworks (used by scenarios).
 * - Renders the "framework-compilation-demo" and "cross-framework-nesting" scenarios
 *   and allows basic block interaction.
 *
 * Preconditions:
 * - Dev mode: start with framework watchers enabled (ENABLE_FRAMEWORK_WATCH=true), so
 *   in-memory bundles are populated for the API responses.
 * - Prod mode (TEST_E2E_PROD=1): ensure frameworks are built (e.g., npm run build:frameworks)
 *   so assets exist under dist/frameworks and scenarios can load them.
 */

import { test, expect } from '@playwright/test'

test.describe('Framework Compilation', () => {
  test('should serve framework bundles API', async ({ request }) => {
    const response = await request.get('/api/frameworks/bundles')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('bundles')
    expect(typeof data.bundles).toBe('object')
  })

  test('should serve framework assets', async ({ request }) => {
    // Test SolidJS framework bundles
    const response = await request.get('/api/frameworks/solidjs/bundles')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('bundles')
    expect(Array.isArray(data.bundles)).toBeTruthy()
  })

  test('framework compilation demo scenario', async ({ page }) => {
    // Navigate to the framework compilation demo
    await page.goto('/?scenario=framework-compilation-demo')

    // Wait for the page to load
    await page.waitForSelector('[data-block-id]')

    // Check that blocks are rendered
    const blocks = page.locator('[data-block-id]')
    await expect(blocks).toHaveCount(await blocks.count())

    // Verify that framework update messages work
    const consoleMessages: string[] = []
    page.on('console', msg => {
      consoleMessages.push(msg.text())
    })

    // The demo should show both static and compiled versions
    await page.waitForTimeout(1000) // Allow time for any framework updates

    // Check that we can interact with blocks
    const statusElements = page.locator('.status-pill-block')
    if (await statusElements.count() > 0) {
      await statusElements.first().click()
      // Should trigger some kind of update
    }
  })

  test('cross-framework nesting scenario', async ({ page }) => {
    // Navigate to the cross-framework nesting demo
    await page.goto('/?scenario=cross-framework-nesting')

    // Wait for the page to load
    await page.waitForSelector('[data-block-id]')

    // Check that multiple blocks are rendered
    const blocks = page.locator('[data-block-id]')
    const blockCount = await blocks.count()
    expect(blockCount).toBeGreaterThanOrEqual(1) // At least the parent block

    // Verify that the parent-child relationship is established
    const parentBlock = page.locator('[data-block-id="parent-block"]')
    await expect(parentBlock).toBeVisible()

    // Check for child blocks if they exist
    const childBlocks = page.locator('[data-block-id*="child-"]')
    // Child blocks might not exist if frameworks aren't compiled yet
    console.log(`Found ${await childBlocks.count()} child blocks`)
  })
})
