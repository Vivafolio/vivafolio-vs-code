import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

import { startServer } from '../src/server.ts'

// Integration flow:
// 1) Start the POC + block server with a temp cache dir
// 2) Open a WS on the status-pill scenario to populate the cache
// 3) Confirm cache files exist
// 4) Listen for cache:invalidate, trigger one via the block server, and assert eviction
// 5) Re-open the scenario to repopulate the cache

test('block resources are cached via BlockResourcesCache', async (t) => {
  const originalCacheDir = process.env.BLOCK_CACHE_DIR
  const tempCacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'block-cache-'))
  process.env.BLOCK_CACHE_DIR = tempCacheDir

  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    blockServerPort: 5015,
    attachSignalHandlers: false,
    enableVite: false
  })

  t.after(async () => {
    process.env.BLOCK_CACHE_DIR = originalCacheDir
    await server.close()
    await fs.rm(tempCacheDir, { recursive: true, force: true })
  })

  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object', 'server should expose an address')
  const origin = `http://127.0.0.1:${address.port}`

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`${origin.replace('http', 'ws')}/ws?scenario=status-pill-example`)

    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('Timed out waiting for vivafolioblock-notification'))
    }, 10_000)

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw))
        if (msg?.type === 'vivafolioblock-notification') {
          clearTimeout(timeout)
          socket.close()
          resolve()
        }
      } catch {
        // ignore malformed messages
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  const cacheFiles = await fs.readdir(tempCacheDir)
  assert.ok(cacheFiles.length > 0, 'cache directory should contain persisted block entries')

  // Listen for cache:invalidate broadcasts from the POC server
  let invalidationReceived = false
  const clientListener = new WebSocket(`${origin.replace('http', 'ws')}/ws`)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Listener WS did not open')), 5000)
    clientListener.on('open', () => {
      clearTimeout(timeout)
      resolve()
    })
    clientListener.on('error', reject)
  })
  const invalidatePromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for cache:invalidate')), 10_000)
    clientListener.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw))
        if (msg?.type === 'cache:invalidate') {
          invalidationReceived = true
          clearTimeout(timeout)
          resolve()
        }
      } catch {
        // ignore malformed messages
      }
    })
    clientListener.on('error', reject)
  })

  // Trigger invalidation via the block server bridge (ensure the bridge had time to connect)
  await new Promise((resolve) => setTimeout(resolve, 200))
  await (server.blockServer as any)?.notifyClients?.({
    type: 'cache:invalidate',
    payload: { blockId: 'status-pill' }
  })

  await invalidatePromise
  clientListener.close()

  const afterInvalidateFiles = await fs.readdir(tempCacheDir)
  assert.ok(afterInvalidateFiles.length < cacheFiles.length, 'cache should shrink after eviction')

  // Re-request scenario to repopulate cache
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`${origin.replace('http', 'ws')}/ws?scenario=status-pill-example`)
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('Timed out waiting for repopulation notification'))
    }, 10_000)

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw))
        if (msg?.type === 'vivafolioblock-notification') {
          clearTimeout(timeout)
          socket.close()
          resolve()
        }
      } catch {
        // ignore malformed messages
      }
    })
    socket.on('error', reject)
  })

  const finalCacheFiles = await fs.readdir(tempCacheDir)
  assert.ok(finalCacheFiles.length > afterInvalidateFiles.length, 'cache should repopulate after reload')
})
