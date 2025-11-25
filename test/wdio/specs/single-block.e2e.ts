/// <reference types="@wdio/mocha-framework" />
import { browser, expect } from '@wdio/globals'
import type { Workbench, EditorView } from 'wdio-vscode-service'
import path from 'path'

describe('Vivafolio Single Block E2E', () => {
  let workbench: Workbench
  let editorView: EditorView

  const testFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', 'main.mocklang')

  // Timing constants for better readability and maintainability
  const TIMING = {
    DIAGNOSTICS_PROCESSING: 3000,  // Time for LSP to process diagnostics and create insets
    LSP_UPDATE: 1500,              // Time for LSP to update after file modification
    EDITOR_CLOSE: 500              // Time for editors to close
  }

  // Original file content to restore after tests
  const originalContent = `// Vivafolio E2E Test File
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

  // Helper: Calculate line numbers dynamically from content
  const getBlockLine = (content: string, blockId: string): number => {
    return content.split('\n').findIndex(line => line.includes(`vivafolio_block!("${blockId}")`))
  }

  // Helper: Open and display test file
  async function openTestFile(): Promise<void> {
    await browser.executeWorkbench(async (vscode, tf) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
      await vscode.window.showTextDocument(doc)
    }, testFile)
  }

  // Helper: Update file content and save
  async function updateFileContent(content: string): Promise<void> {
    await browser.executeWorkbench(async (vscode, tf, newContent) => {
      const uri = vscode.Uri.file(tf)
      const doc = await vscode.workspace.openTextDocument(uri)
      const edit = new vscode.WorkspaceEdit()
      edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), newContent)
      await vscode.workspace.applyEdit(edit)
      await doc.save()
    }, testFile, content)
  }

  // Helper: Check if inset exists at line
  async function hasInsetAtLine(line: number): Promise<boolean> {
    return await browser.executeWorkbench(
      (vscode, tf, lineNum) => vscode.commands.executeCommand('vivafolio.hasInsetAt', vscode.Uri.file(tf), lineNum),
      testFile,
      line
    )
  }

  // Helper: Get all insets for document
  async function getInsets(): Promise<any[]> {
    const insets = await browser.executeWorkbench(
      (vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)),
      testFile
    )
    return Array.isArray(insets) ? insets : []
  }

  // Helper: Wait for insets to be created/updated
  async function waitForInsets(expectedCount: number, timeout = 10000): Promise<void> {
    await browser.waitUntil(async () => {
      const insets = await getInsets()
      return insets.length === expectedCount
    }, {
      timeout,
      interval: 500,
      timeoutMsg: `Expected ${expectedCount} insets but got different count after ${timeout}ms`
    })
  }

  before(async () => {
    workbench = await browser.getWorkbench()
    editorView = await workbench.getEditorView()
  })

  beforeEach(async () => {
    // Close all editors and reset file to known state
    await workbench.executeCommand('workbench.action.closeAllEditors')
    await browser.pause(TIMING.EDITOR_CLOSE)

    await updateFileContent(originalContent)
    await openTestFile()
    await browser.pause(TIMING.DIAGNOSTICS_PROCESSING)
  })

  it('should create insets for vivafolio blocks', async () => {
    // Verify insets were created at expected lines
    const firstBlockLine = getBlockLine(originalContent, 'test-entity-123')
    const secondBlockLine = getBlockLine(originalContent, 'test-entity-456')

    expect(await hasInsetAtLine(firstBlockLine)).toBe(true)
    expect(await hasInsetAtLine(secondBlockLine)).toBe(true)

    // Verify total inset count
    const insets = await getInsets()
    expect(insets.length).toBe(2)
    expect(insets[0]).toHaveProperty('blockId')
    expect(insets[0]).toHaveProperty('line')
  })

  it('should update inset position when block moves in file', async () => {
    const updatedContent = `// Updated single block test
vivafolio_block!("updated-entity-123")

// Some other updated code
fn updated_main() {
    println!("Updated Hello from mock language!");
}`

    await updateFileContent(updatedContent)
    await browser.pause(TIMING.LSP_UPDATE)

    // Wait for insets to update to new count
    await waitForInsets(1)

    // Verify inset moved to new line
    const newBlockLine = getBlockLine(updatedContent, 'updated-entity-123')
    expect(await hasInsetAtLine(newBlockLine)).toBe(true)

    const insets = await getInsets()
    expect(insets.length).toBe(1)
  })

  it('should remove inset when block is deleted from file', async () => {
    // Verify we start with insets
    expect((await getInsets()).length).toBe(2)

    const contentWithoutBlocks = `// Empty file with no vivafolio blocks
fn empty_main() {
    println!("No blocks here!");
}`

    await updateFileContent(contentWithoutBlocks)
    await browser.pause(TIMING.LSP_UPDATE)

    // Wait for insets to be removed
    await waitForInsets(0)

    expect((await getInsets()).length).toBe(0)
  })

  it('should create webview for vivafolio block', async () => {
    // This test validates UI rendering, separate from API-level tests above
    const webviews = await workbench.getAllWebviews()

    // Should have webviews for the 2 blocks
    expect(webviews.length).toBeGreaterThanOrEqual(1)

    // Validate first webview can be opened and has content
    const webview = webviews[0]
    await (webview as any).open()

    try {
      const body = await $('body')
      await body.waitForDisplayed({ timeout: 5000 })

      // Verify webview loaded successfully
      const title = await browser.getTitle()
      expect(title).toBeTruthy()
      expect(title.length).toBeGreaterThan(0)
    } finally {
      await (webview as any).close()
    }
  })

  afterEach(async () => {
    await workbench.executeCommand('workbench.action.closeAllEditors')
    await browser.pause(TIMING.EDITOR_CLOSE)
  })

  after(async () => {
    // Restore original file content
    await browser.executeWorkbench(async (vscode, tf, content) => {
      const uri = vscode.Uri.file(tf)
      const doc = await vscode.workspace.openTextDocument(uri).catch(() => undefined)
      if (doc) {
        const edit = new vscode.WorkspaceEdit()
        edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        await doc.save()
      }
    }, testFile, originalContent)

    await workbench.executeCommand('workbench.action.closeAllEditors')
  })
})
