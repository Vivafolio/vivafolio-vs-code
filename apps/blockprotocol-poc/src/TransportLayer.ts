import type { WebSocket } from 'ws'
import type { IndexingService } from '../../../packages/indexing-service/dist/IndexingService.js'

// Block Protocol message types
export interface BlockProtocolMessage {
  type: string
  payload: any
}

// Transport abstraction interface
export interface Transport {
  send(message: BlockProtocolMessage): void
  onMessage(handler: (message: BlockProtocolMessage) => void): void
  close(): void
}

// WebSocket-based transport for POC
export class WebSocketTransport implements Transport {
  constructor(private ws: WebSocket) { }

  send(message: BlockProtocolMessage): void {
    this.ws.send(JSON.stringify(message))
  }

  onMessage(handler: (message: BlockProtocolMessage) => void): void {
    this.ws.on('message', (raw) => {
      try {
        const message = JSON.parse(String(raw)) as BlockProtocolMessage
        handler(message)
      } catch (error) {
        console.error('WebSocket transport: Failed to parse message:', error)
      }
    })
  }

  close(): void {
    // WebSocket lifecycle managed externally
  }
}

// Transport layer that connects Block Protocol blocks to IndexingService
export class IndexingServiceTransportLayer {
  private transports: Map<string, Transport> = new Map()
  private indexingService: IndexingService
  private nextTransportId = 1

  constructor(indexingService: IndexingService) {
    this.indexingService = indexingService
  }

  // Register a transport for a block connection
  registerTransport(transport: Transport): string {
    const transportId = `transport-${this.nextTransportId++}`
    this.transports.set(transportId, transport)

    // Set up message handling
    transport.onMessage(async (message) => {
      await this.handleBlockProtocolMessage(message, transport)
    })

    return transportId
  }

  // Unregister a transport
  unregisterTransport(transportId: string): void {
    this.transports.delete(transportId)
  }

  // Handle Block Protocol messages from blocks
  private async handleBlockProtocolMessage(message: BlockProtocolMessage, transport: Transport): Promise<void> {
    try {
      switch (message.type) {
        case 'graph/update':
          await this.handleUpdateEntity(message.payload, transport)
          break

        case 'graph/create':
          await this.handleCreateEntity(message.payload, transport)
          break

        case 'graph/delete':
          await this.handleDeleteEntity(message.payload, transport)
          break

        case 'graph/query':
          await this.handleQueryEntities(message.payload, transport)
          break

        default:
          console.log(`IndexingServiceTransportLayer: Unknown message type: ${message.type}`)
      }
    } catch (error) {
      console.error('IndexingServiceTransportLayer: Error handling message:', error)
      // Send error response
      transport.send({
        type: 'error',
        payload: {
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      })
    }
  }

  // Handle updateEntity messages
  private async handleUpdateEntity(payload: any, transport: Transport): Promise<void> {
    const { entityId, properties } = payload

    if (!entityId || !properties) {
      throw new Error('Invalid updateEntity payload: missing entityId or properties')
    }

    console.log(`IndexingServiceTransportLayer: Updating entity ${entityId}`)

    const success = await this.indexingService.updateEntity(entityId, properties)

    // Send acknowledgment
    transport.send({
      type: 'graph/ack',
      payload: {
        operation: 'updateEntity',
        entityId,
        success,
        timestamp: new Date().toISOString()
      }
    })

    if (success) {
      // Broadcast entity update to all connected blocks
      this.broadcastEntityUpdate(entityId)
    }
  }

  // Handle createEntity messages
  private async handleCreateEntity(payload: any, transport: Transport): Promise<void> {
    const { entityId, properties, sourceMetadata } = payload

    if (!entityId || !properties || !sourceMetadata) {
      throw new Error('Invalid createEntity payload: missing entityId, properties, or sourceMetadata')
    }

    console.log(`IndexingServiceTransportLayer: Creating entity ${entityId}`)

    const success = await this.indexingService.createEntity(entityId, properties, sourceMetadata)

    // Send acknowledgment
    transport.send({
      type: 'graph/ack',
      payload: {
        operation: 'createEntity',
        entityId,
        success,
        timestamp: new Date().toISOString()
      }
    })

    if (success) {
      // Broadcast entity creation to all connected blocks
      this.broadcastEntityUpdate(entityId)
    }
  }

  // Handle deleteEntity messages
  private async handleDeleteEntity(payload: any, transport: Transport): Promise<void> {
    const { entityId } = payload

    if (!entityId) {
      throw new Error('Invalid deleteEntity payload: missing entityId')
    }

    console.log(`IndexingServiceTransportLayer: Deleting entity ${entityId}`)

    const success = await this.indexingService.deleteEntity(entityId)

    // Send acknowledgment
    transport.send({
      type: 'graph/ack',
      payload: {
        operation: 'deleteEntity',
        entityId,
        success,
        timestamp: new Date().toISOString()
      }
    })

    if (success) {
      // Broadcast entity deletion to all connected blocks
      this.broadcastEntityDeletion(entityId)
    }
  }

  // Handle queryEntities messages
  private async handleQueryEntities(payload: any, transport: Transport): Promise<void> {
    const { query } = payload

    console.log(`IndexingServiceTransportLayer: Querying entities`)

    // Get all entities (simple implementation - could be enhanced with filtering)
    const allEntities = this.indexingService.getAllEntities()
    const entities = allEntities.map((entity: any) => ({
      entityId: entity.entityId,
      entityTypeId: entity.entityTypeId,
      editionId: entity.editionId,
      sourcePath: entity.sourcePath,
      sourceType: entity.sourceType,
      properties: entity.properties,
    }))

    // Send query response
    transport.send({
      type: 'graph/query-response',
      payload: {
        entities,
        query: query || {},
        timestamp: new Date().toISOString()
      }
    })
  }

  // Broadcast entity updates to all connected blocks
  private broadcastEntityUpdate(entityId: string): void {
    const metadata = this.indexingService.getEntityMetadata(entityId)
    if (!metadata) return

    const updateMessage: BlockProtocolMessage = {
      type: 'entity-updated',
      payload: {
        entityId,
        properties: metadata.properties,
        sourceType: metadata.sourceType,
        timestamp: new Date().toISOString()
      }
    }

    for (const transport of this.transports.values()) {
      try {
        transport.send(updateMessage)
      } catch (error) {
        console.error('IndexingServiceTransportLayer: Failed to broadcast to transport:', error)
      }
    }
  }

  // Broadcast entity deletions to all connected blocks
  private broadcastEntityDeletion(entityId: string): void {
    const deleteMessage: BlockProtocolMessage = {
      type: 'entity-deleted',
      payload: {
        entityId,
        timestamp: new Date().toISOString()
      }
    }

    for (const transport of this.transports.values()) {
      try {
        transport.send(deleteMessage)
      } catch (error) {
        console.error('IndexingServiceTransportLayer: Failed to broadcast to transport:', error)
      }
    }
  }

  // Get the number of active transports
  getActiveTransportCount(): number {
    return this.transports.size
  }
}
