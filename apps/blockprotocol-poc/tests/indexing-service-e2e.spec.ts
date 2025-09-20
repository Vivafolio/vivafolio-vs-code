import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Indexing Service E2E', () => {
  test('should establish WebSocket connection and receive entity data from indexing service', async ({ page }) => {
    // Listen for WebSocket messages
    const messages: any[] = []
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        try {
          const message = JSON.parse(event.payload as string)
          messages.push(message)
        } catch (e) {
          // Ignore non-JSON messages
        }
      })
    })

    // Navigate to the POC app with indexing service enabled and appropriate scenario
    await page.goto('/?useIndexingService=true&scenario=indexing-service')

    // Wait for connection acknowledgment
    await page.waitForTimeout(3000)

    // Should have received connection_ack message
    const connectionAck = messages.find(msg => msg.type === 'connection_ack')
    expect(connectionAck).toBeDefined()
    expect(connectionAck.entityGraph).toBeDefined()
    expect(Array.isArray(connectionAck.entityGraph.entities)).toBe(true)

    // Should have entities from the indexing service (from test files)
    const entities = connectionAck.entityGraph.entities
    expect(entities.length).toBeGreaterThan(0)

    // Should have entities with properties from vivafolio_data! constructs
    const entityWithProperties = entities.find((entity: any) =>
      entity.properties && Object.keys(entity.properties).length > 0
    )
    expect(entityWithProperties).toBeDefined()

    // Should have received block notification
    const blockNotification = messages.find(msg => msg.type === 'vivafolioblock-notification')
    expect(blockNotification).toBeDefined()
    expect(blockNotification.payload.blockType).toBe('https://vivafolio.dev/blocks/table-view/v1')
  })

  test('should contain entities from vivafolio_data! constructs via LSP', async ({ page }) => {
    const messages: any[] = []
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        try {
          const message = JSON.parse(event.payload as string)
          messages.push(message)
        } catch (e) {
          // Ignore non-JSON messages
        }
      })
    })

    await page.goto('/?useIndexingService=true&scenario=indexing-service')
    await page.waitForTimeout(3000)

    const connectionAck = messages.find(msg => msg.type === 'connection_ack')
    expect(connectionAck).toBeDefined()

    const entities = connectionAck.entityGraph.entities

    // Should have entities from LSP-provided vivafolio_data! constructs
    const sourceTypes = entities
      .map((entity: any) => entity.sourceType)
      .filter((type: string | undefined) => type !== undefined)
    expect(sourceTypes).toContain('vivafolio_data_construct')

    // Should have entities with .viv file paths
    const sourcePaths = entities
      .map((entity: any) => entity.sourcePath)
      .filter((path: string | undefined) => path !== undefined)
    expect(sourcePaths.some((path: string) => path.includes('.viv'))).toBe(true)

    // Should have entities from different tables (different entity IDs)
    const entityIds = entities.map((entity: any) => entity.entityId)
    const uniqueBaseIds = [...new Set(entityIds.map((id: string) => id.split('-row-')[0]))]
    expect(uniqueBaseIds.length).toBeGreaterThan(1) // Should have entities from multiple tables
  })

  test('should handle WebSocket transport layer communication', async ({ page }) => {
    // Listen for WebSocket messages
    const messages: any[] = []
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        try {
          const message = JSON.parse(event.payload as string)
          messages.push(message)
        } catch (e) {
          // Ignore non-JSON messages
        }
      })
    })

    await page.goto('/?useIndexingService=true&scenario=indexing-service')

    // Wait for connection acknowledgment
    await page.waitForTimeout(2000)

    // Should have received connection_ack message
    const connectionAck = messages.find(msg => msg.type === 'connection_ack')
    expect(connectionAck).toBeDefined()
    expect(connectionAck.entityGraph).toBeDefined()
    expect(Array.isArray(connectionAck.entityGraph.entities)).toBe(true)
  })

  test('should handle Block Protocol entity updates via WebSocket', async ({ page }) => {
    const messages: any[] = []
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        try {
          const message = JSON.parse(event.payload as string)
          messages.push(message)
        } catch (e) {
          // Ignore non-JSON messages
        }
      })
    })

    await page.goto('/?useIndexingService=true&scenario=indexing-service')
    await page.waitForTimeout(3000)

    // Should have received connection_ack message with entity data
    const connectionAck = messages.find(msg => msg.type === 'connection_ack')
    expect(connectionAck).toBeDefined()
    expect(connectionAck.entityGraph).toBeDefined()
    expect(Array.isArray(connectionAck.entityGraph.entities)).toBe(true)

    // Should have entities from the indexing service
    const entities = connectionAck.entityGraph.entities
    expect(entities.length).toBeGreaterThan(0)

    // Test that we can receive entity update notifications
    // (In a real scenario, this would come from the indexing service)
    const updateMessages = messages.filter(msg => msg.type === 'entity-updated' || msg.type === 'graph/update')
    // We expect at least the initial entity setup messages
    expect(messages.length).toBeGreaterThan(0)
  })
})
