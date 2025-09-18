import { test, expect } from '@playwright/test'

test.describe('Static asset smoke tests', () => {
  test('serves HTML template block assets', async ({ request }) => {
    const metadataResponse = await request.get('/external/html-template-block/block-metadata.json')
    expect(metadataResponse.status(), 'metadata status').toBe(200)
    const metadata = await metadataResponse.json()
    expect(metadata.name).toBe('html-block')
    expect(metadata?.blockType?.entryPoint).toBe('html')

    const htmlResponse = await request.get('/external/html-template-block/src/app.html')
    expect(htmlResponse.status(), 'html status').toBe(200)
    const htmlBody = await htmlResponse.text()
    expect(htmlBody).toContain('data-title')
    expect(htmlBody).toContain('script type="module" src="./app.js"')

    const jsResponse = await request.get('/external/html-template-block/src/app.js')
    expect(jsResponse.status(), 'js status').toBe(200)
    const jsBody = await jsResponse.text()
    expect(jsBody).toContain('blockprotocol.getBlockContainer')

    const svgResponse = await request.get('/external/html-template-block/public/omega.svg')
    expect(svgResponse.status(), 'svg status').toBe(200)
    const contentType = svgResponse.headers()['content-type'] ?? ''
    expect(contentType).toContain('image/svg+xml')
    const svgBody = await svgResponse.text()
    expect(svgBody).toContain('<svg')
  })
})
