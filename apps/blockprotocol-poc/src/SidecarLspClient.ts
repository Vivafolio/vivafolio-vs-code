import type { IndexingService } from '../../../packages/indexing-service/dist/IndexingService.js'
import type { FileChangeEvent, EntityUpdateEvent, EntityCreateEvent, EntityDeleteEvent } from '../../../packages/indexing-service/dist/IndexingService.js'

// Mock LSP server interface (simplified for POC)
interface MockLspServer {
  notifyFileChange(filePath: string, changeType: 'create' | 'update' | 'delete'): Promise<void>
  notifyBlockDiscovery(blocks: any[]): Promise<void>
  onVivafolioBlockNotification(callback: (notification: any) => void): void
  scanVivFiles(): Promise<any[]>
}

// Sidecar LSP client that coordinates between indexing service and LSP server
export class SidecarLspClient {
  private indexingService: IndexingService
  private lspServer: MockLspServer
  private eventListenerIds: string[] = []

  constructor(indexingService: IndexingService, lspServer: MockLspServer) {
    this.indexingService = indexingService
    this.lspServer = lspServer
  }

  // Start the sidecar client
  async start(): Promise<void> {
    console.log('[sidecar-lsp] Starting sidecar LSP client...')

    // Subscribe to indexing service events
    this.subscribeToIndexingEvents()

    // Subscribe to LSP server VivafolioBlock notifications
    this.subscribeToLspNotifications()

    // Initial scan of .viv files
    await this.initialVivFileScan()

    console.log('[sidecar-lsp] Sidecar LSP client started')
  }

  // Stop the sidecar client
  async stop(): Promise<void> {
    console.log('[sidecar-lsp] Stopping sidecar LSP client...')

    // Unsubscribe from all events
    for (const listenerId of this.eventListenerIds) {
      this.indexingService.off('file-changed', listenerId)
      this.indexingService.off('entity-updated', listenerId)
      this.indexingService.off('entity-created', listenerId)
      this.indexingService.off('entity-deleted', listenerId)
    }
    this.eventListenerIds = []

    console.log('[sidecar-lsp] Sidecar LSP client stopped')
  }

  // Subscribe to LSP server VivafolioBlock notifications
  private subscribeToLspNotifications(): void {
    this.lspServer.onVivafolioBlockNotification(async (notification) => {
      console.log('[sidecar-lsp] Received VivafolioBlock notification from LSP server:', notification)
      try {
        await this.indexingService.handleVivafolioBlockNotification(notification)
      } catch (error) {
        console.error('[sidecar-lsp] Error handling VivafolioBlock notification:', error)
      }
    })
  }

  // Perform initial scan of .viv files
  private async initialVivFileScan(): Promise<void> {
    try {
      console.log('[sidecar-lsp] Performing initial scan of .viv files...')
      const vivBlocks = await this.lspServer.scanVivFiles()
      console.log(`[sidecar-lsp] Found ${vivBlocks.length} VivafolioBlock notifications from initial scan`)

      for (const block of vivBlocks) {
        await this.indexingService.handleVivafolioBlockNotification(block)
      }
    } catch (error) {
      console.error('[sidecar-lsp] Error during initial .viv file scan:', error)
    }
  }

