import { browser, expect } from '@wdio/globals'

describe('Hello VS Code', () => {
  it('can launch and read title bar', async () => {
    const workbench = await (browser as any).getWorkbench()
    const titleBar = await workbench.getTitleBar()
    const title = await titleBar.getTitle()
    console.log('VS Code Title:', title)
    expect(title).toBeDefined()
    expect(String(title).length).toBeGreaterThan(0)
  })
})


