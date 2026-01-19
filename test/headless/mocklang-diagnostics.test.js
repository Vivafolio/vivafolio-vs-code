#!/usr/bin/env node

/**
 * Headless diagnostic integration test for the mocklang LSP.
 * Ensures the server emits Vivafolio payloads and that the extension-style
 * normalization logic can convert them into usable block notifications.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const {
  startMocklangServer,
  openTextDocument,
  waitForDiagnostics,
  parseVivafolioPayloadFromDiagnostic,
  createBlockNotification,
  defaultFallbackResourceMap
} = require('./utils')

async function run() {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const testFile = path.join(repoRoot, 'test', 'projects', 'vivafolioblock-test', 'two_blocks.mocklang')
  const fileUri = pathToFileURL(testFile).toString()
  const fileText = fs.readFileSync(testFile, 'utf8')
  const fallbackResources = defaultFallbackResourceMap(repoRoot)

  const { proc, connection } = startMocklangServer(repoRoot)
  try {
    await connection.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
    await connection.sendNotification('initialized', {})
    await openTextDocument(connection, { uri: fileUri, languageId: 'mocklang', text: fileText })

    const diagnostics = await waitForDiagnostics(connection, fileUri, (diags) => (diags.length >= 2 ? diags : null), 10000)
    assert.strictEqual(diagnostics.length, 2, 'mocklang should emit two diagnostics for picker/square')

    const notifications = diagnostics.map((diag) => {
      const payload = parseVivafolioPayloadFromDiagnostic(diag)
      assert(payload, 'diagnostic missing vivafolio payload')
      const notification = createBlockNotification(payload, { diagnostic: diag, documentUri: fileUri, fallbackResources })
      assert(notification.blockId, 'notification missing blockId')
      assert(notification.blockType, 'notification missing blockType')
      assert(Array.isArray(notification.entityGraph.entities), 'entityGraph entities missing')
      assert(notification.resources && notification.resources.length > 0, 'resources should be populated (fallbacks allowed)')
      return notification
    })

    const picker = notifications.find((n) => String(n.blockType).toLowerCase().includes('picker'))
    const square = notifications.find((n) => String(n.blockType).toLowerCase().includes('square'))
    assert(picker, 'picker block notification missing')
    assert(square, 'square block notification missing')

    const pickerColor = picker.entityGraph.entities?.[0]?.properties?.color ?? picker.entityGraph.entities?.[0]?.properties?.value?.color
    assert.strictEqual(pickerColor, '#cd2a18', 'picker color should match source gui_state')
    assert.strictEqual(picker.sourceUri, fileUri, 'picker notification should include file URI')
    assert.strictEqual(square.sourceUri, fileUri, 'square notification should include file URI')

    console.log('✅ Mocklang headless diagnostic test passed')
  } finally {
    try { connection.dispose() } catch {}
    try { proc.kill() } catch {}
  }
}

run().catch((error) => {
  console.error('❌ Mocklang headless diagnostic test failed:', error && error.stack ? error.stack : String(error))
  process.exitCode = 1
})
