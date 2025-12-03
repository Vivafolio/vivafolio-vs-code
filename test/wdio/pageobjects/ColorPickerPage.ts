import { $, browser } from '@wdio/globals'
import { BaseWebviewPage } from './BaseWebviewPage'

/**
 * Page Object for the Color Picker webview block
 */
export class ColorPickerPage extends BaseWebviewPage {
  private get colorInput() { return $('#colorPicker') }
  private get colorValue() { return $('#colorPicker') }

  /**
   * Set the color using the color input
   */
  async setColor(color: string): Promise<void> {
    console.log('[setColor] Starting, target color:', color)
    await this.switchToWebview()
    console.log('[setColor] Switched to webview')
    try {
      const input = await this.colorInput
      console.log('[setColor] Got color input element')
      try { await input.scrollIntoView(); } catch { }
      try { await input.click(); } catch { }
      console.log('[setColor] Clicked input')

      // Set the value via WebDriver
      await input.setValue(color)
      console.log('[setColor] setValue completed')

      // CRITICAL: setValue() doesn't trigger input event for color inputs
      // We must manually dispatch it so the webview's JavaScript processes the change
      await browser.execute((c) => {
        const el = document.getElementById('colorPicker') as HTMLInputElement | null
        if (el) {
          console.log('[COLOR-PICKER] Manually dispatching input event for color:', c)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, color)
      console.log('[setColor] Manually dispatched input/change events')

      // Wait for the webview to process the event
      console.log('[setColor] Waiting for webview to process change')
      await browser.pause(1000)
      console.log('[setColor] setValue complete, change should have propagated')
    } finally {
      console.log('[setColor] Switching back to workbench')
      await this.switchToWorkbench()
      console.log('[setColor] Complete')
    }
  }

  /**
   * Get the currently selected color
   */
  async getCurrentColor(): Promise<string> {
    await this.switchToWebview()
    try {
      const input = await this.colorInput
      return await input.getValue()
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Click the color input to open the browser's color picker
   * Note: This simulates a user click but won't actually open the native color picker
   * in a headless environment. For testing purposes, we use setColor() instead.
   */
  async clickColorInput(): Promise<void> {
    await this.switchToWebview()
    try {
      const input = await this.colorInput
      await input.click()
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Wait for the color picker to be ready and interactive
   */
  async waitForReady(): Promise<void> {
    await this.switchToWebview()
    try {
      await browser.waitUntil(async () => {
        const input = await this.colorInput
        const exists = await input.isExisting().catch(() => false)
        if (!exists) return false
        const enabled = await input.isEnabled().catch(() => false)
        return enabled
      }, {
        timeout: 15000,
        timeoutMsg: 'Color picker input not ready within 15 seconds'
      })
    } finally {
      await this.switchToWorkbench()
    }

    // Call parent ready check
    await super.waitForReady()
  }

  /**
   * Simulate user interaction: select a color and verify it was sent to the extension
   */
  async selectColorAndVerify(color: string): Promise<void> {
    // Set the color (simulates user selecting color)
    await this.setColor(color)

    // Verify the extension received a graph:update with the expected color
    const expectedColor = color.startsWith('#') ? color : `#${color}`
    await browser.waitUntil(async () => {
      const lastMsg = await browser.executeWorkbench((vscode) => (vscode.commands.executeCommand as any)('vivafolio.getLastMessage'))
      const propColor = lastMsg?.payload?.entities?.[0]?.properties?.color
      return lastMsg?.type === 'graph:update' && typeof propColor === 'string' && propColor.toLowerCase() === expectedColor.toLowerCase()
    }, { timeout: 5000, timeoutMsg: `graph:update with color ${expectedColor} not observed in time` })
  }
}
