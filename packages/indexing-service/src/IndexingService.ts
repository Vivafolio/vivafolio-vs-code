import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar from 'chokidar';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { EditingModule, DSLModule, EditResult, EditContext } from './EditingModule';
import { DSLModuleExecutor } from './DSLModuleExecutor';
import { CSVEditingModule, MarkdownEditingModule } from './FileEditingModule';

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

// Event types emitted by the indexing service
export interface IndexingEvents {
  'file-changed': (filePath: string, eventType: 'add' | 'change' | 'unlink') => void;
  'entity-updated': (entityId: string, properties: Record<string, any>) => void;
  'entity-created': (entityId: string, properties: Record<string, any>) => void;
  'entity-deleted': (entityId: string) => void;
}

export class IndexingService {
  private config: IndexingServiceConfig;
  private editingModules: EditingModule[] = [];
  private entityMetadata: Map<string, EntityMetadata> = new Map();
  private watcher?: chokidar.FSWatcher;
  private eventListeners: Map<keyof IndexingEvents, Function[]> = new Map();

  constructor(config: IndexingServiceConfig) {
    this.config = config;
    this.initializeEditingModules();
  }

  private initializeEditingModules(): void {
    // Register built-in editing modules
    this.editingModules.push(new DSLModuleExecutor());
    this.editingModules.push(new CSVEditingModule());
    this.editingModules.push(new MarkdownEditingModule());
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

    if (eventType === 'unlink') {
      // Remove entities from this file
      for (const [entityId, metadata] of this.entityMetadata) {
        if (metadata.sourcePath === filePath) {
          this.entityMetadata.delete(entityId);
          this.emit('entity-deleted', entityId);
        }
      }
    } else {
      await this.processFile(filePath, eventType);
    }

    this.emit('file-changed', filePath, eventType);
  }

  // Process a file to extract entities
  private async processFile(filePath: string, eventType: 'add' | 'change'): Promise<void> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.csv') {
        await this.processCSVFile(filePath);
      } else if (ext === '.md') {
        await this.processMarkdownFile(filePath);
      } else {
        // For other files, check if they contain vivafolio_data!() constructs
        await this.processSourceFile(filePath);
      }
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

  // Process source files for vivafolio_data!() constructs
  private async processSourceFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');

    // Look for vivafolio_data!() constructs
    const dataPattern = /vivafolio_data!\(\s*["']([^"']+)["']\s*,\s*r#"([\s\S]*?)"#\s*\)/g;
    let match;

    while ((match = dataPattern.exec(content)) !== null) {
      const entityId = match[1];
      const tableText = match[2];

      // Parse table data (simplified version of the LSP parser)
      const lines = tableText.trim().split('\n');
      if (lines.length < 2) continue;

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      // Create DSL module for this construct
      const dslModule: DSLModule = {
        version: '1.0',
        entityId: entityId,
        operations: {
          updateEntity: {
            handler: 'tableUpdateHandler',
            params: { headers, originalRows: lines.length - 1 }
          },
          createEntity: {
            handler: 'tableCreateHandler',
            params: { headers }
          },
          deleteEntity: {
            handler: 'tableDeleteHandler',
            params: { entityId }
          }
        },
        source: {
          type: 'vivafolio_data_construct',
          pattern: `vivafolio_data!("${entityId}", r#"`
        }
      };

      // Create entities for each row
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
        const rowEntityId = `${entityId}-row-${i - 1}`;

        const properties: Record<string, any> = {};
        headers.forEach((header, idx) => {
          properties[header] = cells[idx] || '';
        });

        const metadata: EntityMetadata = {
          entityId: rowEntityId,
          sourcePath: filePath,
          sourceType: 'vivafolio_data_construct',
          dslModule,
          properties,
          lastModified: new Date()
        };

        this.entityMetadata.set(rowEntityId, metadata);
      }
    }
  }

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
      // Update our metadata
      metadata.properties = { ...metadata.properties, ...properties };
      metadata.lastModified = new Date();
      this.emit('entity-updated', entityId, metadata.properties);
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
      this.emit('entity-created', entityId, properties);
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
      this.entityMetadata.delete(entityId);
      this.emit('entity-deleted', entityId);
    }

    return success;
  }

  // Get entity metadata
  getEntityMetadata(entityId: string): EntityMetadata | undefined {
    return this.entityMetadata.get(entityId);
  }

  // Get all entity metadata
  getAllEntities(): EntityMetadata[] {
    return Array.from(this.entityMetadata.values());
  }

  // Event system
  on<K extends keyof IndexingEvents>(event: K, listener: IndexingEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  off<K extends keyof IndexingEvents>(event: K, listener: IndexingEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit<K extends keyof IndexingEvents>(event: K, ...args: Parameters<IndexingEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }
}
