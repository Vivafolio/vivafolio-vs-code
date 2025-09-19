import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar from 'chokidar';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { EditingModule, DSLModule, EditResult, EditContext } from './EditingModule';
import { DSLModuleExecutor } from './DSLModuleExecutor';
import { CSVEditingModule, MarkdownEditingModule } from './FileEditingModule';
import { EventEmitter } from './EventEmitter';

// Entity metadata stored by the indexing service
export interface EntityMetadata {
  entityId: string;
  sourcePath: string;
  sourceType: string;
  dslModule?: DSLModule;
  properties: Record<string, any>;
  lastModified: Date;
}

// Configuration for the indexing service
export interface IndexingServiceConfig {
  watchPaths: string[];
  supportedExtensions: string[];
  excludePatterns: string[];
}

// Enhanced event types emitted by the indexing service
export interface IndexingEvents {
  'file-changed': (payload: FileChangeEvent) => void;
  'entity-updated': (payload: EntityUpdateEvent) => void;
  'entity-created': (payload: EntityCreateEvent) => void;
  'entity-deleted': (payload: EntityDeleteEvent) => void;
  'batch-operation': (payload: BatchOperationEvent) => void;
}

// Event payload interfaces
export interface FileChangeEvent {
  filePath: string;
  eventType: 'add' | 'change' | 'unlink';
  timestamp: Date;
  affectedEntities: string[];
  sourceType: string;
}

export interface EntityUpdateEvent {
  entityId: string;
  properties: Record<string, any>;
  previousProperties?: Record<string, any>;
  timestamp: Date;
  sourcePath: string;
  sourceType: string;
  operationType: 'update';
}

export interface EntityCreateEvent {
  entityId: string;
  properties: Record<string, any>;
  timestamp: Date;
  sourcePath: string;
  sourceType: string;
  operationType: 'create';
}

export interface EntityDeleteEvent {
  entityId: string;
  previousProperties?: Record<string, any>;
  timestamp: Date;
  sourcePath: string;
  sourceType: string;
  operationType: 'delete';
}

export interface BatchOperationEvent {
  operations: Array<EntityUpdateEvent | EntityCreateEvent | EntityDeleteEvent>;
  timestamp: Date;
  sourcePath?: string;
  operationType: 'batch';
}

export class IndexingService {
  private config: IndexingServiceConfig;
  private editingModules: EditingModule[] = [];
  private entityMetadata: Map<string, EntityMetadata> = new Map();
  private watcher?: chokidar.FSWatcher;
  private eventEmitter: EventEmitter;

  constructor(config: IndexingServiceConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter({
      maxListeners: 50, // Allow more listeners for complex integrations
      asyncDelivery: true, // Enable async delivery for better performance
      errorHandler: (error, eventName, listener) => {
        console.error(`IndexingService: Error in event listener for '${eventName}' (listener: ${listener.id}):`, error);
      }
    });
    this.initializeEditingModules();
  }

  private initializeEditingModules(): void {
    // Register built-in editing modules
    this.editingModules.push(new DSLModuleExecutor());
    this.editingModules.push(new CSVEditingModule());
    this.editingModules.push(new MarkdownEditingModule());
  }

  // Get source type from file extension
  private getSourceTypeFromExtension(ext: string): string {
    switch (ext) {
      case '.csv': return 'csv';
      case '.md': return 'markdown';
      case '.rs': case '.js': case '.ts': case '.py': case '.java': return 'vivafolio_data_construct';
      default: return 'unknown';
    }
  }

  // Register a custom editing module
  registerEditingModule(module: EditingModule): void {
    this.editingModules.push(module);
  }

  // Start the indexing service
  async start(): Promise<void> {
    console.log('IndexingService: Starting indexing service...');

    // Initial scan
    await this.scanFiles();

    // Start file watching
    this.startWatching();

    console.log('IndexingService: Indexing service started');
  }

