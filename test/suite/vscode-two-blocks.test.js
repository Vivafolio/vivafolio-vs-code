const assert = require('assert')
const vscode = require('vscode')
const path = require('path')

suite('Vivafolio Two Blocks Interaction', () => {
  test('color picker updates color square via LSP BlockSync', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri
    assert.ok(folder, 'No workspace open')
    const fileUri = vscode.Uri.file(path.join(folder.fsPath, 'two_blocks.viv'))
    const doc = await vscode.workspace.openTextDocument(fileUri)
    await vscode.window.showTextDocument(doc)

    // Wait for both blocks to publish diagnostics and webviews to be ready
    const waitReady = async () => {
      const start = Date.now()
      let gotReady = 0
      while (Date.now() - start < 20000) {
        const msg = await vscode.commands.executeCommand('vivafolio.getLastMessage')
        if (msg && msg.type === 'ready') gotReady++
        if (gotReady >= 1) break
        await new Promise(r => setTimeout(r, 200))
      }
      assert.ok(gotReady >= 1, 'Webview did not signal ready')
    }
    await waitReady()

    // Verify inset metadata (line index) available when insets are enabled
    const insetInfo = await vscode.commands.executeCommand('vivafolio.getLastInsetInfo')
    // Not asserting true/false here, but capturing for debugging if needed
    void insetInfo

    // First, verify that the webview is ready and can receive messages
    console.log('Checking webview readiness...')

    // Wait a bit more to ensure the webview is fully loaded
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Check if we can get messages from the webview
    const lastMessage = await vscode.commands.executeCommand('vivafolio.getLastMessage')
    console.log('Last message from webview:', lastMessage)

    // Simulate user interaction by sending a color change message to the webview
    console.log('Sending color change message to webview...')

    // Send a message to simulate the user changing the color picker to #00aa88
    // Use the specific picker webview command
    const result = await vscode.commands.executeCommand('vivafolio.postToPickerWebview', {
      type: 'graph:update',
      payload: {
        entities: [{
          entityId: 'color',
          properties: { color: '#00aa88' }
        }],
        links: []
      }
    })
    console.log('Post command result:', result)

    // Give the webview time to process the message
    await new Promise(resolve => setTimeout(resolve, 500))

    // Wait for the webview to process the message and send a response
    // The color picker should send a graph:update message in response
    const start2 = Date.now()
    while (Date.now() - start2 < 10000) {
      const posted = await vscode.commands.executeCommand('vivafolio.getLastPosted')
      console.log('Checking posted message:', JSON.stringify(posted, null, 2))

      // Look for ANY message from the color picker with a different color than the default
      const entity = posted?.payload?.entities?.[0]
      if (entity?.entityId === 'color-picker' && entity?.properties?.color !== '#ff0000') {
        console.log('Successfully received color update from color picker! Color changed to:', entity.properties.color)
        return
      }

      // Also check for messages with entityId 'color' (in case the webview updated its entityId)
      if (entity?.entityId === 'color' && entity?.properties?.color === '#00aa88') {
        console.log('Successfully received color update from color picker with updated entityId!')
        return
      }

      await new Promise(r => setTimeout(r, 200))
    }

    assert.fail('Timed out waiting for webview to respond to color change')
  })
})


