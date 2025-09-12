import { $, browser } from '@wdio/globals'
import type { WebView } from 'wdio-vscode-service'

/**
 * Base class for Vivafolio webview page objects
 * Provides common functionality for interacting with VS Code webviews
 */
export class BaseWebviewPage {
  protected webview: WebView

  constructor(webview: WebView) {
    this.webview = webview
  }

  /**
   * Switch the automation context to this webview's iframe
   */
  async switchToWebview(): Promise<void> {
    // Retry a few times to avoid stale element reference when VS Code re-renders iframes
    for (let i = 0; i < 5; i++) {
      try {
        await (this.webview as any).open()
        return
      } catch (e) {
        if (i === 4) throw e
        await browser.pause(500)
      }
    }
  }

  /**
   * Switch back to the main VS Code workbench context
   */
  async switchToWorkbench(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      try {
        await (this.webview as any).close()
        return
      } catch (e) {
        if (i === 4) throw e
        await browser.pause(500)
      }
    }
  }

  /**
   * Wait for the webview to be ready (acquireVsCodeApi called)
   */
  async waitForReady(): Promise<void> {
    await this.switchToWebview()
    try {
      // Wait until either a known readiness marker or key element is visible, or the document is fully loaded
      await browser.waitUntil(async () => {
        const readyEl = await $('#vivafolio-ready')
        if (await readyEl.isExisting().catch(() => false) && await readyEl.isDisplayed().catch(() => false)) return true

        const pickerEl = await $('#picker')
        if (await pickerEl.isExisting().catch(() => false) && await pickerEl.isDisplayed().catch(() => false)) return true

        const squareEl = await $('#sq')
        if (await squareEl.isExisting().catch(() => false) && await squareEl.isDisplayed().catch(() => false)) return true

        const state = await browser.execute(() => document.readyState as any)
        return state === 'complete'
      }, { timeout: 15000, timeoutMsg: 'Webview did not become ready in time' })
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Get the current graph state from the webview
   */
  async getCurrentGraph(): Promise<any> {
    await this.switchToWebview()
    try {
      const graphElement = await $('#vivafolio-graph-state')
      const graphJson = await graphElement.getText()
      return JSON.parse(graphJson)
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Send a message to the extension host via postMessage
   */
  async sendMessage(message: any): Promise<void> {
    await this.switchToWebview()
    try {
      await browser.execute((msg) => {
        // Use the VS Code API to send message to extension
        const vscode = (window as any).acquireVsCodeApi()
        vscode.postMessage(msg)
      }, message)
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Wait for a specific message type from the extension
   */
  async waitForMessage(messageType: string, timeout: number = 5000): Promise<any> {
    await this.switchToWebview()
    try {
      return await browser.waitUntil(async () => {
        const messagesElement = await $('#vivafolio-messages')
        if (!await messagesElement.isDisplayed()) {
          return false
        }

        const messagesJson = await messagesElement.getText()
        const messages = JSON.parse(messagesJson)

        return messages.find((msg: any) => msg.command === messageType)
      }, {
        timeout,
        timeoutMsg: `Expected message type '${messageType}' not received within ${timeout}ms`
      })
    } finally {
      await this.switchToWorkbench()
    }
  }

  /**
   * Clear the message history (for test isolation)
   */
  async clearMessages(): Promise<void> {
    await this.switchToWebview()
    try {
      await browser.execute(() => {
        const messagesElement = document.getElementById('vivafolio-messages')
        if (messagesElement) {
          messagesElement.textContent = '[]'
        }
      })
    } finally {
      await this.switchToWorkbench()
    }
  }
}