  // Stop the indexing service
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
    console.log('IndexingService: Indexing service stopped');
  }

  // Scan files for entities
  private async scanFiles(): Promise<void> {
    console.log('IndexingService: Scanning files...');

    for (const watchPath of this.config.watchPaths) {
      const patterns = this.config.supportedExtensions.map(ext => `${watchPath}/**/*.${ext}`);

      for (const pattern of patterns) {
        const files = await fg(pattern, {
          ignore: this.config.excludePatterns,
          absolute: true
        });

        for (const file of files) {
          await this.processFile(file, 'add');
        }
      }
    }

    console.log(`IndexingService: Scanned ${this.entityMetadata.size} entities`);
  }

  // Start file watching
  private startWatching(): void {
    this.watcher = chokidar.watch(this.config.watchPaths, {
      ignored: this.config.excludePatterns,
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('add', (filePath) => this.handleFileChange(filePath, 'add'));
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath, 'change'));
    this.watcher.on('unlink', (filePath) => this.handleFileChange(filePath, 'unlink'));
  }

  // Handle file changes
  private async handleFileChange(filePath: string, eventType: 'add' | 'change' | 'unlink'): Promise<void> {
    console.log(`IndexingService: File ${eventType}: ${filePath}`);

    const affectedEntities: string[] = [];
    const ext = path.extname(filePath).toLowerCase();
    const sourceType = this.getSourceTypeFromExtension(ext);

    if (eventType === 'unlink') {
      // Remove entities from this file
      for (const [entityId, metadata] of this.entityMetadata) {
        if (metadata.sourcePath === filePath) {
          affectedEntities.push(entityId);
          const previousProperties = { ...metadata.properties };
          this.entityMetadata.delete(entityId);

          await this.eventEmitter.emit('entity-deleted', {
            entityId,
            previousProperties,
            timestamp: new Date(),
            sourcePath: filePath,
            sourceType: metadata.sourceType,
            operationType: 'delete'
          });
        }
      }
    } else {
      await this.processFile(filePath, eventType);

      // Collect affected entities for this file
      for (const [entityId, metadata] of this.entityMetadata) {
        if (metadata.sourcePath === filePath) {
          affectedEntities.push(entityId);
        }
      }
    }

    // Emit enhanced file-changed event
    await this.eventEmitter.emit('file-changed', {
      filePath,
      eventType,
      timestamp: new Date(),
      affectedEntities,
      sourceType
    });
  }

  // Process a file to extract entities
  private async processFile(filePath: string, eventType: 'add' | 'change'): Promise<void> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.csv') {
        await this.processCSVFile(filePath);
      } else if (ext === '.md') {
        await this.processMarkdownFile(filePath);
      }
      // Note: Source files with vivafolio_data!() constructs are handled via LSP notifications
    } catch (error) {
      console.error(`IndexingService: Error processing file ${filePath}:`, error);
    }
  }

  // Process CSV files
  private async processCSVFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) return;

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
      const entityId = `${path.basename(filePath, '.csv')}-row-${i - 1}`;

      const properties: Record<string, any> = {};
      headers.forEach((header, idx) => {
        properties[header] = cells[idx] || '';
      });

      const metadata: EntityMetadata = {
        entityId,
        sourcePath: filePath,
        sourceType: 'csv',
        properties,
        lastModified: new Date()
      };

      this.entityMetadata.set(entityId, metadata);
    }
  }

  // Process Markdown files with frontmatter
  private async processMarkdownFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(content);

    if (Object.keys(parsed.data).length > 0) {
      const entityId = path.basename(filePath, '.md');
      const metadata: EntityMetadata = {
        entityId,
        sourcePath: filePath,
        sourceType: 'markdown',
        properties: parsed.data,
        lastModified: new Date()
      };

      this.entityMetadata.set(entityId, metadata);
    }
  }

  // Note: vivafolio_data!() constructs are handled via VivafolioBlock notifications from LSP server
  // This method is kept for potential future use but not called in current scanning

  // Handle Block Protocol updateEntity messages
  async updateEntity(entityId: string, properties: Record<string, any>): Promise<boolean> {
    const metadata = this.entityMetadata.get(entityId);
    if (!metadata) {
      console.error(`IndexingService: Entity ${entityId} not found`);
      return false;
    }

    // Find the appropriate editing module
    const editingModule = this.editingModules.find(module =>
      module.canHandle(metadata.sourceType, metadata)
    );

    if (!editingModule) {
      console.error(`IndexingService: No editing module found for ${metadata.sourceType}`);
      return false;
    }

    const success = await editingModule.updateEntity(entityId, properties, metadata);
    if (success) {
      // Store previous properties for event
      const previousProperties = { ...metadata.properties };

      // Update our metadata
      metadata.properties = { ...metadata.properties, ...properties };
      metadata.lastModified = new Date();

      // Emit enhanced entity-updated event
      await this.eventEmitter.emit('entity-updated', {
        entityId,
        properties: metadata.properties,
        previousProperties,
        timestamp: new Date(),
        sourcePath: metadata.sourcePath,
        sourceType: metadata.sourceType,
        operationType: 'update'
      });
    }

    return success;
  }

  // Handle Block Protocol createEntity messages
  async createEntity(entityId: string, properties: Record<string, any>, sourceMetadata: any): Promise<boolean> {
    // Find the appropriate editing module
    const editingModule = this.editingModules.find(module =>
      module.canHandle(sourceMetadata.sourceType, sourceMetadata)
    );

    if (!editingModule) {
      console.error(`IndexingService: No editing module found for ${sourceMetadata.sourceType}`);
      return false;
    }

    const success = await editingModule.createEntity(entityId, properties, sourceMetadata);
    if (success) {
      // Add to our metadata
      const metadata: EntityMetadata = {
        entityId,
        sourcePath: sourceMetadata.sourcePath,
        sourceType: sourceMetadata.sourceType,
        dslModule: sourceMetadata.dslModule,
        properties,
        lastModified: new Date()
      };

      this.entityMetadata.set(entityId, metadata);

      // Emit enhanced entity-created event
      await this.eventEmitter.emit('entity-created', {
        entityId,
        properties,
        timestamp: new Date(),
        sourcePath: sourceMetadata.sourcePath,
        sourceType: sourceMetadata.sourceType,
        operationType: 'create'
      });
    }

    return success;
  }

  // Handle Block Protocol deleteEntity messages
  async deleteEntity(entityId: string): Promise<boolean> {
    const metadata = this.entityMetadata.get(entityId);
    if (!metadata) {
      console.error(`IndexingService: Entity ${entityId} not found`);
      return false;
    }

    // Find the appropriate editing module
    const editingModule = this.editingModules.find(module =>
      module.canHandle(metadata.sourceType, metadata)
    );

    if (!editingModule) {
      console.error(`IndexingService: No editing module found for ${metadata.sourceType}`);
      return false;
    }

    const success = await editingModule.deleteEntity(entityId, metadata);
    if (success) {
      const previousProperties = { ...metadata.properties };
      this.entityMetadata.delete(entityId);

      // Emit enhanced entity-deleted event
      await this.eventEmitter.emit('entity-deleted', {
        entityId,
        previousProperties,
        timestamp: new Date(),
        sourcePath: metadata.sourcePath,
        sourceType: metadata.sourceType,
        operationType: 'delete'
      });
    }

    return success;
  }

  // Handle VivafolioBlock notifications from LSP server (for vivafolio_data! constructs in .viv files)
  async handleVivafolioBlockNotification(notification: any): Promise<void> {
    console.log(`IndexingService: Received VivafolioBlock notification:`, notification);

    const { entityId, tableData, dslModule, sourcePath } = notification;

    if (!tableData || !tableData.headers || !tableData.rows) {
      console.error(`IndexingService: Invalid VivafolioBlock notification - missing tableData`);
      return;
    }

    // Create entities for each row in the table data
    for (let i = 0; i < tableData.rows.length; i++) {
      const row = tableData.rows[i];
      const rowEntityId = `${entityId}-row-${i}`;

      const properties: Record<string, any> = {};
      tableData.headers.forEach((header: string, idx: number) => {
        properties[header] = row[idx] || '';
      });

      const metadata: EntityMetadata = {
        entityId: rowEntityId,
        sourcePath: sourcePath || 'lsp-notification',
        sourceType: 'vivafolio_data_construct',
        dslModule: dslModule ? {
          version: '1.0',
          entityId: entityId,
          operations: dslModule.operations || {},
          source: dslModule.source || { type: 'vivafolio_data_construct' }
        } : undefined,
        properties,
        lastModified: new Date()
      };

      this.entityMetadata.set(rowEntityId, metadata);

      // Emit entity-created event
      await this.eventEmitter.emit('entity-created', {
        entityId: rowEntityId,
        properties,
        timestamp: new Date(),
        sourcePath: sourcePath || 'lsp-notification',
        sourceType: 'vivafolio_data_construct',
        operationType: 'create'
      });
    }

    console.log(`IndexingService: Processed ${tableData.rows.length} entities from VivafolioBlock notification`);
  }

  // Get entity metadata
  getEntityMetadata(entityId: string): EntityMetadata | undefined {
    return this.entityMetadata.get(entityId);
  }

  // Get all entity metadata
  getAllEntities(): EntityMetadata[] {
    return Array.from(this.entityMetadata.values());
  }

  // Batch operations support
  async performBatchOperations(operations: Array<{
    type: 'update' | 'create' | 'delete';
    entityId: string;
    properties?: Record<string, any>;
    sourceMetadata?: any;
  }>): Promise<{
    success: boolean;
    results: Array<{ entityId: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{ entityId: string; success: boolean; error?: string }> = [];
    const batchEvents: Array<EntityUpdateEvent | EntityCreateEvent | EntityDeleteEvent> = [];
    const timestamp = new Date();

    for (const operation of operations) {
      try {
        let success = false;
        let event: EntityUpdateEvent | EntityCreateEvent | EntityDeleteEvent | null = null;

        switch (operation.type) {
          case 'update':
            if (operation.properties) {
              success = await this.updateEntity(operation.entityId, operation.properties);
              if (success) {
                const metadata = this.entityMetadata.get(operation.entityId);
                if (metadata) {
                  event = {
                    entityId: operation.entityId,
                    properties: metadata.properties,
                    timestamp,
                    sourcePath: metadata.sourcePath,
                    sourceType: metadata.sourceType,
                    operationType: 'update'
                  } as EntityUpdateEvent;
                }
              }
            }
            break;

          case 'create':
            if (operation.properties && operation.sourceMetadata) {
              success = await this.createEntity(operation.entityId, operation.properties, operation.sourceMetadata);
              if (success) {
                event = {
                  entityId: operation.entityId,
                  properties: operation.properties,
                  timestamp,
                  sourcePath: operation.sourceMetadata.sourcePath,
                  sourceType: operation.sourceMetadata.sourceType,
                  operationType: 'create'
                } as EntityCreateEvent;
              }
            }
            break;

          case 'delete':
            success = await this.deleteEntity(operation.entityId);
            if (success) {
              // Event already emitted in deleteEntity method
            }
            break;
        }

        results.push({
          entityId: operation.entityId,
          success,
          error: success ? undefined : `Failed to ${operation.type} entity`
        });

        if (event) {
          batchEvents.push(event);
        }

      } catch (error) {
        results.push({
          entityId: operation.entityId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Emit batch operation event if we have successful operations
    if (batchEvents.length > 0) {
      await this.eventEmitter.emit('batch-operation', {
        operations: batchEvents,
        timestamp,
        operationType: 'batch'
      });
    }

    const overallSuccess = results.every(r => r.success);

    return {
      success: overallSuccess,
      results
    };
  }

  // Enhanced Event System API
  /**
   * Subscribe to an event with optional filtering and priority
   */
  on<T = any>(
    event: string,
    listener: (payload: T) => void | Promise<void>,
    options: {
      filter?: (payload: T) => boolean;
      priority?: number;
    } = {}
  ): string {
    return this.eventEmitter.on(event, listener, options);
  }

  /**
   * Subscribe to an event once
   */
  once<T = any>(
    event: string,
    listener: (payload: T) => void | Promise<void>,
    options: {
      filter?: (payload: T) => boolean;
      priority?: number;
    } = {}
  ): string {
    return this.eventEmitter.once(event, listener, options);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, listenerId: string): boolean {
    return this.eventEmitter.off(event, listenerId);
  }

  /**
   * Unsubscribe all listeners for an event or all events
   */
  offAll(event?: string): void {
    this.eventEmitter.offAll(event);
  }

  /**
   * Wait for an event to be emitted
   */
  waitFor<T = any>(
    event: string,
    options: {
      filter?: (payload: T) => boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    return this.eventEmitter.waitFor(event, options);
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: string): number {
    return this.eventEmitter.listenerCount(event);
  }

  /**
   * Get all listener IDs for an event
   */
  getListenerIds(event: string): string[] {
    return this.eventEmitter.getListenerIds(event);
  }

  /**
   * Get event names that have listeners
   */
  eventNames(): string[] {
    return this.eventEmitter.eventNames();
  }

  /**
   * Check if there are listeners for an event
   */
  hasListeners(event: string): boolean {
    return this.eventEmitter.hasListeners(event);
  }
}
