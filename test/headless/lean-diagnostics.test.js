#!/usr/bin/env node

/**
 * Headless diagnostic integration test for the Lean DSL fixtures.
 * Proves that Lean's lake server emits Vivafolio payloads that can be
 * normalized into block notifications without VS Code.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const {
  startLeanLakeServe,
  openTextDocument,
  waitForDiagnostics,
  parseVivafolioPayloadFromDiagnostic,
  createBlockNotification,
  defaultFallbackResourceMap
} = require('./utils')

async function run() {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const fallbackResources = defaultFallbackResourceMap(repoRoot)
  const { proc, connection, cwd } = startLeanLakeServe(repoRoot, path.join('test', 'projects', 'lean-dsl'))

  try {
    await connection.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await connection.sendNotification('initialized', {})

    const pickerPath = path.join(cwd, 'LeanDsl', 'PickerDemo.lean')
    const pickerUri = pathToFileURL(pickerPath).toString()
    const pickerText = fs.readFileSync(pickerPath, 'utf8')

    await openTextDocument(connection, { uri: pickerUri, languageId: 'lean4', text: pickerText })
    const diagnostics = await waitForDiagnostics(connection, pickerUri, (diags) => (diags.length >= 2 ? diags : null), 120000)
    assert(diagnostics.length >= 2, 'expected at least two diagnostics from Lean DSL sample')

    const notifications = diagnostics
      .map((diag) => {
        const payload = parseVivafolioPayloadFromDiagnostic(diag)
        return payload ? createBlockNotification(payload, { diagnostic: diag, documentUri: pickerUri, fallbackResources }) : null
      })
      .filter(Boolean)

    assert(notifications.length >= 2, 'expected Vivafolio notifications derived from Lean diagnostics')

    const pickerNotification = notifications.find((n) => String(n.blockType || '').toLowerCase().includes('picker'))
    const squareNotification = notifications.find((n) => String(n.blockType || '').toLowerCase().includes('square'))

    assert(pickerNotification, 'picker notification missing from Lean diagnostics')
    assert(squareNotification, 'square notification missing from Lean diagnostics')

    assert.strictEqual(pickerNotification.sourceUri, pickerUri, 'picker notification sourceUri mismatch')
    assert.strictEqual(squareNotification.sourceUri, pickerUri, 'square notification sourceUri mismatch')

    const pickerColor = pickerNotification.entityGraph.entities?.[0]?.properties?.color
    assert.strictEqual(pickerColor, '#19dee1', 'picker color should reflect Lean gui_state')

    const squareColor = squareNotification.entityGraph.entities?.[0]?.properties?.color
    assert.strictEqual(squareColor, '#19dee1', 'square color should match Lean picker color')

    for (const notification of [pickerNotification, squareNotification]) {
      assert(notification.resources?.length > 0, 'Lean notifications should expose resources (fallback or explicit)')
      const hasRange = notification.range && typeof notification.range.start?.line === 'number'
      assert(hasRange, 'Lean notifications must preserve diagnostic ranges')
    }

    console.log('✅ Lean headless diagnostic test passed')
  } finally {
    try { connection.dispose() } catch {}
    try { proc.kill() } catch {}
  }
}

run().catch((error) => {
  console.error('❌ Lean headless diagnostic test failed:', error && error.stack ? error.stack : String(error))
  process.exitCode = 1
})
