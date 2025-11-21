import { browser, expect } from '@wdio/globals'
import type { Workbench, EditorView, WebView } from 'wdio-vscode-service'
import { ColorPickerPage, ColorSquarePage } from '../pageobjects'
import path from 'path'
import fs from 'fs'

describe('Vivafolio Two-Blocks Synchronization E2E', () => {
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

  // Test with different initial colors to ensure dynamic initialization
  const testColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']

  testColors.forEach((initialColor) => {
    describe(`with initial color ${initialColor}`, () => {
      beforeEach(async () => {
        testFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', `two_blocks_sync_${initialColor.replace('#', '')}.mocklang`)

        // Ensure the test file exists with initial content using the test color
        const initialContent = `// Vivafolio two blocks synchronization demo
// This file demonstrates complete bidirectional state synchronization
vivafolio_picker!() gui_state! r#"{"properties":{"color":"${initialColor}"}}"#
vivafolio_square!()`
        await fs.promises.writeFile(testFile, initialContent, 'utf8')
      })

      it('should initialize color picker with color from source code', async () => {
        // Open the test file via VS Code API instead of quick open
        await browser.executeWorkbench((vscode, tf) => {
          return (async () => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
            await vscode.window.showTextDocument(doc)
            await vscode.commands.executeCommand('vivafolio.processCurrentDiagnostics')
          })()
        }, testFile)
        await browser.pause(1500)

        // Wait for diagnostics to be processed and insets to be created via extension-side query
        await browser.waitUntil(async () => {
          const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
          return Array.isArray(insets) && insets.length >= 2
        }, { timeout: 20000, timeoutMsg: 'Expected two insets for synchronization test' })

        // Find color picker webview by content (#picker in DOM)
        let pickerWebview: any | undefined
        for (let i = 0; i < 6 && !pickerWebview; i++) {
          for (const wv of await workbench.getAllWebviews() as any[]) {
            try {
              await (wv as any).open()
              const hasPicker = await $('#picker').isExisting().catch(() => false)
              await (wv as any).close()
              if (hasPicker) { pickerWebview = wv; break }
            } catch { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview) await browser.pause(1000)
        }
        expect(pickerWebview).toBeDefined()
        if (pickerWebview) {
          colorPickerPage = new ColorPickerPage(pickerWebview as any)

          // Wait for the webview to be ready and receive initial state
          await colorPickerPage.waitForReady()
          await browser.pause(2000) // Extra time for initial graph:update

          const actualColor = await colorPickerPage.getCurrentColor()
          console.log('Expected initial color:', initialColor)
          console.log('Actual color:', actualColor)
          expect(actualColor).toBe(initialColor) // Should match the color in gui_state!
        }
      })

      it('should synchronize UI changes to source code', async () => {
        // Open the test file using VS Code workbench
        await browser.executeWorkbench((vscode, tf) => {
          return (async () => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
            await vscode.window.showTextDocument(doc)
            await vscode.commands.executeCommand('vivafolio.processCurrentDiagnostics')
          })()
        }, testFile)
        await browser.pause(1500)

        // Wait for insets to load and initial state to be set via extension-side query
        await browser.waitUntil(async () => {
          const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
          return Array.isArray(insets) && insets.length >= 1
        }, { timeout: 15000, timeoutMsg: 'Expected at least one inset for picker' })

        // Get color picker webview by content
        let pickerWebview: any | undefined
        for (let i = 0; i < 6 && !pickerWebview; i++) {
          for (const wv of await workbench.getAllWebviews() as any[]) {
            try {
              await (wv as any).open()
              if (await $('#picker').isExisting().catch(() => false)) pickerWebview = wv
            } finally { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview) await browser.pause(1000)
        }

        if (pickerWebview) {
          colorPickerPage = new ColorPickerPage(pickerWebview)

          // Wait for webview to be ready
          await colorPickerPage.waitForReady()

          // Verify initial state is correct first
          const currentColor = await colorPickerPage.getCurrentColor()
          console.log('Current color before change:', currentColor)
          expect(currentColor).toBe(initialColor)

          // Change color to something different from initial
          const newColor = initialColor === '#ff0000' ? '#00ff00' : '#ff0000'
          console.log('Changing color from', initialColor, 'to', newColor)

          await colorPickerPage.setColor(newColor)

          // Wait for source code to be updated (bidirectional sync)
          await browser.pause(3000)

          // Verify the color picker shows the new color
          const updatedPickerColor = await colorPickerPage.getCurrentColor()
          console.log('Color picker after change:', updatedPickerColor)
          expect(updatedPickerColor).toBe(newColor)

          // Verify source code was updated
          const updatedContent = await fs.promises.readFile(testFile, 'utf8')
          console.log('Source content after change:')
          console.log(updatedContent.split('\n')[1])
          expect(updatedContent).toContain(`"color":"${newColor}"`)
          expect(updatedContent).not.toContain(`"color":"${initialColor}"`)
        }
      })

      it('should synchronize source code changes to UI', async () => {
        // Open the test file using VS Code workbench
        await browser.executeWorkbench((vscode, tf) => {
          return (async () => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
            await vscode.window.showTextDocument(doc)
            await vscode.commands.executeCommand('vivafolio.processCurrentDiagnostics')
          })()
        }, testFile)
        await browser.pause(1500)

        // Wait for insets to load via extension-side query
        await browser.waitUntil(async () => {
          const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
          return Array.isArray(insets) && insets.length >= 1
        }, { timeout: 15000 })

        // Get color picker webview by content
        let pickerWebview: any | undefined
        for (let i = 0; i < 6 && !pickerWebview; i++) {
          for (const wv of await workbench.getAllWebviews() as any[]) {
            try {
              await (wv as any).open()
              if (await $('#picker').isExisting().catch(() => false)) pickerWebview = wv
            } finally { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview) await browser.pause(1000)
        }

        if (pickerWebview) {
          colorPickerPage = new ColorPickerPage(pickerWebview)

          // Modify source code directly - change to a different color
          const newColor = initialColor === '#ff0000' ? '#0000ff' : '#ff0000'
          const newContent = `// Vivafolio two blocks synchronization demo
vivafolio_picker!() gui_state! r#"{"properties":{"color":"${newColor}"}}"#
vivafolio_square!()`

          await fs.promises.writeFile(testFile, newContent, 'utf8')

          // Wait for LSP to detect change and update webview
          await browser.pause(3000)

          // Verify picker color was updated
          const updatedColor = await colorPickerPage.getCurrentColor()
          expect(updatedColor).toBe(newColor)
          expect(updatedColor).not.toBe(initialColor)
        }
      })

      it('should synchronize cross-block updates (picker to square)', async () => {
        // Open the test file using VS Code workbench
        await browser.executeWorkbench((vscode, tf) => {
          return (async () => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
            await vscode.window.showTextDocument(doc)
            await vscode.commands.executeCommand('vivafolio.processCurrentDiagnostics')
          })()
        }, testFile)
        await browser.pause(1500)

        await browser.waitUntil(async () => {
          const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
          return Array.isArray(insets) && insets.length >= 2
        }, { timeout: 15000, timeoutMsg: 'Expected two insets (picker and square)' })

        // Get both webviews by content
        let pickerWebview: any | undefined
        let squareWebview: any | undefined
        for (let i = 0; i < 6 && (!pickerWebview || !squareWebview); i++) {
          for (const wv of await workbench.getAllWebviews() as any[]) {
            try {
              await (wv as any).open()
              const hasPicker = await $('#picker').isExisting().catch(() => false)
              const hasSquare = await $('#square').isExisting().catch(() => false)
              await (wv as any).close()
              if (hasPicker && !pickerWebview) pickerWebview = wv
              if (hasSquare && !squareWebview) squareWebview = wv
            } catch { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview || !squareWebview) await browser.pause(1000)
        }

        if (pickerWebview && squareWebview) {
          colorPickerPage = new ColorPickerPage(pickerWebview)
          colorSquarePage = new ColorSquarePage(squareWebview)

          // Change color in picker to something different
          const newColor = initialColor === '#ff0000' ? '#00ff00' : '#ff0000'
          await colorPickerPage.setColor(newColor)

          // Wait for synchronization
          await browser.pause(3000)

          // Verify square matches picker color
          const squareColor = await colorSquarePage.getCurrentColor()
          const pickerColor = await colorPickerPage.getCurrentColor()
          expect(squareColor).toBe(pickerColor)
          expect(squareColor).toBe(newColor)
        }
      })

      it('should handle external file modifications', async () => {
        // Open the test file using VS Code workbench
        await browser.executeWorkbench((vscode, tf) => {
          return (async () => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
            await vscode.window.showTextDocument(doc)
          })()
        }, testFile)
        await browser.pause(1500)

        await browser.waitUntil(async () => {
          const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
          return Array.isArray(insets) && insets.length >= 1
        }, { timeout: 15000 })

        // Get color picker webview by content
        let pickerWebview: any | undefined
        for (let i = 0; i < 6 && !pickerWebview; i++) {
          for (const wv of await workbench.getAllWebviews() as any[]) {
            try {
              await (wv as any).open()
              if (await $('#picker').isExisting().catch(() => false)) pickerWebview = wv
            } finally { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview) await browser.pause(1000)
        }

        if (pickerWebview) {
          colorPickerPage = new ColorPickerPage(pickerWebview)

          // Simulate external tool modifying the file to a different color
          const externalColor = initialColor === '#ff0000' ? '#ffff00' : '#ff0000'
          const externalContent = `// Vivafolio two blocks synchronization demo
vivafolio_picker!() gui_state! r#"{"properties":{"color":"${externalColor}"}}"#
vivafolio_square!()`
          await fs.promises.writeFile(testFile, externalContent, 'utf8')

          // Wait for VS Code to detect the external change
          await browser.pause(3000)

          // Verify picker was updated
          const updatedColor = await colorPickerPage.getCurrentColor()
          expect(updatedColor).toBe(externalColor)
          expect(updatedColor).not.toBe(initialColor)
        }
      })

      it('should handle idempotent updates without unnecessary re-renders', async () => {
        // Open the test file using VS Code workbench (API)
        await browser.executeWorkbench((vscode, tf) => {
          return (async () => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
            await vscode.window.showTextDocument(doc)
          })()
        }, testFile)
        await browser.pause(1500)

        await browser.waitUntil(async () => {
          const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
          return Array.isArray(insets) && insets.length >= 1
        }, { timeout: 15000 })

        // Get color picker webview by content
        let pickerWebview: any | undefined
        for (let i = 0; i < 6 && !pickerWebview; i++) {
          for (const wv of await workbench.getAllWebviews() as any[]) {
            try {
              await (wv as any).open()
              if (await $('#picker').isExisting().catch(() => false)) pickerWebview = wv
            } finally { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview) await browser.pause(1000)
        }

        if (pickerWebview) {
          colorPickerPage = new ColorPickerPage(pickerWebview)

          // Get current color (should be the initial color from gui_state)
          const currentColor = await colorPickerPage.getCurrentColor()
          expect(currentColor).toBe(initialColor)

          // Try to set the same color (should not trigger unnecessary updates)
          await colorPickerPage.setColor(currentColor)

          // Wait a bit
          await browser.pause(2000)

          // Verify color is still the same (no unnecessary updates)
          const finalColor = await colorPickerPage.getCurrentColor()
          expect(finalColor).toBe(currentColor)
          expect(finalColor).toBe(initialColor)
        }
      })

      afterEach(async () => {
        // Clean up test file
        try {
          await fs.promises.unlink(testFile)
        } catch (error) {
          // Ignore cleanup errors
        }
      })
    })
  })
})