  // Subscribe to indexing service events
  private subscribeToIndexingEvents(): void {
    // Handle file changes
    const fileChangeId = this.indexingService.on('file-changed', async (event: FileChangeEvent) => {
      console.log(`[sidecar-lsp] File changed: ${event.filePath} (${event.eventType})`)

      try {
        // Notify LSP server about file change
        await this.lspServer.notifyFileChange(event.filePath, this.mapEventType(event.eventType))

        // If this is a file with vivafolio_data! constructs, trigger block discovery
        if (event.sourceType === 'vivafolio_data_construct') {
          await this.handleBlockDiscovery(event)
        }
      } catch (error) {
        console.error(`[sidecar-lsp] Error handling file change for ${event.filePath}:`, error)
      }
    })
    this.eventListenerIds.push(fileChangeId)

    // Handle entity updates
    const entityUpdateId = this.indexingService.on('entity-updated', async (event: EntityUpdateEvent) => {
      console.log(`[sidecar-lsp] Entity updated: ${event.entityId}`)

      // If this entity comes from a vivafolio_data! construct, we might need to update LSP state
      if (event.sourceType === 'vivafolio_data_construct') {
        await this.handleEntityChange(event.sourcePath)
      }
    })
    this.eventListenerIds.push(entityUpdateId)

    // Handle entity creation
    const entityCreateId = this.indexingService.on('entity-created', async (event: EntityCreateEvent) => {
      console.log(`[sidecar-lsp] Entity created: ${event.entityId}`)

      if (event.sourceType === 'vivafolio_data_construct') {
        await this.handleEntityChange(event.sourcePath)
      }
    })
    this.eventListenerIds.push(entityCreateId)

    // Handle entity deletion
    const entityDeleteId = this.indexingService.on('entity-deleted', async (event: EntityDeleteEvent) => {
      console.log(`[sidecar-lsp] Entity deleted: ${event.entityId}`)

      if (event.sourceType === 'vivafolio_data_construct') {
        await this.handleEntityChange(event.sourcePath)
      }
    })
    this.eventListenerIds.push(entityDeleteId)
  }

  // Map indexing service event types to LSP change types
  private mapEventType(eventType: 'add' | 'change' | 'unlink'): 'create' | 'update' | 'delete' {
    switch (eventType) {
      case 'add': return 'create'
      case 'change': return 'update'
      case 'unlink': return 'delete'
      default: return 'update'
    }
  }

  // Handle block discovery for files with vivafolio_data! constructs
  private async handleBlockDiscovery(event: FileChangeEvent): Promise<void> {
    try {
      // Get all entities from this file to create block notifications
      const allEntities = this.indexingService.getAllEntities()
      const fileEntities = allEntities.filter((entity: any) => entity.sourcePath === event.filePath)

      if (fileEntities.length > 0) {
        // Create VivafolioBlock notifications for entities with DSL modules
        const blocks = fileEntities
          .filter((entity: any) => entity.dslModule)
          .map((entity: any) => ({
            blockType: 'table-view-block',
            entityId: entity.entityId,
            properties: entity.properties,
            dslModule: entity.dslModule,
            sourcePath: entity.sourcePath,
            sourceType: entity.sourceType
          }))

        if (blocks.length > 0) {
          await this.lspServer.notifyBlockDiscovery(blocks)
          console.log(`[sidecar-lsp] Notified LSP server of ${blocks.length} blocks from ${event.filePath}`)
        }
      }
    } catch (error) {
      console.error(`[sidecar-lsp] Error in block discovery for ${event.filePath}:`, error)
    }
  }

  // Handle entity changes that might affect LSP diagnostics
  private async handleEntityChange(sourcePath: string): Promise<void> {
    try {
      // Notify LSP server that the file has changed due to entity modifications
      await this.lspServer.notifyFileChange(sourcePath, 'update')

      // Re-trigger block discovery for this file
      const mockFileChangeEvent: FileChangeEvent = {
        filePath: sourcePath,
        eventType: 'change',
        timestamp: new Date(),
        affectedEntities: [],
        sourceType: 'vivafolio_data_construct'
      }
      await this.handleBlockDiscovery(mockFileChangeEvent)
    } catch (error) {
      console.error(`[sidecar-lsp] Error handling entity change for ${sourcePath}:`, error)
    }
  }
}

// Mock LSP server implementation for POC
export class MockLspServerImpl implements MockLspServer {
  private blocks: Map<string, any> = new Map()
  private vivafolioBlockCallbacks: Array<(notification: any) => void> = []

