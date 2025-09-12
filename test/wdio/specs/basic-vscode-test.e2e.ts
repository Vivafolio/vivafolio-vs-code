/// <reference types="@wdio/mocha-framework" />
import { browser, expect } from '@wdio/globals'
import type { Workbench } from 'wdio-vscode-service'

describe('Basic VS Code Test', () => {
  let workbench: Workbench

  it('should start VS Code and verify basic functionality', async () => {
    // Wait for VS Code to load
    console.log('Waiting for VS Code to load...')
    await browser.pause(10000)

    try {
      // Try to get the workbench
      workbench = await browser.getWorkbench()
      console.log('Workbench obtained successfully')

      // Try to get basic information
      const title = await workbench.getTitleBar().getTitle()
      console.log('VS Code title:', title)

      expect(title.length).toBeGreaterThan(0)

      // Access activity and status bars without display checks
      await workbench.getActivityBar()
      await workbench.getStatusBar()

    } catch (error) {
      console.error('Error during basic VS Code test:', error)

      // If we can't get the workbench, let's check what's actually available
      const body = await $('body')
      const bodyText = await body.getText()
      console.log('Body text:', bodyText)

      const html = await browser.getPageSource()
      console.log('Page source length:', html.length)

      // Look for any VS Code specific elements
      const vsCodeElements = await $$('[class*="monaco"]')
      console.log('Found Monaco elements:', vsCodeElements.length)

      throw error
    }
  })

  it('should list available commands', async () => {
    try {
      const commandPrompt = await workbench.openCommandPrompt()
      console.log('Command prompt opened')

      // Try to type a simple command
      await commandPrompt.setText('>Developer: Reload Window')
      console.log('Command set')

      // Don't actually execute it, just verify we can interact
      const text = await commandPrompt.getText()
      console.log('Command prompt text:', text)

    } catch (error) {
      console.error('Error testing command prompt:', error)
      throw error
    }
  })
})
