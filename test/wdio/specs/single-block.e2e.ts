/// <reference types="@wdio/mocha-framework" />
import { browser, expect } from '@wdio/globals'
import type { Workbench, EditorView, WebView } from 'wdio-vscode-service'
import path from 'path'

describe('Vivafolio Single Block E2E', () => {
  let workbench: Workbench
  let editorView: EditorView

  before(async () => {
    // Get the VS Code workbench instance
    workbench = await browser.getWorkbench()
    editorView = await workbench.getEditorView()
  })

  beforeEach(async () => {
    // Close all editors before each test
    await workbench.executeCommand('workbench.action.closeAllEditors')
    await browser.pause(500)
    // Reset the test file to a known initial state for deterministic coordinates
    const testFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', 'main.viv')
    const initialContent = `// Vivafolio E2E Test File
// This file demonstrates VivafolioBlock notifications via LSP diagnostics

// This should trigger a VivafolioBlock diagnostic
vivafolio_block!("test-entity-123")

// Some other code
fn main() {
    println!("Hello from mock language!");
}

// Another block for testing multiple blocks
vivafolio_block!("test-entity-456")
`
    await browser.executeWorkbench((vscode, tf, content) => {
      return (async () => {
        const uri = vscode.Uri.file(tf)
        const doc = await vscode.workspace.openTextDocument(uri).catch(() => undefined)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(uri, new vscode.Range(0, 0, (doc?.lineCount ?? 0) || 0, 0), content)
        await vscode.workspace.applyEdit(edit)
        await (await vscode.workspace.openTextDocument(uri)).save()
        await vscode.window.showTextDocument(uri)
      })()
    }, testFile, initialContent)
    await browser.pause(1000)
  })

  it('should create inset for single vivafolio block', async () => {
    const testFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', 'main.viv')

    // Open the test file using VS Code command palette
    await browser.executeWorkbench((vscode, tf) => {
      return (async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        await vscode.window.showTextDocument(doc)
      })()
    }, testFile)

    // Wait for file to load and diagnostics to be processed
    await browser.pause(3000)

    // Assert via extension API that an inset exists at the expected line in this file
    const hasAtFirstBlock = await browser.executeWorkbench((vscode, tf) => {
      return vscode.commands.executeCommand('vivafolio.hasInsetAt', vscode.Uri.file(tf), 4)
    }, testFile)
    expect(hasAtFirstBlock).toBe(true)
    // Optionally enumerate all insets for this document
    const allInsets = await browser.executeWorkbench((vscode, tf) => {
      return vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf))
    }, testFile)
    expect(Array.isArray(allInsets)).toBe(true)

    // Optionally, attempt to open the first webview if available for extra validation
    const maybeWebviews = await workbench.getAllWebviews()
    if (maybeWebviews.length > 0) {
      const webview = maybeWebviews[0]
      await (webview as any).open()
      try {
        const body = await $('body')
        await body.waitForDisplayed({ timeout: 5000 })
        const title = await browser.getTitle()
        expect(title.length).toBeGreaterThan(0)
      } finally {
        await (webview as any).close()
      }
    }
  })

  it('should handle block updates correctly', async () => {
    // First, ensure we have the initial file open
    const testFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', 'main.viv')

    // Open the test file using VS Code command palette
    await browser.executeWorkbench((vscode, tf) => {
      return (async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        await vscode.window.showTextDocument(doc)
      })()
    }, testFile)
    await browser.pause(3000)

    const stillHasInset = await browser.executeWorkbench((vscode, tf) => {
      return vscode.commands.executeCommand('vivafolio.hasInsetAt', vscode.Uri.file(tf), 4)
    }, testFile)
    expect(stillHasInset).toBe(true)

    // Replace entire document content via VS Code API at precise coordinates
    const newContent = `// Updated single block test
vivafolio_block!("updated-entity-123")

// Some other updated code
fn updated_main() {
    println!("Updated Hello from mock language!");
}`
    await browser.executeWorkbench((vscode, tf, content) => {
      return (async () => {
        const uri = vscode.Uri.file(tf)
        const doc = await vscode.workspace.openTextDocument(uri)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        await (await vscode.workspace.openTextDocument(uri)).save()
      })()
    }, testFile, newContent)
    await browser.pause(1500)

    // Verify inset moved to expected line (line 1, zero-based)
    const hasAtUpdatedLine = await browser.executeWorkbench((vscode, tf) => {
      return vscode.commands.executeCommand('vivafolio.hasInsetAt', vscode.Uri.file(tf), 1)
    }, testFile)
    expect(hasAtUpdatedLine).toBe(true)
    const insets = await browser.executeWorkbench((vscode, tf) => {
      return vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf))
    }, testFile)
    expect((insets as any[]).length).toBe(1)
  })

  it('should remove inset when block is deleted', async () => {
    // First, ensure we have the initial file open
    const testFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', 'main.viv')

    // Open the test file using VS Code command palette
    await browser.executeWorkbench((vscode, tf) => {
      return (async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        await vscode.window.showTextDocument(doc)
      })()
    }, testFile)
    await browser.pause(3000)

    const insetInitially = await browser.executeWorkbench((vscode, tf) => {
      return vscode.commands.executeCommand('vivafolio.hasInsetAt', vscode.Uri.file(tf), 4)
    }, testFile)
    expect(insetInitially).toBe(true)

    // Clear the file content (remove the vivafolio block) via VS Code API
    const emptyContent = `// Empty file with no vivafolio blocks
fn empty_main() {
    println!("No blocks here!");
}`
    await browser.executeWorkbench((vscode, tf, content) => {
      return (async () => {
        const uri = vscode.Uri.file(tf)
        const doc = await vscode.workspace.openTextDocument(uri)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        await (await vscode.workspace.openTextDocument(uri)).save()
      })()
    }, testFile, emptyContent)
    await browser.pause(1500)

    const insetAfterRemoval = await browser.executeWorkbench((vscode, tf) => {
      return vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf))
    }, testFile)
    expect((insetAfterRemoval as any[]).length).toBe(0)
  })

  afterEach(async () => {
    // Clean up by closing all editors after each test
    await workbench.executeCommand('workbench.action.closeAllEditors')
    await browser.pause(500)
  })
})
