import { test } from 'node:test'
import assert from 'node:assert/strict'

import { startServer } from '../src/server.ts'

test('dev server exposes health endpoint', async (t) => {
  const server = await startServer({
    port: 0,
    attachSignalHandlers: false,
    enableVite: false
  })

  t.after(async () => {
    await server.close()
  })

  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object', 'server should have an address')

  const origin = `http://127.0.0.1:${address.port}`
  const response = await fetch(`${origin}/healthz`)
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
})
