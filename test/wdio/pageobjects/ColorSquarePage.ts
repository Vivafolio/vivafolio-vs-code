import { $, browser } from '@wdio/globals'
import { BaseWebviewPage } from './BaseWebviewPage'

/**
 * Page Object for the Color Square webview block
 */
export class ColorSquarePage extends BaseWebviewPage {
  private get colorSquare() { return $('#sq') }

  /**
   * Get the current background color of the square
   */
  async getCurrentColor(): Promise<string> {
    await this.switchToWebview()
    try {
      const square = await this.colorSquare
      const backgroundColor = await square.getCSSProperty('background-color')
      const value: string = (backgroundColor.value as unknown as string) || 'rgb(0, 0, 0)'
      // Convert RGB/RGBA to hex for consistency
      return this.rgbToHex(value)
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Wait for the color square to display a specific color
   */
  async waitForColor(color: string, timeout: number = 5000): Promise<void> {
    const expectedColor = color.startsWith('#') ? color : `#${color}`

    await this.switchToWebview()
    try {
      await browser.waitUntil(async () => {
        const currentColor = await this.getCurrentColor()
        return currentColor.toLowerCase() === expectedColor.toLowerCase()
      }, {
        timeout,
        timeoutMsg: `Color square did not change to ${expectedColor} within ${timeout}ms`
      })
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Verify the square is displaying the expected color
   */
  async verifyColor(expectedColor: string): Promise<boolean> {
    const currentColor = await this.getCurrentColor()
    const normalizedExpected = expectedColor.startsWith('#') ? expectedColor : `#${expectedColor}`
    return currentColor.toLowerCase() === normalizedExpected.toLowerCase()
  }

  /**
   * Wait for the color square to be ready and visible
   */
  async waitForReady(): Promise<void> {
    await this.switchToWebview()
    try {
      await browser.waitUntil(async () => {
        const square = await this.colorSquare
        const exists = await square.isExisting().catch(() => false)
        return !!exists
      }, {
        timeout: 15000,
        timeoutMsg: 'Color square not found within 15 seconds'
      })
    } finally {
      await this.switchToWorkbench()
    }

    // Call parent ready check
    await super.waitForReady()
  }

  /**
   * Helper method to convert RGB color values to hex
   */
  private rgbToHex(rgb: string): string {
    // Handle RGB/RGBA format: rgb(r, g, b) or rgba(r, g, b, a)
    const rgbMatch = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1])
      const g = parseInt(rgbMatch[2])
      const b = parseInt(rgbMatch[3])
      return `#${this.componentToHex(r)}${this.componentToHex(g)}${this.componentToHex(b)}`
    }

    // If already in hex format or other format, return as-is
    return rgb
  }

  /**
   * Helper method to convert color component to hex
   */
  private componentToHex(c: number): string {
    const hex = c.toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }
}
