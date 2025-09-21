const assert = require('assert')
const vscode = require('vscode')
const path = require('path')

suite('Vivafolio Mock LSP diagnostics', () => {
  test('publishes vivafolio diagnostics for .viv file and triggers Vivafolio inset', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders
    assert.ok(workspaceFolders && workspaceFolders.length > 0, 'No workspace opened for tests')
    const folderUri = workspaceFolders[0].uri
    const fileUri = vscode.Uri.file(path.join(folderUri.fsPath, 'two_blocks.viv'))

    const doc = await vscode.workspace.openTextDocument(fileUri)
    await vscode.window.showTextDocument(doc)

    // Wait for diagnostics to arrive
    const got = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Timed out waiting for diagnostics')), 15000)
      const sub = vscode.languages.onDidChangeDiagnostics(() => {
        try {
          const diags = vscode.languages.getDiagnostics(fileUri)
          if (diags.some(d => d.severity === vscode.DiagnosticSeverity.Hint && String(d.message || '').startsWith('vivafolio:'))) {
            clearTimeout(to)
            sub.dispose()
            resolve(true)
          }
        } catch {}
      })
    })

    assert.strictEqual(got, true)

    // Verify the Vivafolio extension created and loaded a webview (inset or panel)
    // by waiting for its 'ready' message exposed via command 'vivafolio.getLastMessage'.
    const ready = await new Promise((resolve, reject) => {
      const start = Date.now()
      const tick = async () => {
        try {
          const msg = await vscode.commands.executeCommand('vivafolio.getLastMessage')
          if (msg && msg.type === 'ready') return resolve(true)
        } catch {}
        if (Date.now() - start > 15000) return reject(new Error('Timed out waiting for Vivafolio webview ready'))
        setTimeout(tick, 200)
      }
      tick()
    })
    assert.strictEqual(ready, true)

    // Verify host sent initial graph:update based on entityGraph
    const posted = await vscode.commands.executeCommand('vivafolio.getLastPosted')
    assert.ok(posted && posted.type === 'graph:update', 'Host did not post initial graph:update')
    assert.ok(posted.payload && Array.isArray(posted.payload.entities), 'graph:update payload missing entities')
  })
})


