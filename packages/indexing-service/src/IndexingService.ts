import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar from 'chokidar';
import fg from 'fast-glob';
import matter from 'gray-matter';
import type { Entity } from '@vivafolio/block-core';
import { EditingModule, DSLModule, EditResult, EditContext } from './EditingModule';
import { DSLModuleExecutor } from './DSLModuleExecutor';
import { CSVEditingModule, MarkdownEditingModule, JSONEditingModule } from './FileEditingModule';
import { EventEmitter } from './EventEmitter';

const DEFAULT_ENTITY_TYPE_ID = 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2';
const DEFAULT_EDITION_ID = '1';

function createEditionId(_entityId: string): string {
  return DEFAULT_EDITION_ID;
}

// Simple editing module for LSP-sourced entities
class LSPEditingModule implements EditingModule {
  canHandle(sourceType: string, metadata: any): boolean {
    return sourceType === 'lsp';
  }

  async createEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    // LSP entities are read-only - just return success
    return true;
  }

  async updateEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    // LSP entities are read-only - just return success
    return true;
  }

  async deleteEntity(entityId: string, metadata: any): Promise<boolean> {
    // LSP entities are read-only - just return success
    return true;
  }
}



// Configuration for the indexing service
export interface IndexingServiceConfig {
  watchPaths: string[];
  supportedExtensions: string[];
  excludePatterns: string[];
  csv?: {
    dialect?: { delimiter?: string; quote?: string; escape?: string; header?: boolean };
    schema?: {
      id?: { from: 'column' | 'template'; column?: string; template?: string };
      columns?: Record<string, { rename?: string; type?: 'string' | 'int' | 'float' | 'bool' | 'date'; required?: boolean }>;
      nullPolicy?: 'strict' | 'loose';
      delimiter?: string; quote?: string; escape?: string; header?: boolean;
    };
    typing?: boolean;
    nullPolicy?: 'strict' | 'loose';
    headerSanitizer?: (raw: string, i: number) => string;
    onRow?: (row: Record<string, any>, ctx: { filePath: string; rowIndex: number }) => void;
  };
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
  private entityGraph: Map<string, Entity> = new Map();
  private dslModuleRegistry: Map<string, DSLModule> = new Map();
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
    this.editingModules.push(new JSONEditingModule());
    this.editingModules.push(new LSPEditingModule());
  }


  getDslModuleForEntityType(entityTypeId: string): DSLModule | undefined {
    return this.dslModuleRegistry.get(entityTypeId);
  }

  registerDslModule(entityTypeId: string, baseEntityId: string, rawModule?: DSLModule | Record<string, any>): DSLModule | undefined {
    const normalized = this.normalizeDslModule(baseEntityId, rawModule);
    if (normalized) {
      this.dslModuleRegistry.set(entityTypeId, normalized);
    }
    return normalized;
  }

  private normalizeDslModule(baseEntityId: string, rawModule?: DSLModule | Record<string, any>): DSLModule | undefined {
    if (!rawModule) {
      return undefined;
    }

    const moduleRecord = rawModule as Record<string, any>;
    return {
      version: typeof moduleRecord.version === 'string' ? moduleRecord.version : '1.0',
      entityId: baseEntityId,
      operations: moduleRecord.operations || {},
      source: moduleRecord.source || { type: 'vivafolio_data_construct' }
    } as DSLModule;
  }

  // Get source type from file extension
  private getSourceTypeFromExtension(ext: string): string {
    switch (ext) {
      case '.csv': return 'csv';
      case '.md': return 'markdown';
      case '.json': return 'json';
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

    console.log(`IndexingService: Scanned ${this.entityGraph.size} entities`);
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
      for (const [entityId, metadata] of this.entityGraph) {
        if (metadata.sourcePath === filePath) {
          affectedEntities.push(entityId);
          const previousProperties = { ...metadata.properties };
          this.entityGraph.delete(entityId);

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
      for (const [entityId, metadata] of this.entityGraph) {
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
      } else if (ext === '.json') {
        await this.processJSONFile(filePath);
      }
      // Note: Source files with vivafolio_data!() constructs are handled via LSP notifications
    } catch (error) {
      console.error(`IndexingService: Error processing file ${filePath}:`, error);
    }
  }

  // Process CSV files with robust parsing and optional dialect/schema
  private async processCSVFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const cfg = this.config.csv || {};
    const dialect = cfg.dialect || {};
    const delimiter = (cfg.schema?.delimiter ?? dialect.delimiter ?? ',');
    const quote = (cfg.schema?.quote ?? dialect.quote ?? '"');
    const escape = (cfg.schema?.escape ?? dialect.escape ?? undefined);
    const headerEnabled = (cfg.schema?.header ?? dialect.header);

    // Normalize newlines and optionally strip BOM
    const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
    // One-pass robust CSV parser: build records (arrays of cells) directly
    const records: string[][] = [];
    {
      let cell = '';
      let row: string[] = [];
      let inQ = false;
      for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i];
        if (ch === quote) {
          // Escaped quote inside a quoted cell
          if (inQ && normalized[i + 1] === quote) {
            cell += quote;
            i += 1; // consume second quote
          } else {
            inQ = !inQ; // enter/exit quotes, do not include the quote char
          }
          continue;
        }
        if (escape && ch === escape && normalized[i + 1] !== undefined) {
          // Lenient escape handling: take the next char verbatim
          cell += normalized[i + 1];
          i += 1;
          continue;
        }
        if (!inQ && ch === delimiter) {
          row.push(cell);
          cell = '';
          continue;
        }
        if (!inQ && ch === '\n') {
          row.push(cell);
          records.push(row);
          // reset for next row
          row = [];
          cell = '';
          continue;
        }
        cell += ch;
      }
      // flush last cell/row
      row.push(cell);
      records.push(row);
    }

    if (!records.length) return;

    // Headers
    const headerRow = records[0] ?? [];
    let rawHeaders = headerRow.map((h) => h.replace(/^"|"$/g, ''));
    if (headerEnabled === false) {
      // No headers: generate col1..colN from longest row
      const longest = records.slice(1).reduce((n, r) => Math.max(n, r.length), 0);
      rawHeaders = Array.from({ length: longest }, (_, i) => `col${i + 1}`);
    }

    // Sanitize and dedupe headers
    const sanitize = cfg.headerSanitizer || ((raw: string, idx: number) => {
      const base = raw.trim().toLowerCase().replace(/\s+/g, '_');
      return base || `col${idx + 1}`;
    });
    const headers: string[] = [];
    const seen = new Map<string, number>();
    rawHeaders.forEach((h, idx) => {
      let key = sanitize(h, idx);
      if (seen.has(key)) {
        const n = (seen.get(key) || 0) + 1;
        seen.set(key, n);
        key = `${key}_${n}`;
      } else {
        seen.set(key, 0);
      }
      headers.push(key);
    });

    const typing = !!cfg.typing;
    const nullLoose = (cfg.nullPolicy === 'loose' || cfg.schema?.nullPolicy === 'loose');
    const toTyped = (val: string): any => {
      const v = val;
      if (!typing) return v;
      // Null policy
      if (nullLoose && (v === '' || v.toLowerCase() === 'null' || v.toLowerCase() === 'nan')) return null;
      // Booleans
      if (v === 'true' || v === 'false') return v === 'true';
      // Integers
      if (/^[+-]?\d+$/.test(v)) return parseInt(v, 10);
      // Floats
      if (/^[+-]?(\d+\.)?\d+(e[+-]?\d+)?$/i.test(v)) return parseFloat(v);
      // ISO date (basic check)
      if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v)) return v;
      return v;
    };

    // Build entities row-by-row
    for (let i = 1; i < records.length; i++) {
      const cells = records[i];
      if (cells.every((c) => c.trim() === '')) continue; // skip empty rows
      const properties: Record<string, any> = {};
      for (let c = 0; c < headers.length; c++) {
        const raw = (cells[c] ?? '');
        properties[headers[c]] = toTyped(raw.replace(/^"|"$/g, ''));
      }
      // Extra cells policy: drop or store as _extra_n
      for (let c = headers.length; c < cells.length; c++) {
        properties[`_extra_${c - headers.length}`] = cells[c].replace(/^"|"$/g, '');
      }

      // Compute entityId
      const basename = path.basename(filePath, '.csv');
      let entityId = `${basename}-row-${i - 1}`;
      const idSpec = cfg.schema?.id;
      if (idSpec?.from === 'column' && idSpec.column) {
        const candidate = properties[idSpec.column];
        if (candidate && String(candidate).length > 0) {
          entityId = String(candidate);
        }
      } else if (idSpec?.from === 'template' && idSpec.template) {
        entityId = idSpec.template
          .replace('${basename}', basename)
          .replace('${i}', String(i - 1));
      }

      const entityTypeId = DEFAULT_ENTITY_TYPE_ID;
      const metadata: Entity = {
        entityId,
        entityTypeId,
        editionId: createEditionId(entityId),
        sourcePath: filePath,
        sourceType: 'csv',
        properties
      };

      this.entityGraph.set(entityId, metadata);
      if (typeof cfg.onRow === 'function') {
        try { cfg.onRow(properties, { filePath, rowIndex: i - 1 }); } catch { }
      }
    }
  }

  // Process Markdown files with frontmatter
  private async processMarkdownFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(content);

    if (Object.keys(parsed.data).length > 0) {
      const entityId = path.basename(filePath, '.md');
      const entityTypeId = DEFAULT_ENTITY_TYPE_ID;
      const metadata: Entity = {
        entityId,
        entityTypeId,
        editionId: createEditionId(entityId),
        sourcePath: filePath,
        sourceType: 'markdown',
        properties: parsed.data
      };

      this.entityGraph.set(entityId, metadata);
    }
  }

  private async processJSONFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      const entityId = path.basename(filePath, '.json');
      const entityTypeId = DEFAULT_ENTITY_TYPE_ID;
      const metadata: Entity = {
        entityId,
        entityTypeId,
        editionId: createEditionId(entityId),
        sourcePath: filePath,
        sourceType: 'json',
        properties: parsed
      };
      this.entityGraph.set(entityId, metadata);
    } catch (error) {
      console.error(`IndexingService: Error processing JSON file ${filePath}:`, error);
    }
  }

  // Note: vivafolio_data!() constructs are handled via VivafolioBlock notifications from LSP server
  // This method is kept for potential future use but not called in current scanning

  // Handle Block Protocol updateEntity messages
  async updateEntity(entityId: string, properties: Record<string, any>): Promise<boolean> {
    const entity = this.entityGraph.get(entityId);
    if (!entity) {
      console.error(`IndexingService: Entity ${entityId} not found`);
      return false;
    }

    const dslModule = this.getDslModuleForEntityType(entity.entityTypeId);
    const metadata = dslModule ? { ...entity, dslModule } : entity;

    // Find the appropriate editing module
    const editingModule = this.editingModules.find(module =>
      module.canHandle(entity.sourceType, metadata)
    );

    if (!editingModule) {
      console.error(`IndexingService: No editing module found for ${entity.sourceType}`);
      return false;
    }

    const success = await editingModule.updateEntity(entityId, properties, metadata);
    if (success) {
      // Store previous properties for event
      const previousProperties = { ...(entity.properties || {}) };

      // Update our metadata
      entity.properties = { ...(entity.properties || {}), ...properties };
      entity.editionId = createEditionId(entityId);

      // Emit enhanced entity-updated event
      await this.eventEmitter.emit('entity-updated', {
        entityId,
        properties: entity.properties,
        previousProperties,
        timestamp: new Date(),
        sourcePath: entity.sourcePath,
        sourceType: entity.sourceType,
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
      const entityTypeId = sourceMetadata.entityTypeId ?? DEFAULT_ENTITY_TYPE_ID;
      const moduleBaseEntityId = typeof sourceMetadata.dslModule?.entityId === 'string'
        ? sourceMetadata.dslModule.entityId
        : entityId;
      this.registerDslModule(entityTypeId, moduleBaseEntityId, sourceMetadata.dslModule);
      const metadata: Entity = {
        entityId,
        entityTypeId,
        editionId: createEditionId(entityId),
        sourcePath: sourceMetadata.sourcePath,
        sourceType: sourceMetadata.sourceType,
        properties
      };

      this.entityGraph.set(entityId, metadata);

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
    const entity = this.entityGraph.get(entityId);
    if (!entity) {
      console.error(`IndexingService: Entity ${entityId} not found`);
      return false;
    }

    const dslModule = this.getDslModuleForEntityType(entity.entityTypeId);
    const metadata = dslModule ? { ...entity, dslModule } : entity;

    // Find the appropriate editing module
    const editingModule = this.editingModules.find(module =>
      module.canHandle(entity.sourceType, metadata)
    );

    if (!editingModule) {
      console.error(`IndexingService: No editing module found for ${entity.sourceType}`);
      return false;
    }

    const success = await editingModule.deleteEntity(entityId, metadata);
    if (success) {
      const previousProperties = { ...(entity.properties || {}) };
      this.entityGraph.delete(entityId);

      // Emit enhanced entity-deleted event
      await this.eventEmitter.emit('entity-deleted', {
        entityId,
        previousProperties,
        timestamp: new Date(),
        sourcePath: entity.sourcePath,
        sourceType: entity.sourceType,
        operationType: 'delete'
      });
    }

    return success;
  }

  // Handle VivafolioBlock notifications from LSP server (for vivafolio_data! constructs in .viv files)
  async handleVivafolioBlockNotification(notification: any): Promise<void> {
    console.log(`IndexingService: Received VivafolioBlock notification:`, notification);

    const { entityId, tableData, dslModule, sourcePath, entityTypeId: rawEntityTypeId } = notification;

    if (!tableData || !tableData.headers || !tableData.rows) {
      console.error(`IndexingService: Invalid VivafolioBlock notification - missing tableData`);
      return;
    }

    const entityTypeId = rawEntityTypeId ?? DEFAULT_ENTITY_TYPE_ID;
    this.registerDslModule(entityTypeId, entityId, dslModule);

    const sanitizeHeader = (raw: string, idx: number) => {
      const base = raw.trim().toLowerCase().replace(/\s+/g, '_');
      return base || `col${idx + 1}`;
    };

    // Create entities for each row in the table data
    for (let i = 0; i < tableData.rows.length; i++) {
      const row = tableData.rows[i];
      const rowEntityId = `${entityId}-row-${i}`;

      const properties: Record<string, any> = {};
      tableData.headers.forEach((header: string, idx: number) => {
        const key = sanitizeHeader(header, idx);
        properties[key] = row[idx] || '';
      });

      const metadata: Entity = {
        entityId: rowEntityId,
        entityTypeId,
        editionId: createEditionId(rowEntityId),
        sourcePath: sourcePath || 'lsp-notification',
        sourceType: 'vivafolio_data_construct',
        properties
      };

      this.entityGraph.set(rowEntityId, metadata);

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
  getEntityMetadata(entityId: string): Entity | undefined {
    return this.entityGraph.get(entityId);
  }

  // Get all entity metadata
  getAllEntities(): Entity[] {
    return Array.from(this.entityGraph.values());
  }

  // Helper: get entities by source type
  getEntitiesBySourceType(sourceType: string): Entity[] {
    return Array.from(this.entityGraph.values())
      .filter((entity) => entity.sourceType === sourceType);
  }

  // Helper: get entities by file basename with optional source type filtering
  getEntitiesByBasename(basename: string, options: { sourceType?: string } = {}): Entity[] {
    return Array.from(this.entityGraph.values()).filter((entity) => {
      if (!entity.sourcePath) {
        return false;
      }
      if (options.sourceType && entity.sourceType !== options.sourceType) {
        return false;
      }
      return path.basename(entity.sourcePath) === basename;
    });
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
                const metadata = this.entityGraph.get(operation.entityId);
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
