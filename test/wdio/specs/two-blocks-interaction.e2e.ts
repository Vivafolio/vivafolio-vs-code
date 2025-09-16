/// <reference types="@wdio/mocha-framework" />
import { browser, expect } from '@wdio/globals'
import type { Workbench, EditorView, WebView } from 'wdio-vscode-service'
import { ColorPickerPage, ColorSquarePage } from '../pageobjects'
import path from 'path'
import * as fs from 'fs'

describe('Vivafolio Two Blocks Interaction E2E', () => {
  let workbench: Workbench
  let editorView: EditorView
  let colorPickerPage: ColorPickerPage
  let colorSquarePage: ColorSquarePage
  let testFile: string

  before(async () => {
    // Get the VS Code workbench instance
    workbench = await browser.getWorkbench()
    editorView = await workbench.getEditorView()
  })

  beforeEach(async () => {
    // Prepare an isolated temporary copy of the two-blocks test file to avoid mutating the original
    const srcFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', 'two_blocks.viv')
    const tmpDir = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', '.tmp')
    try { fs.mkdirSync(tmpDir, { recursive: true }) } catch {}
    const tmpName = `two_blocks.${Date.now()}-${Math.random().toString(36).slice(2)}.viv`
    testFile = path.join(tmpDir, tmpName)
    try { fs.copyFileSync(srcFile, testFile) } catch {}

    // Ensure the file has the expected content
    const expectedContent = `// Vivafolio two blocks interaction demo
// This file demonstrates interaction between a color picker and color square

vivafolio_picker!() gui_state! r#"{"color":"#ff0000"}"#
// Color square that will reflect the picker's color
vivafolio_square!()

// Regular code below
fn main() {
    println!("Vivafolio blocks above will show interactive editors!");
}`

    await browser.executeWorkbench((vscode, tf, content) => {
      return (async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        await vscode.window.showTextDocument(doc)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        await doc.save()
        await vscode.commands.executeCommand('vivafolio.processCurrentDiagnostics')
      })()
    }, testFile, expectedContent)

    // Wait for diagnostics and insets to be created using extension-side query
    await browser.waitUntil(async () => {
      const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
      return Array.isArray(insets) && insets.length >= 2
    }, { timeout: 15000, timeoutMsg: 'Expected two insets for two_blocks.viv' })

    // Get the webviews and identify the picker and square by their inner content
    let pickerWebview: any | undefined
    let squareWebview: any | undefined
    for (let attempt = 0; attempt < 8 && (!pickerWebview || !squareWebview); attempt++) {
      const webviews = await workbench.getAllWebviews() as any[]
      for (const wv of webviews) {
        try {
          await (wv as any).open()
          // Give the webview a moment to load its DOM
          const sawPicker = await browser.waitUntil(async () => await $('#picker').isExisting().catch(() => false), { timeout: 1500, interval: 150, timeoutMsg: 'no #picker' }).catch(() => false)
          const sawSquare = await browser.waitUntil(async () => await $('#sq').isExisting().catch(() => false), { timeout: 1500, interval: 150, timeoutMsg: 'no #sq' }).catch(() => false)
          await (wv as any).close()
          if (sawPicker && !pickerWebview) pickerWebview = wv
          if (sawSquare && !squareWebview) squareWebview = wv
        } catch {
          try { await (wv as any).close() } catch {}
        }
      }
      if (!pickerWebview || !squareWebview) await browser.pause(1000)
    }
    expect(pickerWebview).toBeDefined()
    expect(squareWebview).toBeDefined()
    colorPickerPage = new ColorPickerPage(pickerWebview as any)
    colorSquarePage = new ColorSquarePage(squareWebview as any)

    // Wait for both webviews to be ready
    await colorPickerPage.waitForReady()
    await colorSquarePage.waitForReady()
  })

  it('should create both insets and establish initial state', async () => {
    // Verify both pages are accessible by checking readiness
    await colorPickerPage.waitForReady()
    await colorSquarePage.waitForReady()

    // Wait until the picker reflects the initial gui_state color
    await browser.waitUntil(async () => {
      try {
        const v = await colorPickerPage.getCurrentColor()
        return v?.toLowerCase() === '#ff0000'
      } catch { return false }
    }, { timeout: 15000, timeoutMsg: 'Picker did not initialize to #ff0000 in time' })

    const initialPickerColor = await colorPickerPage.getCurrentColor()
    expect(initialPickerColor).toBe('#ff0000') // From the gui_state! in the file

    // The square should initially show the same color as the picker
    const initialSquareColor = await colorSquarePage.getCurrentColor()
    expect(initialSquareColor).toBe('#ff0000')
  })

  it('should update square color when picker color changes', async () => {
    // Change the color in the picker
    const newColor = '#00ff00' // Green
    await colorPickerPage.selectColorAndVerify(newColor)

    // Wait for the LSP to process the update and send new diagnostics
    await browser.pause(2000)

    // Verify the square updated to reflect the new color
    await colorSquarePage.waitForColor(newColor, 5000)
    const squareColor = await colorSquarePage.getCurrentColor()
    expect(squareColor).toBe(newColor)
  })

  it('should handle multiple color changes correctly', async () => {
    const colorSequence = ['#0000ff', '#ffff00', '#ff00ff', '#00ffff']

    for (const color of colorSequence) {
      // Change color in picker
      await colorPickerPage.selectColorAndVerify(color)

      // Wait for LSP processing
      await browser.pause(2000)

      // Verify square updates
      await colorSquarePage.waitForColor(color, 5000)
      const squareColor = await colorSquarePage.getCurrentColor()
      expect(squareColor).toBe(color)
    }
  })

  it('should maintain state consistency across file modifications', async () => {
    // Change color via picker
    const testColor = '#ffa500' // Orange
    await colorPickerPage.selectColorAndVerify(testColor)
    await browser.pause(2000)

    // Verify square updated
    await colorSquarePage.waitForColor(testColor, 5000)

    // Modify the file content (this should trigger LSP diagnostics update)
    // use isolated testFile
    const document = await browser.executeWorkbench((vscode, tf) => vscode.workspace.openTextDocument(vscode.Uri.file(tf)), testFile)

    const updatedContent = `// Updated: different initial color but picker should override
vivafolio_picker!() gui_state! r#"{"color":"#000000"}"#
// Color square
vivafolio_square!()

fn main() {
    println!("Updated content!");
}`

    await browser.executeWorkbench((vscode, tf, content) => {
      return (async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        const edit = new vscode.WorkspaceEdit()
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        await doc.save()
      })()
    }, testFile, updatedContent)

    // Wait for LSP to process the file change
    await browser.pause(3000)

    // The picker should now show the file's color, but since we changed it via UI,
    // it should still maintain the test color we set
    const pickerColor = await colorPickerPage.getCurrentColor()
    expect(pickerColor).toBe(testColor)

    // Square should still reflect the picker's color
    const squareColor = await colorSquarePage.getCurrentColor()
    expect(squareColor).toBe(testColor)
  })

  it('should handle block removal and recreation', async () => {
    // Initially should have 2 blocks
    let webviews = await workbench.getAllWebviews()
    expect(webviews).toHaveLength(2)

    // Remove the square block
    // use isolated testFile
    const document = await browser.executeWorkbench((vscode, tf) => vscode.workspace.openTextDocument(vscode.Uri.file(tf)), testFile)

    const singleBlockContent = `// Only picker remains
vivafolio_picker!() gui_state! r#"{"color":"#ff0000"}"#
// Square removed

fn main() {
    println!("Only picker now!");
}`

    await browser.executeWorkbench((vscode, tf, content) => {
      return (async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        const edit = new vscode.WorkspaceEdit()
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        await doc.save()
      })()
    }, testFile, singleBlockContent)

    // Wait for square to be removed by querying the extension state instead of raw webviews list
    await browser.waitUntil(async () => {
      const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
      return Array.isArray(insets) && insets.length === 1
    }, { timeout: 10000, timeoutMsg: 'Expected one inset after removing square' })

    // Recreate the square block
    const twoBlocksContent = `// Both blocks back
vivafolio_picker!() gui_state! r#"{"color":"#ff0000"}"#
// Color square
vivafolio_square!()

fn main() {
    println!("Both blocks back!");
}`

    await browser.executeWorkbench((vscode, tf, content) => {
      return (async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        const edit = new vscode.WorkspaceEdit()
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        await doc.save()
      })()
    }, testFile, twoBlocksContent)

    // Wait for square to be recreated via extension-side state
    await browser.waitUntil(async () => {
      const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
      return Array.isArray(insets) && insets.length === 2
    }, { timeout: 15000, timeoutMsg: 'Expected two insets after recreating square' })

    // Re-fetch webviews and identify by content again
    webviews = await workbench.getAllWebviews()

    // Recreate page objects for the new webviews
    colorPickerPage = new ColorPickerPage(webviews[0])
    colorSquarePage = new ColorSquarePage(webviews[1])

    // Verify interaction still works
    await colorPickerPage.waitForReady()
    await colorSquarePage.waitForReady()

    const testColor = '#800080' // Purple
    await colorPickerPage.selectColorAndVerify(testColor)
    await browser.pause(2000)
    await colorSquarePage.waitForColor(testColor, 5000)
  })

  afterEach(async () => {
    // Clean up by closing all editors after each test
    await workbench.executeCommand('workbench.action.closeAllEditors')
    await browser.pause(500)
    // Remove the temporary file to avoid accumulation
    try { if (testFile && fs.existsSync(testFile)) fs.unlinkSync(testFile) } catch {}
  })
})
