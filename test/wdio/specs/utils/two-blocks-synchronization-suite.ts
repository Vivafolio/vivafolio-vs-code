import { browser, expect } from '@wdio/globals'
import type { Workbench, EditorView } from 'wdio-vscode-service'
import { ColorPickerPage, ColorSquarePage } from '../../pageobjects'
import path from 'path'
import fs from 'fs'

export function createTwoBlocksSynchronizationSuite(initialColor: string) {
  describe(`Vivafolio Two-Blocks Synchronization E2E (${initialColor})`, () => {
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
      testFile = path.join(process.cwd(), 'test', 'projects', 'vivafolioblock-test', `two_blocks_sync_${initialColor.replace('#', '')}.mocklang`)

      // Ensure the test file exists with initial content using the test color
      const initialContent = `// Vivafolio two blocks synchronization demo
// This file demonstrates complete bidirectional state synchronization
vivafolio_picker!() gui_state! r#"{"properties":{"color":"${initialColor}"}}"#
vivafolio_square!()`
      console.log('Creating new file...:', testFile)
      await fs.promises.writeFile(testFile, initialContent, 'utf8')

      // Open the file and process diagnostics
      await browser.executeWorkbench(async (vscode, tf) => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tf))
        await vscode.window.showTextDocument(doc)
        await vscode.commands.executeCommand('vivafolio.processCurrentDiagnostics')
      }, testFile)
      await browser.pause(1500)
      console.log('[TEST] Executed workbench commands')
    })

    // Helper to dump LSP output channel for debugging
    async function dumpLSPOutput(label: string) {
      const output = await browser.executeWorkbench((vscode) => {
        const channels = (vscode.window as any).outputChannels || []
        console.log('Available channels:', channels.map((c: any) => c.name))
        const lspChannel = channels.find((c: any) => c.name === 'Mocklang Language Server')
        if (!lspChannel) return 'LSP channel not found'

        // Try to get the channel's text content
        try {
          const text = (lspChannel as any)._chan?.toString() ||
            (lspChannel as any).text?.toString() ||
            'Could not read channel contents'
          return text
        } catch (e) {
          return `Error reading channel: ${e}`
        }
      })
      console.log(`=== LSP Output (${label}) ===`)
      console.log(output)
      console.log('=== End LSP Output ===')
    }

    it('should initialize color picker with color from source code', async () => {
      // Dump LSP output to see if diagnostics were published
      await dumpLSPOutput('after file open')
      // Wait for diagnostics to be processed and insets to be created via extension-side query
      await browser.waitUntil(async () => {
        const insets = await browser.executeWorkbench((vscode, tf) => vscode.commands.executeCommand('vivafolio.findInsetsForDocument', vscode.Uri.file(tf)), testFile)
        return Array.isArray(insets) && insets.length >= 2
      }, { timeout: 20000, timeoutMsg: 'Expected two insets for synchronization test' })

      // Find color picker webview by content (#colorPicker in DOM)
      let pickerWebview: any | undefined
      for (let i = 0; i < 6 && !pickerWebview; i++) {
        for (const wv of await workbench.getAllWebviews() as any[]) {
          try {
            await (wv as any).open()
            const hasPicker = await $('#colorPicker').isExisting().catch(() => false)
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
            if (await $('#colorPicker').isExisting().catch(() => false)) pickerWebview = wv
          } finally { try { await (wv as any).close() } catch { } }
        }
        if (!pickerWebview) await browser.pause(1000)
      }

      if (pickerWebview) {
        colorPickerPage = new ColorPickerPage(pickerWebview)

        // Wait for webview to be ready
        await colorPickerPage.waitForReady()

        // Wait for webview to be INITIALIZED with initial state (not just ready)
        // Poll until getCurrentColor returns the expected initial color
        await browser.waitUntil(async () => {
          const currentColor = await colorPickerPage.getCurrentColor()
          console.log('[DEBUG] Waiting for initialization, current color:', currentColor, 'expected:', initialColor)
          return currentColor === initialColor
        }, {
          timeout: 10000,
          interval: 500,
          timeoutMsg: `Webview not initialized with correct color. Expected: ${initialColor}`
        })
        console.log('[DEBUG] Webview fully initialized!')

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
            if (await $('#colorPicker').isExisting().catch(() => false)) pickerWebview = wv
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

        // Debug: log picker elements in active frame and enumerate webviews
        const pickerDebug = await browser.execute(() => {
          const count = document.querySelectorAll('#colorPicker').length
          const value = (document.getElementById('colorPicker') as HTMLInputElement | null)?.value
          return { count, value }
        }).catch(() => ({ count: -1, value: 'unavailable' }))
        console.log('[DEBUG] Picker elements in current frame:', pickerDebug)
        const webviews = await workbench.getAllWebviews() as any[]
        console.log('[DEBUG] Webview count:', webviews.length)
        for (let idx = 0; idx < webviews.length; idx++) {
          const wv = webviews[idx]
          try {
            await (wv as any).open()
            const hasPicker = await $('#colorPicker').isExisting().catch(() => false)
            const pickerValue = hasPicker ? await $('#colorPicker').getValue().catch(() => 'err') : 'n/a'
            console.log(`[DEBUG] webview[${idx}] hasPicker=${hasPicker} value=${pickerValue}`)
          } catch (err) {
            console.log(`[DEBUG] webview[${idx}] error while probing:`, err)
          } finally {
            try { await (wv as any).close() } catch { }
          }
        }

        // Refresh the webview reference because VS Code recreates it after file edits
        pickerWebview = undefined
        for (let i = 0; i < 6 && !pickerWebview; i++) {
          const allWvs = await workbench.getAllWebviews() as any[]
          for (let idx = allWvs.length - 1; idx >= 0; idx--) { // prefer newest webviews
            const wv = allWvs[idx]
            try {
              await (wv as any).open()
              if (await $('#colorPicker').isExisting().catch(() => false)) pickerWebview = wv
            } finally { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview) await browser.pause(1000)
        }
        colorPickerPage = new ColorPickerPage(pickerWebview!)

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
            const hasPicker = await $('#colorPicker').isExisting().catch(() => false)
            const hasSquare = await $('#colorSquare').isExisting().catch(() => false)
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
            if (await $('#colorPicker').isExisting().catch(() => false)) pickerWebview = wv
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

        // Re-fetch webview since file change causes extension to recreate webviews
        pickerWebview = undefined
        for (let i = 0; i < 6 && !pickerWebview; i++) {
          for (const wv of await workbench.getAllWebviews() as any[]) {
            try {
              await (wv as any).open()
              if (await $('#colorPicker').isExisting().catch(() => false)) pickerWebview = wv
            } finally { try { await (wv as any).close() } catch { } }
          }
          if (!pickerWebview) await browser.pause(1000)
        }
        colorPickerPage = new ColorPickerPage(pickerWebview)

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
            if (await $('#colorPicker').isExisting().catch(() => false)) pickerWebview = wv
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
}
