// VS Code Extension Test for Inset Management
// Tests the complete inset creation/update/deletion lifecycle using VS Code test framework

const assert = require('assert')
const vscode = require('vscode')
const path = require('path')
const fs = require('fs')

suite('Vivafolio Inset Management', function() {
  this.timeout(30000)

  let disposables = []
  let testWorkspace

  suiteSetup(async function() {
    // Get the workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder found')
    }
    testWorkspace = workspaceFolders[0]

    // Verify test files exist
    const testProjectDir = testWorkspace.uri.fsPath
    const mainFile = path.join(testProjectDir, 'main.viv')
    const twoBlocksFile = path.join(testProjectDir, 'two_blocks.viv')

    if (!fs.existsSync(mainFile)) {
      throw new Error(`Test file not found: ${mainFile}`)
    }
    if (!fs.existsSync(twoBlocksFile)) {
      throw new Error(`Test file not found: ${twoBlocksFile}`)
    }
  })

  setup(async function() {
    // Clean up any existing webviews before each test
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  teardown(async function() {
    // Clean up after each test
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')

    // Dispose of any test-specific resources
    disposables.forEach(d => d.dispose())
    disposables = []

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  test('should create inset for single vivafolio block', async function() {
    const testProjectDir = testWorkspace.uri.fsPath
    const mainFile = path.join(testProjectDir, 'main.viv')
    const mainUri = vscode.Uri.file(mainFile)

    // Open the test file
    const document = await vscode.workspace.openTextDocument(mainUri)
    const editor = await vscode.window.showTextDocument(document)

    // Wait for diagnostics to be processed
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Get current diagnostics for the document
    const diagnostics = vscode.languages.getDiagnostics(mainUri)
    const hintDiagnostics = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)

    // Should have at least one hint diagnostic
    assert(hintDiagnostics.length > 0, 'Should have hint diagnostics for vivafolio blocks')

    // Check that at least one diagnostic has vivafolio payload
    const vivafolioDiagnostics = hintDiagnostics.filter(d => {
      try {
        const message = d.message
        return message.includes('vivafolio:') || message.startsWith('{')
      } catch {
        return false
      }
    })

    assert(vivafolioDiagnostics.length > 0, 'Should have vivafolio diagnostics')
  })

  test('should handle multiple blocks with unique blockIds', async function() {
    const testProjectDir = testWorkspace.uri.fsPath
    const twoBlocksFile = path.join(testProjectDir, 'two_blocks.viv')
    const twoBlocksUri = vscode.Uri.file(twoBlocksFile)

    // Ensure the file has the expected two-blocks content
    const expectedContent = `// Two blocks interaction test
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#ff0000" } }"#
// Color square
vivafolio_square!()`

    // Write the expected content and save
    const document = await vscode.workspace.openTextDocument(twoBlocksUri)
    const editor = await vscode.window.showTextDocument(document)
    const setupEdit = new vscode.WorkspaceEdit()
    setupEdit.replace(twoBlocksUri, new vscode.Range(0, 0, document.lineCount, 0), expectedContent)
    await vscode.workspace.applyEdit(setupEdit)
    await document.save()

    // Wait for diagnostics to be processed
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Get diagnostics
    const diagnostics = vscode.languages.getDiagnostics(twoBlocksUri)
    const hintDiagnostics = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)

    // Should have 2 hint diagnostics for the two blocks
    assert.strictEqual(hintDiagnostics.length, 2, 'Should have 2 hint diagnostics for two blocks')

    // Extract blockIds from diagnostics
    const blockIds = []
    for (const diag of hintDiagnostics) {
      try {
        const message = diag.message
        if (message.includes('vivafolio:')) {
          const jsonStr = message.substring(message.indexOf('vivafolio:') + 'vivafolio:'.length)
          const payload = JSON.parse(jsonStr)
          if (payload.blockId) {
            blockIds.push(payload.blockId)
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // Should have 2 unique blockIds
    assert.strictEqual(blockIds.length, 2, 'Should have 2 blockIds')
    assert.strictEqual(new Set(blockIds).size, 2, 'BlockIds should be unique')
  })

  test('should update existing insets when diagnostics change', async function() {
    const testProjectDir = testWorkspace.uri.fsPath
    const twoBlocksFile = path.join(testProjectDir, 'two_blocks.viv')
    const twoBlocksUri = vscode.Uri.file(twoBlocksFile)

    // Ensure the file has the expected two-blocks content
    const initialContent = `// Two blocks interaction test
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#ff0000" } }"#
// Color square
vivafolio_square!()`

    // Write the initial content and save
    const document = await vscode.workspace.openTextDocument(twoBlocksUri)
    const editor = await vscode.window.showTextDocument(document)
    const initialEdit = new vscode.WorkspaceEdit()
    initialEdit.replace(twoBlocksUri, new vscode.Range(0, 0, document.lineCount, 0), initialContent)
    await vscode.workspace.applyEdit(initialEdit)
    await document.save()

    // Wait for initial diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Get initial diagnostics count
    const initialDiagnostics = vscode.languages.getDiagnostics(twoBlocksUri)
    const initialHints = initialDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)
    assert.strictEqual(initialHints.length, 2, 'Should start with 2 hint diagnostics')

    // Modify the document to change the color (same blockIds, different properties)
    const newContent = `// Updated: picker with different color
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#00ff00" } }"#
// Same square
vivafolio_square!()`

    const edit = new vscode.WorkspaceEdit()
    edit.replace(twoBlocksUri, new vscode.Range(0, 0, document.lineCount, 0), newContent)
    await vscode.workspace.applyEdit(edit)
    await document.save()

    // Wait for diagnostics to update
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Should still have 2 diagnostics (updated, not recreated)
    const updatedDiagnostics = vscode.languages.getDiagnostics(twoBlocksUri)
    const updatedHints = updatedDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)
    assert.strictEqual(updatedHints.length, 2, 'Should still have 2 hint diagnostics after update')

    // Verify the color was updated in the payload
    let foundUpdatedColor = false
    for (const diag of updatedHints) {
      try {
        const message = diag.message
        if (message.includes('vivafolio:')) {
          const jsonStr = message.substring(message.indexOf('vivafolio:') + 'vivafolio:'.length)
          const payload = JSON.parse(jsonStr)
          if (payload.entityGraph?.entities?.[0]?.properties?.color === '#00ff00') {
            foundUpdatedColor = true
            break
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    assert(foundUpdatedColor, 'Should find updated color in diagnostics payload')
  })

  test('should remove insets when blocks are deleted', async function() {
    const testProjectDir = testWorkspace.uri.fsPath
    const twoBlocksFile = path.join(testProjectDir, 'two_blocks.viv')
    const twoBlocksUri = vscode.Uri.file(twoBlocksFile)

    // Ensure the file has the expected two-blocks content
    const initialContent = `// Two blocks interaction test
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#ff0000" } }"#
// Color square
vivafolio_square!()`

    // Write the initial content and save
    const document = await vscode.workspace.openTextDocument(twoBlocksUri)
    const editor = await vscode.window.showTextDocument(document)
    const initialEdit = new vscode.WorkspaceEdit()
    initialEdit.replace(twoBlocksUri, new vscode.Range(0, 0, document.lineCount, 0), initialContent)
    await vscode.workspace.applyEdit(initialEdit)
    await document.save()

    // Wait for initial diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Should start with 2 diagnostics
    const initialDiagnostics = vscode.languages.getDiagnostics(twoBlocksUri)
    const initialHints = initialDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)
    assert.strictEqual(initialHints.length, 2, 'Should start with 2 hint diagnostics')

    // Remove one block
    const singleBlockContent = `// Only picker remains
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#0000ff" } }"#
// Square removed`

    const edit = new vscode.WorkspaceEdit()
    edit.replace(twoBlocksUri, new vscode.Range(0, 0, document.lineCount, 0), singleBlockContent)
    await vscode.workspace.applyEdit(edit)
    await document.save()

    // Wait for diagnostics to update
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Should now have only 1 diagnostic
    const updatedDiagnostics = vscode.languages.getDiagnostics(twoBlocksUri)
    const updatedHints = updatedDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)
    assert.strictEqual(updatedHints.length, 1, 'Should have 1 hint diagnostic after removing block')
  })

  test('should clear all insets when no blocks remain', async function() {
    const testProjectDir = testWorkspace.uri.fsPath
    const twoBlocksFile = path.join(testProjectDir, 'two_blocks.viv')
    const twoBlocksUri = vscode.Uri.file(twoBlocksFile)

    // First, reset the file to the expected two-blocks content
    const originalContent = `// Two blocks interaction test
vivafolio_picker!() gui_state! r#"{ "properties": { "color": "#ff0000" } }"#
// Color square
vivafolio_square!()`

    // Write the original content and save
    const document = await vscode.workspace.openTextDocument(twoBlocksUri)
    const editor = await vscode.window.showTextDocument(document)
    const resetEdit = new vscode.WorkspaceEdit()
    resetEdit.replace(twoBlocksUri, new vscode.Range(0, 0, document.lineCount, 0), originalContent)
    await vscode.workspace.applyEdit(resetEdit)
    await document.save()

    // Wait for diagnostics to be processed
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Should start with 2 diagnostics
    const initialDiagnostics = vscode.languages.getDiagnostics(twoBlocksUri)
    const initialHints = initialDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)
    assert.strictEqual(initialHints.length, 2, 'Should start with 2 hint diagnostics')

    // Remove all blocks
    const emptyContent = `// Empty file with no vivafolio blocks
fn main() {
    println!("No blocks here!");
}`

    const edit = new vscode.WorkspaceEdit()
    edit.replace(twoBlocksUri, new vscode.Range(0, 0, document.lineCount, 0), emptyContent)
    await vscode.workspace.applyEdit(edit)
    await document.save()

    // Wait for diagnostics to clear
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Should have no hint diagnostics
    const clearedDiagnostics = vscode.languages.getDiagnostics(twoBlocksUri)
    const clearedHints = clearedDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)
    assert.strictEqual(clearedHints.length, 0, 'Should have no hint diagnostics when no blocks present')
  })
})
