import { $, browser } from '@wdio/globals'
import { BaseWebviewPage } from './BaseWebviewPage'

/**
 * Page Object for the Color Picker webview block
 */
export class ColorPickerPage extends BaseWebviewPage {
  private get colorInput() { return $('#picker') }
  private get colorValue() { return $('#picker') }

  /**
   * Set the color using the color input
   */
  async setColor(color: string): Promise<void> {
    await this.switchToWebview()
    try {
      const input = await this.colorInput
      try { await input.scrollIntoView(); } catch {}
      try { await input.click(); } catch {}
      try {
        await input.setValue(color)
      } catch {
        // Fallback: set value via script and dispatch input event
        await browser.execute((c) => {
          const el = document.getElementById('picker') as HTMLInputElement | null
          if (el) {
            el.value = c
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
        }, color)
      }

      // Wait for the input change event to trigger
      await browser.pause(500)

      // Verify the color was set
      const currentValue = await input.getValue()
      if (currentValue !== color) {
        throw new Error(`Failed to set color. Expected: ${color}, Got: ${currentValue}`)
      }
    } finally {
      await this.switchToWorkbench()
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
