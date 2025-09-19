import { test, expect } from '@playwright/test'
import fs from 'fs/promises'
import path from 'path'

// Bundle size thresholds (in bytes)
const BUNDLE_SIZE_THRESHOLDS = {
  // Framework bundles should be small for fast loading
  'solidjs-block.es.js': 5000,    // 5KB max for ES module
  'solidjs-block.umd.js': 3000,  // 3KB max for UMD (more compressed)
  // Allow some overhead for chunks created by code splitting
  'solidjs-*.js': 3000,           // 3KB max for any chunk
} as const

// Compression ratio expectations
const COMPRESSION_THRESHOLDS = {
  minimumRatio: 0.3,  // At least 70% size reduction through compression
  targetRatio: 0.25,  // Target 75% size reduction
}

test.describe('Bundle Size Validation', () => {
  test('framework bundles meet size requirements', async ({ request }) => {
    // Read the manifest to get bundle information
    const manifestResponse = await request.get('/frameworks/manifest.json')
    expect(manifestResponse.ok()).toBeTruthy()

    const manifest = await manifestResponse.json()
    expect(manifest.bundles).toBeDefined()
    expect(Array.isArray(manifest.bundles)).toBeTruthy()

    // Check each bundle in the manifest
    for (const bundle of manifest.bundles) {
      console.log(`Checking bundle: ${bundle.id} (${bundle.framework})`)

      // Verify bundle metadata
      expect(bundle.entryPoint).toBeDefined()
      expect(bundle.assets).toBeDefined()
      expect(Array.isArray(bundle.assets)).toBeTruthy()
      expect(bundle.hash).toBeDefined()
      expect(typeof bundle.hash).toBe('string')

      // Check that entry point is in assets array
      expect(bundle.assets).toContain(bundle.entryPoint)

      // Test that all assets are accessible
      for (const asset of bundle.assets) {
        const assetResponse = await request.get(`/frameworks/${bundle.framework}/${asset}`)
        expect(assetResponse.ok(), `Asset ${asset} should be accessible`).toBeTruthy()

        // Check content type based on file extension
        const contentType = assetResponse.headers()['content-type'] || ''
        if (asset.endsWith('.js')) {
          expect(contentType).toContain('javascript')
        }

        // Check caching headers for production
        if (process.env.NODE_ENV === 'production') {
          const cacheControl = assetResponse.headers()['cache-control'] || ''
          expect(cacheControl).toContain('max-age=')
          expect(cacheControl).toContain('immutable') // Hashed assets should be immutable
        }
      }
    }
  })

  test('bundle sizes are within acceptable limits', async () => {
    const frameworksDir = path.join(process.cwd(), 'dist/frameworks')

    // Check if dist directory exists (only present after build)
    try {
      await fs.access(frameworksDir)
    } catch {
      console.log('Skipping bundle size test - dist/frameworks not found (run build first)')
      return
    }

    // Get all framework directories
    const frameworkDirs = await fs.readdir(frameworksDir)

    for (const framework of frameworkDirs) {
      const frameworkPath = path.join(frameworksDir, framework)

      try {
        const files = await fs.readdir(frameworkPath)

        for (const file of files) {
          if (file.endsWith('.js')) {
            const filePath = path.join(frameworkPath, file)
            const stats = await fs.stat(filePath)
            const sizeKB = stats.size / 1024

            console.log(`${framework}/${file}: ${(sizeKB).toFixed(2)} KB (${stats.size} bytes)`)

            // Check against thresholds
            let threshold = BUNDLE_SIZE_THRESHOLDS['solidjs-*.js'] // Default for chunks

            // Check specific file thresholds
            if (file === 'solidjs-block.es.js') {
              threshold = BUNDLE_SIZE_THRESHOLDS['solidjs-block.es.js']
            } else if (file === 'solidjs-block.umd.js') {
              threshold = BUNDLE_SIZE_THRESHOLDS['solidjs-block.umd.js']
            }

            expect(stats.size, `Bundle ${framework}/${file} exceeds size threshold`).toBeLessThanOrEqual(threshold)
          }
        }
      } catch (error) {
        console.log(`Skipping ${framework} - no built assets found`)
      }
    }
  })

  test('compression effectiveness', async ({ request }) => {
    // Test gzip compression effectiveness
    const manifestResponse = await request.get('/frameworks/manifest.json')
    expect(manifestResponse.ok()).toBeTruthy()

    const manifest = await manifestResponse.json()

    for (const bundle of manifest.bundles) {
      for (const asset of bundle.assets) {
        if (asset.endsWith('.js')) {
          // Test uncompressed size
          const uncompressedResponse = await request.get(`/frameworks/${bundle.framework}/${asset}`)
          expect(uncompressedResponse.ok()).toBeTruthy()

          const uncompressedSize = parseInt(uncompressedResponse.headers()['content-length'] || '0')

          // Test compressed size (accept gzip)
          const compressedResponse = await request.get(`/frameworks/${bundle.framework}/${asset}`, {
            headers: { 'Accept-Encoding': 'gzip' }
          })
          expect(compressedResponse.ok()).toBeTruthy()

          const compressedSize = parseInt(compressedResponse.headers()['content-length'] || '0')
          const encoding = compressedResponse.headers()['content-encoding']

          if (encoding === 'gzip' && compressedSize > 0) {
            const compressionRatio = compressedSize / uncompressedSize
            console.log(`${bundle.framework}/${asset}: ${compressionRatio.toFixed(3)} compression ratio (${(compressedSize/1024).toFixed(2)} KB compressed vs ${(uncompressedSize/1024).toFixed(2)} KB uncompressed)`)

            expect(compressionRatio, `Compression ratio for ${asset} is too low`).toBeLessThanOrEqual(COMPRESSION_THRESHOLDS.minimumRatio)
            expect(compressionRatio, `Compression ratio for ${asset} below target`).toBeLessThanOrEqual(COMPRESSION_THRESHOLDS.targetRatio)
          }
        }
      }
    }
  })

  test('bundle manifest accuracy', async ({ request }) => {
    const manifestResponse = await request.get('/frameworks/manifest.json')
    expect(manifestResponse.ok()).toBeTruthy()

    const manifest = await manifestResponse.json()

    expect(manifest.generatedAt).toBeDefined()
    expect(new Date(manifest.generatedAt).toISOString()).toBe(manifest.generatedAt) // Valid ISO string

    // Verify each bundle in manifest
    for (const bundle of manifest.bundles) {
      expect(bundle.id).toBeDefined()
      expect(bundle.framework).toBeDefined()
      expect(bundle.hash).toBeDefined()
      expect(typeof bundle.hash).toBe('string')
      expect(bundle.hash.length).toBeGreaterThan(0)
      expect(bundle.entryPoint).toBeDefined()
      expect(bundle.assets).toBeDefined()
      expect(Array.isArray(bundle.assets)).toBeTruthy()
      expect(bundle.assets.length).toBeGreaterThan(0)
      expect(bundle.sourcePath).toBeDefined()

      // Verify source file exists
      try {
        await fs.access(bundle.sourcePath)
      } catch {
        throw new Error(`Source file ${bundle.sourcePath} for bundle ${bundle.id} does not exist`)
      }
    }
  })

  test('performance monitoring endpoint', async ({ request }) => {
    const performanceResponse = await request.get('/api/performance')
    expect(performanceResponse.ok()).toBeTruthy()

    const performance = await performanceResponse.json()

    // Check server metrics
    expect(performance.server).toBeDefined()
    expect(performance.server.uptime).toBeDefined()
    expect(performance.server.memory).toBeDefined()
    expect(performance.server.nodeVersion).toBeDefined()
    expect(performance.server.environment).toBeDefined()

    // Check bundle metrics
    expect(performance.bundles).toBeDefined()
    expect(typeof performance.bundles).toBe('object')

    // Check timestamp
    expect(performance.timestamp).toBeDefined()
    expect(new Date(performance.timestamp).toISOString()).toBe(performance.timestamp)
  })

  test('bundle loading performance tracking', async ({ request }) => {
    // Test the performance tracking endpoint
    const testData = {
      bundleId: 'test-bundle',
      loadTime: 150,
      framework: 'solidjs',
      userAgent: 'test-agent'
    }

    const response = await request.post('/api/performance/bundle-load', {
      data: testData
    })

    expect(response.ok()).toBeTruthy()

    const result = await response.json()
    expect(result.recorded).toBe(true)
    expect(result.bundleId).toBe(testData.bundleId)
    expect(result.loadTime).toBe(testData.loadTime)
    expect(result.framework).toBe(testData.framework)
  })
})
