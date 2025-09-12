// Vivafolio E2E Playwright Tests
// Tests the complete inset creation/update/deletion lifecycle

const { test, expect } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

// Test file paths
const testProjectDir = path.join(__dirname, 'projects', 'blocksync-test')
const mainFile = path.join(testProjectDir, 'main.viv')
const twoBlocksFile = path.join(testProjectDir, 'two_blocks.viv')

// Test content templates
const singleBlockContent = `// Single block test
vivafolio_block!("test-entity-123")

// Some other code
fn main() {
    println!("Hello from mock language!");
}
`

const twoBlocksContent = `// Two blocks interaction test
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#ff0000" } }"#
// Color square
vivafolio_square!()
`

const updatedTwoBlocksContent = `// Updated: picker with different color
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#00ff00" } }"#
// Same square
vivafolio_square!()
`

const singleBlockOnlyContent = `// Only picker remains
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#0000ff" } }"#
// Square removed
`

test.describe('Vivafolio Inset Management', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for VS Code to load and extensions to activate
    await page.waitForTimeout(5000)

    // Ensure we're in the correct workspace
    const workspacePath = path.resolve(__dirname, '..', '..')
    console.log('Test workspace:', workspacePath)
  })

  test('should create inset for single vivafolio block', async ({ page }) => {
    // Open test file with single block
    await page.keyboard.press('Control+Shift+P')
    await page.keyboard.type('File: Open File...')
    await page.keyboard.press('Enter')
    await page.keyboard.type(mainFile)
    await page.keyboard.press('Enter')

    // Wait for file to load and diagnostics to appear
    await page.waitForTimeout(3000)

    // Check that inset was created (look for webview elements)
    const insets = page.locator('.webview')
    await expect(insets).toHaveCount(1)

    // Verify the inset contains expected content
    const inset = insets.first()
    await expect(inset).toBeVisible()
  })

  test('should create and update multiple insets correctly', async ({ page }) => {
    // Open two blocks test file
    await page.keyboard.press('Control+Shift+P')
    await page.keyboard.type('File: Open File...')
    await page.keyboard.press('Enter')
    await page.keyboard.type(twoBlocksFile)
    await page.keyboard.press('Enter')

    // Wait for diagnostics and insets to load
    await page.waitForTimeout(3000)

    // Should have 2 insets initially
    const insets = page.locator('.webview')
    await expect(insets).toHaveCount(2)

    // Modify file content to change picker color (should update existing inset)
    await page.keyboard.press('Control+A') // Select all
    await page.keyboard.press('Delete') // Clear content
    await page.keyboard.type(updatedTwoBlocksContent)

    // Save file
    await page.keyboard.press('Control+S')

    // Wait for diagnostics update
    await page.waitForTimeout(2000)

    // Should still have exactly 2 insets (updated, not recreated)
    await expect(insets).toHaveCount(2)

    // Verify insets are still visible and functional
    for (const inset of await insets.all()) {
      await expect(inset).toBeVisible()
    }
  })

  test('should remove insets when blocks are deleted', async ({ page }) => {
    // Open two blocks test file
    await page.keyboard.press('Control+Shift+P')
    await page.keyboard.type('File: Open File...')
    await page.keyboard.press('Enter')
    await page.keyboard.type(twoBlocksFile)
    await page.keyboard.press('Enter')

    // Wait for diagnostics and insets to load
    await page.waitForTimeout(3000)

    // Should have 2 insets initially
    const insets = page.locator('.webview')
    await expect(insets).toHaveCount(2)

    // Modify file to remove one block
    await page.keyboard.press('Control+A') // Select all
    await page.keyboard.press('Delete') // Clear content
    await page.keyboard.type(singleBlockOnlyContent)

    // Save file
    await page.keyboard.press('Control+S')

    // Wait for diagnostics update and inset removal
    await page.waitForTimeout(2000)

    // Should now have only 1 inset (square removed)
    await expect(insets).toHaveCount(1)

    // Verify remaining inset is still functional
    const remainingInset = insets.first()
    await expect(remainingInset).toBeVisible()
  })

  test('should handle complete state semantics correctly', async ({ page }) => {
    // Open two blocks test file
    await page.keyboard.press('Control+Shift+P')
    await page.keyboard.type('File: Open File...')
    await page.keyboard.press('Enter')
    await page.keyboard.type(twoBlocksFile)
    await page.keyboard.press('Enter')

    // Wait for initial state
    await page.waitForTimeout(3000)
    let insets = page.locator('.webview')
    await expect(insets).toHaveCount(2)

    // Test 1: Update existing blocks (should maintain 2 insets)
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.type(updatedTwoBlocksContent)
    await page.keyboard.press('Control+S')
    await page.waitForTimeout(2000)
    await expect(insets).toHaveCount(2)

    // Test 2: Remove one block (should reduce to 1 inset)
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.type(singleBlockOnlyContent)
    await page.keyboard.press('Control+S')
    await page.waitForTimeout(2000)
    await expect(insets).toHaveCount(1)

    // Test 3: Add block back (should increase to 2 insets)
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.type(twoBlocksContent)
    await page.keyboard.press('Control+S')
    await page.waitForTimeout(2000)
    insets = page.locator('.webview')
    await expect(insets).toHaveCount(2)

    // Test 4: Clear all blocks (should remove all insets)
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.type('// Empty file with no vivafolio blocks\n')
    await page.keyboard.press('Control+S')
    await page.waitForTimeout(2000)
    await expect(insets).toHaveCount(0)
  })

  test('should reuse insets for same blockId across file changes', async ({ page }) => {
    // Open two blocks test file
    await page.keyboard.press('Control+Shift+P')
    await page.keyboard.type('File: Open File...')
    await page.keyboard.press('Enter')
    await page.keyboard.type(twoBlocksFile)
    await page.keyboard.press('Enter')

    // Wait for insets to load
    await page.waitForTimeout(3000)
    const insets = page.locator('.webview')
    await expect(insets).toHaveCount(2)

    // Get initial inset positions/IDs (if available)
    const initialInsetCount = await insets.count()

    // Modify file but keep same blockIds
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.type(updatedTwoBlocksContent) // Same blockIds, different color
    await page.keyboard.press('Control+S')

    // Wait for update
    await page.waitForTimeout(2000)

    // Should still have same number of insets (reused, not recreated)
    await expect(insets).toHaveCount(initialInsetCount)

    // Verify insets are still functional after update
    for (const inset of await insets.all()) {
      await expect(inset).toBeVisible()
    }
  })
})
