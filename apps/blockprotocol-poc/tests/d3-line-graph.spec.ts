import { test, expect } from '@playwright/test'

test.describe('D3 Line Graph – POC scenario', () => {
  test('renders published block and draws SVG paths from hydrated entity graph', async ({ page }) => {
    // Capture browser console output for debugging
    page.on('console', msg => {
      const type = msg.type()
      const text = msg.text()
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`)
    })
    
    // Navigate to the D3 line graph scenario
    await page.goto('/?scenario=d3-line-graph-example')

    // Wait for websocket connection indicator
    const status = page.locator('#status')
    await expect(status).toHaveText(/connected/i)

    // The published block container for this scenario
    const container = page.locator('.published-block-container[data-block-id="d3-line-graph-1"]')
    await expect(container).toBeAttached()

    // Ensure the block mounted and no loader error is shown
    await expect(container.locator('.block-error')).toHaveCount(0)

    // The block root renders with this class
    const blockRoot = container.locator('.d3-line-graph-block')
    await expect(blockRoot).toBeVisible()

    // Wait until an SVG with at least one line path is drawn
    await page.waitForFunction(() => {
      const root = document.querySelector('.d3-line-graph-block')
      return !!root?.querySelector('svg path')
    }, { timeout: 30000 })

    // Require at least one line path
    const pathCount = await blockRoot.locator('svg path').count()
    expect(pathCount).toBeGreaterThan(0)

    // Ensure no diagnostic fallback is shown
    await expect(blockRoot.locator(':text("No data found in entity graph")')).toHaveCount(0)

    // Verify the legend is rendered with series buttons
    const legendButtons = blockRoot.locator('.legend button')
    const legendCount = await legendButtons.count()
    expect(legendCount).toBeGreaterThan(0)

    // Optional: confirm host hydrated a non-empty graph (global bridge set by client)
  const entityCount = await page.evaluate(() => {
      const anyWin = window as any
      return anyWin.__vivafolioGraphContext?.graph?.entities?.length ?? 0
    })
    expect(entityCount).toBeGreaterThan(0)
  })
})