  async notifyFileChange(filePath: string, changeType: 'create' | 'update' | 'delete'): Promise<void> {
    console.log(`[mock-lsp] File ${changeType}: ${filePath}`)

    // In a real implementation, this would:
    // 1. Re-analyze the file
    // 2. Update internal state
    // 3. Send diagnostics to the editor
    // 4. Notify about any block changes

    // For POC, just log the change
    if (changeType === 'delete') {
      // Remove blocks associated with this file
      for (const [blockId, block] of this.blocks) {
        if (block.sourcePath === filePath) {
          this.blocks.delete(blockId)
        }
      }
    }
  }

  async notifyBlockDiscovery(blocks: any[]): Promise<void> {
    console.log(`[mock-lsp] Block discovery: ${blocks.length} blocks`)

    // Store blocks in memory
    for (const block of blocks) {
      this.blocks.set(block.entityId, block)
    }

    // In a real implementation, this would send block notifications to the editor
    console.log(`[mock-lsp] Stored ${blocks.length} blocks in memory`)
  }

  // Subscribe to VivafolioBlock notifications
  onVivafolioBlockNotification(callback: (notification: any) => void): void {
    this.vivafolioBlockCallbacks.push(callback)
  }

  // Simulate scanning .viv files and extracting vivafolio_data! constructs
  async scanVivFiles(): Promise<any[]> {
    console.log(`[mock-lsp] Scanning .viv files for vivafolio_data! constructs...`)

    // For POC, we'll simulate finding some .viv files with vivafolio_data! constructs
    // In a real implementation, this would scan the file system for .viv files
    const mockVivBlocks = [
      {
        entityId: 'project_tasks',
        sourcePath: '/mock/path/to/tasks.viv',
        tableData: {
          headers: ['Task Name', 'Assignee', 'Status', 'Priority', 'Due Date'],
          rows: [
            ['Implement authentication', 'Alice', 'In Progress', 'High', '2025-09-20'],
            ['Design database schema', 'Bob', 'Completed', 'Medium', '2025-09-15'],
            ['Write API documentation', 'Charlie', 'Not Started', 'Low', '2025-09-25']
          ]
        },
        dslModule: {
          operations: {
            updateEntity: { handler: 'tableUpdateHandler', params: {} },
            createEntity: { handler: 'tableCreateHandler', params: {} },
            deleteEntity: { handler: 'tableDeleteHandler', params: {} }
          },
          source: { type: 'vivafolio_data_construct' }
        }
      },
      {
        entityId: 'team_members',
        sourcePath: '/mock/path/to/team.viv',
        tableData: {
          headers: ['Name', 'Role', 'Department', 'Start Date'],
          rows: [
            ['Alice', 'Senior Developer', 'Engineering', '2023-01-15'],
            ['Bob', 'Database Administrator', 'Engineering', '2022-08-20'],
            ['Charlie', 'Technical Writer', 'Documentation', '2024-03-10']
          ]
        },
        dslModule: {
          operations: {
            updateEntity: { handler: 'tableUpdateHandler', params: {} },
            createEntity: { handler: 'tableCreateHandler', params: {} },
            deleteEntity: { handler: 'tableDeleteHandler', params: {} }
          },
          source: { type: 'vivafolio_data_construct' }
        }
      }
    ]

    // Notify all subscribers about the discovered blocks
    for (const block of mockVivBlocks) {
      for (const callback of this.vivafolioBlockCallbacks) {
        try {
          callback(block)
        } catch (error) {
          console.error('[mock-lsp] Error in VivafolioBlock notification callback:', error)
        }
      }
    }

    console.log(`[mock-lsp] Found ${mockVivBlocks.length} vivafolio_data! constructs in .viv files`)
    return mockVivBlocks
  }

  // Get all discovered blocks
  getBlocks(): any[] {
    return Array.from(this.blocks.values())
  }

  // Get blocks for a specific file
  getBlocksForFile(filePath: string): any[] {
    return Array.from(this.blocks.values()).filter(block => block.sourcePath === filePath)
  }
}
