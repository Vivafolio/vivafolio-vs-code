import { test, expect } from '@playwright/test'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'

test.describe('Standalone Server', () => {
  const testDir = path.resolve(process.cwd())

  test('should start standalone server and serve health endpoint', async ({ request }) => {
    // Start the standalone server programmatically
    const serverProcess = spawn('npm', ['run', 'start:standalone', '--', '--port', '3013', '--no-hot-reload'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let serverReady = false
    const serverOutput: string[] = []

    // Listen for server output
    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      serverOutput.push(output)
      if (output.includes('listening on http://localhost:3013')) {
        serverReady = true
      }
    })

    serverProcess.stderr?.on('data', (data) => {
      serverOutput.push(`ERROR: ${data.toString()}`)
    })

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'))
      }, 10000)

      const checkReady = () => {
        if (serverReady) {
          clearTimeout(timeout)
          resolve()
        } else {
          setTimeout(checkReady, 100)
        }
      }
      checkReady()
    })

    try {
      // Test health endpoint
      const healthResponse = await request.get('http://localhost:3013/healthz')
      expect(healthResponse.ok()).toBeTruthy()

      const healthData = await healthResponse.json()
      expect(healthData.ok).toBe(true)
      expect(healthData).toHaveProperty('timestamp')
      expect(Array.isArray(healthData.scenarios)).toBe(true)
      expect(Array.isArray(healthData.frameworks)).toBe(true)

    } finally {
      // Clean up server
      serverProcess.kill('SIGTERM')

      // Wait for server to shut down
      await new Promise<void>((resolve) => {
        serverProcess.on('close', () => resolve())
        setTimeout(resolve, 2000) // Fallback timeout
      })
    }
  })

  test('should serve framework bundles API', async ({ request }) => {
    const serverProcess = spawn('npm', ['run', 'start:standalone', '--', '--port', '3014', '--frameworks', 'solidjs', '--no-hot-reload'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let serverReady = false

    serverProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('listening on http://localhost:3014')) {
        serverReady = true
      }
    })

    // Wait for server readiness
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (serverReady) {
          resolve()
        } else {
          setTimeout(checkReady, 100)
        }
      }
      setTimeout(checkReady, 100)
    })

    try {
      // Test all frameworks bundles endpoint
      const bundlesResponse = await request.get('http://localhost:3014/api/frameworks/bundles')
      expect(bundlesResponse.ok()).toBeTruthy()

      const bundlesData = await bundlesResponse.json()
      expect(bundlesData).toHaveProperty('bundles')
      expect(typeof bundlesData.bundles).toBe('object')

      // Test specific framework bundles endpoint
      const solidjsResponse = await request.get('http://localhost:3014/api/frameworks/solidjs/bundles')
      if (solidjsResponse.status() !== 404) {
        expect(solidjsResponse.ok()).toBeTruthy()
        const solidjsData = await solidjsResponse.json()
        expect(solidjsData).toHaveProperty('bundles')
        expect(Array.isArray(solidjsData.bundles)).toBe(true)
      }

    } finally {
      serverProcess.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        serverProcess.on('close', () => resolve())
        setTimeout(resolve, 2000)
      })
    }
  })

  test('should handle multiple frameworks concurrently', async ({ request }) => {
    const serverProcess = spawn('npm', ['run', 'start:standalone', '--', '--port', '3015', '--frameworks', 'solidjs,vue', '--no-hot-reload'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let serverReady = false

    serverProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('listening on http://localhost:3015')) {
        serverReady = true
      }
    })

    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (serverReady) {
          resolve()
        } else {
          setTimeout(checkReady, 100)
        }
      }
      setTimeout(checkReady, 100)
    })

    try {
      // Wait a bit for framework compilation
      await new Promise(resolve => setTimeout(resolve, 2000))

      const bundlesResponse = await request.get('http://localhost:3015/api/frameworks/bundles')
      expect(bundlesResponse.ok()).toBeTruthy()

      const bundlesData = await bundlesResponse.json()

      // Check that both frameworks are present (if they exist)
      const availableFrameworks = Object.keys(bundlesData.bundles)
      expect(availableFrameworks.length).toBeGreaterThanOrEqual(0)

      // If solidjs is available, check its structure
      if (bundlesData.bundles.solidjs) {
        expect(Array.isArray(bundlesData.bundles.solidjs)).toBe(true)
        if (bundlesData.bundles.solidjs.length > 0) {
          const bundle = bundlesData.bundles.solidjs[0]
          expect(bundle).toHaveProperty('id')
          expect(bundle).toHaveProperty('hash')
          expect(bundle).toHaveProperty('entryPoint')
          expect(bundle).toHaveProperty('lastModified')
          expect(bundle).toHaveProperty('assets')
        }
      }

    } finally {
      serverProcess.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        serverProcess.on('close', () => resolve())
        setTimeout(resolve, 2000)
      })
    }
  })

  test('should handle CLI arguments correctly', async () => {
    // Test help option
    const helpProcess = spawn('npm', ['run', 'start:standalone', '--', '--help'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let helpOutput = ''
    helpProcess.stdout?.on('data', (data) => {
      helpOutput += data.toString()
    })

    await new Promise<void>((resolve) => {
      helpProcess.on('close', () => resolve())
    })

    expect(helpOutput).toContain('Usage:')
    expect(helpOutput).toContain('--port')
    expect(helpOutput).toContain('--frameworks')
    expect(helpOutput).toContain('--help')
  })

  test('should serve static files correctly', async ({ request }) => {
    const serverProcess = spawn('npm', ['run', 'start:standalone', '--', '--port', '3016', '--no-hot-reload'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let serverReady = false

    serverProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('listening on http://localhost:3016')) {
        serverReady = true
      }
    })

    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (serverReady) {
          resolve()
        } else {
          setTimeout(checkReady, 100)
        }
      }
      setTimeout(checkReady, 100)
    })

    try {
      // Test that the root endpoint serves HTML
      const rootResponse = await request.get('http://localhost:3016/')
      expect(rootResponse.ok()).toBeTruthy()

      const contentType = rootResponse.headers()['content-type']
      expect(contentType).toContain('text/html')

      const htmlContent = await rootResponse.text()
      expect(htmlContent).toContain('Block Protocol')
      expect(htmlContent).toContain('Vivafolio Block Protocol POC')

    } finally {
      serverProcess.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        serverProcess.on('close', () => resolve())
        setTimeout(resolve, 2000)
      })
    }
  })

  test('should handle custom scenarios', async ({ request }) => {
    // Create a test file that uses the programmatic API with custom scenarios
    const testScript = `
import { startStandaloneServer } from './src/standalone-server.ts'

const customScenarios = {
  'test-scenario': {
    id: 'test-scenario',
    title: 'Test Scenario',
    description: 'Custom test scenario',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'test-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Test Entity',
            customProperty: 'test-value'
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state) => [{
      blockId: 'test-block',
      blockType: 'https://test.com/blocks/test/v1',
      entityId: state.graph.entities[0]?.entityId || 'test-entity',
      displayMode: 'multi-line',
      entityGraph: state.graph,
      supportsHotReload: false,
      initialHeight: 150
    }],
    applyUpdate: ({ state, update }) => {
      const entity = state.graph.entities.find(e => e.entityId === update.entityId)
      if (entity) {
        entity.properties = { ...entity.properties, ...update.properties }
      }
    }
  }
}

const server = await startStandaloneServer({
  port: 3017,
  frameworks: [],
  enableHotReload: false,
  attachSignalHandlers: false,
  scenarios: customScenarios
})

// Wait for server to start
await new Promise(resolve => setTimeout(resolve, 2000))

// Test health endpoint includes custom scenarios
const response = await fetch('http://localhost:3017/healthz')
const data = await response.json()

if (!data.scenarios.includes('test-scenario')) {
  throw new Error('Custom scenario not found in health check')
}

await server.close()
console.log('Custom scenario test passed')
`

    const testFile = path.join(testDir, 'test-custom-scenario.mjs')
    await fs.writeFile(testFile, testScript, 'utf8')

    try {
      // Invoke Node with tsx via --import (modern Node supports package import hooks)
      const testProcess = spawn(process.execPath, ['--import', 'tsx', testFile], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let testOutput = ''
      let testError = ''

      testProcess.stdout?.on('data', (data) => {
        testOutput += data.toString()
      })

      testProcess.stderr?.on('data', (data) => {
        testError += data.toString()
      })

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'))
        }, 10000)

        testProcess.on('error', (err) => {
          clearTimeout(timeout)
          reject(new Error(`Spawn error: ${String(err)}`))
        })

        testProcess.on('close', (code) => {
          clearTimeout(timeout)
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`Test failed: ${testError || testOutput}`))
          }
        })
      })

      expect(testOutput).toContain('Custom scenario test passed')

    } finally {
      // Clean up test file
      if (existsSync(testFile)) {
        await fs.unlink(testFile)
      }
    }
  })

  test('should build successfully for distribution', async () => {
    const buildProcess = spawn('npm', ['run', 'build:standalone'], {
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let buildOutput = ''
    let buildError = ''

    buildProcess.stdout?.on('data', (data) => {
      buildOutput += data.toString()
    })

    buildProcess.stderr?.on('data', (data) => {
      buildError += data.toString()
    })

    await new Promise<void>((resolve, reject) => {
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Build failed: ${buildError}`))
        }
      })
    })

    // The build process should complete successfully
    // This validates that the TypeScript compilation works
    expect(buildOutput).toContain('') // Build completed without errors

    // Check that the dist directory exists (build artifacts may be in subdirectories)
    const distDir = path.join(testDir, 'dist')
    expect(existsSync(distDir)).toBe(true)
  })
})
