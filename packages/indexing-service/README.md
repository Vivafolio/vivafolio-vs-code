# @vivafolio/indexing-service

A file system indexing service for Vivafolio that provides entity management and editing capabilities for Block Protocol blocks.

## Features

- **File System Indexing**: Automatically scans and indexes files (CSV, Markdown, source code)
- **Entity Management**: Manages entities extracted from various file formats
- **Pluggable Editing Modules**: Supports different editing strategies for different file types
- **DSL Module Execution**: Handles custom syntax constructs like `vivafolio_data!()`
- **Real-time File Watching**: Monitors file changes and updates entities automatically
- **Event System**: Emits events for file and entity changes

## Installation

```bash
npm install @vivafolio/indexing-service
```

## Quick Start

```typescript
import { IndexingService, IndexingServiceConfig } from '@vivafolio/indexing-service';

const config: IndexingServiceConfig = {
  watchPaths: ['./src', './data'],
  supportedExtensions: ['csv', 'md', 'rs', 'js'],
  excludePatterns: ['**/node_modules/**', '**/dist/**']
};

const indexingService = new IndexingService(config);

// Start the service
await indexingService.start();

// Listen for entity changes
indexingService.on('entity-updated', (entityId, properties) => {
  console.log(`Entity ${entityId} updated:`, properties);
});

// Handle Block Protocol messages
const success = await indexingService.updateEntity('task-1', {
  status: 'completed',
  updatedAt: new Date().toISOString()
});

if (success) {
  console.log('Entity updated successfully');
}

// Stop the service when done
await indexingService.stop();
```

## Supported File Types

### CSV Files
Automatically extracts entities from CSV files where each row becomes an entity.

```csv
Name,Age,City
Alice,30,New York
Bob,25,London
```

Generates entities:
- `filename-row-0`: `{ Name: 'Alice', Age: '30', City: 'New York' }`
- `filename-row-1`: `{ Name: 'Bob', Age: '25', City: 'London' }`

### Markdown Files with Frontmatter
Extracts YAML frontmatter as entity properties.

```markdown
---
title: My Document
author: Alice
tags: [example, test]
---

# Content

Document content here...
```

Generates entity:
- `filename`: `{ title: 'My Document', author: 'Alice', tags: ['example', 'test'] }`

### Source Files with Custom Syntax
Processes `vivafolio_data!()` constructs for table data in source code.

```rust
vivafolio_data!("user_table", r#"
Name,Role,Department
Alice,Developer,Engineering
Bob,Designer,Design
"#);
```

Generates entities with DSL modules for editing:
- `user_table-row-0`: `{ Name: 'Alice', Role: 'Developer', Department: 'Engineering' }`
- `user_table-row-1`: `{ Name: 'Bob', Role: 'Designer', Department: 'Design' }`

## Editing Modules

The service uses pluggable editing modules to handle different file types:

### Built-in Modules

- **DSLModuleExecutor**: Handles `vivafolio_data!()` constructs
- **CSVEditingModule**: Handles CSV file editing
- **MarkdownEditingModule**: Handles Markdown frontmatter editing

### Custom Editing Modules

Create custom editing modules by implementing the `EditingModule` interface:

```typescript
import { EditingModule, EditResult, EditContext } from '@vivafolio/indexing-service';

class CustomEditingModule implements EditingModule {
  canHandle(sourceType: string, metadata: any): boolean {
    return sourceType === 'custom';
  }

  async updateEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    // Implement your editing logic
    return true;
  }

  async createEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean> {
    // Implement your creation logic
    return true;
  }

  async deleteEntity(entityId: string, metadata: any): Promise<boolean> {
    // Implement your deletion logic
    return true;
  }
}

// Register the custom module
indexingService.registerEditingModule(new CustomEditingModule());
```

## DSL Modules

DSL modules define how to handle entity operations for custom syntax constructs:

```typescript
interface DSLModule {
  version: string;
  entityId: string;
  operations: {
    updateEntity: {
      handler: string;
      params: Record<string, any>;
    };
    createEntity: {
      handler: string;
      params: Record<string, any>;
    };
    deleteEntity: {
      handler: string;
      params: Record<string, any>;
    };
  };
  source: {
    type: string;
    pattern: string;
  };
}
```

## Advanced Event System (G2.4)

The indexing service provides a powerful pub/sub event system with advanced features including filtering, priority ordering, async delivery, and batch operations.

### Event Types

#### Enhanced Event Payloads

All events now include rich metadata:

```typescript
interface FileChangeEvent {
  filePath: string;
  eventType: 'add' | 'change' | 'unlink';
  timestamp: Date;
  affectedEntities: string[];
  sourceType: string;
}

interface EntityUpdateEvent {
  entityId: string;
  properties: Record<string, any>;
  previousProperties?: Record<string, any>;
  timestamp: Date;
  sourcePath: string;
  sourceType: string;
  operationType: 'update';
}

interface BatchOperationEvent {
  operations: Array<EntityUpdateEvent | EntityCreateEvent | EntityDeleteEvent>;
  timestamp: Date;
  sourcePath?: string;
  operationType: 'batch';
}
```

### Basic Event Subscription

```typescript
import { IndexingService, IndexingServiceConfig } from '@vivafolio/indexing-service';

const config: IndexingServiceConfig = {
  watchPaths: ['./src', './data'],
  supportedExtensions: ['csv', 'md', 'rs'],
  excludePatterns: ['**/node_modules/**']
};

const indexingService = new IndexingService(config);

// Basic event subscription
indexingService.on('entity-updated', (event) => {
  console.log(`Entity ${event.entityId} updated:`, event.properties);
  console.log(`Source: ${event.sourcePath} (${event.sourceType})`);
});

indexingService.on('file-changed', (event) => {
  console.log(`File ${event.eventType}: ${event.filePath}`);
  console.log(`Affected entities:`, event.affectedEntities);
});
```

### Advanced Event Features

#### Event Filtering

Subscribe to events with custom filters:

```typescript
// Only listen to CSV file changes
indexingService.on('file-changed', (event) => {
  console.log(`CSV file changed: ${event.filePath}`);
}, {
  filter: (event) => event.sourceType === 'csv'
});

// Only listen to updates for specific entities
indexingService.on('entity-updated', (event) => {
  console.log(`Task updated: ${event.entityId}`);
}, {
  filter: (event) => event.entityId.startsWith('task-')
});
```

#### Priority Ordering

Control the order of event delivery:

```typescript
// High priority logger (runs first)
indexingService.on('entity-updated', (event) => {
  console.log(`[HIGH] Entity updated: ${event.entityId}`);
}, { priority: 10 });

// Low priority processor (runs after)
indexingService.on('entity-updated', (event) => {
  // Process the update
  processEntityUpdate(event);
}, { priority: 0 });
```

#### One-time Listeners

```typescript
// Listen once for the next entity creation
indexingService.once('entity-created', (event) => {
  console.log(`First new entity: ${event.entityId}`);
  // This listener will be automatically removed after firing
});
```

#### Async Event Handling

```typescript
indexingService.on('entity-updated', async (event) => {
  // Perform async operations
  await updateExternalSystem(event.entityId, event.properties);
  await sendNotification(event.entityId);
});
```

### Waiting for Events

```typescript
// Wait for the next entity update
const updateEvent = await indexingService.waitFor('entity-updated');
console.log('Next update:', updateEvent);

// Wait with timeout
try {
  const updateEvent = await indexingService.waitFor('entity-updated', {
    timeout: 5000 // 5 seconds
  });
  console.log('Update received:', updateEvent);
} catch (error) {
  console.log('Timeout waiting for update');
}

// Wait with filter
const specificUpdate = await indexingService.waitFor('entity-updated', {
  filter: (event) => event.entityId === 'important-entity'
});
```

### Batch Operations

Perform multiple operations atomically and receive consolidated events:

```typescript
const operations = [
  {
    type: 'update' as const,
    entityId: 'task-1',
    properties: { status: 'completed', completedAt: new Date() }
  },
  {
    type: 'update' as const,
    entityId: 'task-2',
    properties: { status: 'in-progress' }
  },
  {
    type: 'create' as const,
    entityId: 'task-3',
    properties: { title: 'New Task', status: 'pending' },
    sourceMetadata: { sourceType: 'csv', sourcePath: '/data/tasks.csv' }
  }
];

const result = await indexingService.performBatchOperations(operations);

if (result.success) {
  console.log('All operations completed successfully');
} else {
  console.log('Some operations failed:', result.results);
}

// Listen for batch operation events
indexingService.on('batch-operation', (event) => {
  console.log(`Batch operation completed with ${event.operations.length} operations`);
  event.operations.forEach(op => {
    console.log(`- ${op.operationType}: ${op.entityId}`);
  });
});
```

### Event Management

```typescript
// Get listener information
const listenerCount = indexingService.listenerCount('entity-updated');
const listenerIds = indexingService.getListenerIds('entity-updated');
const eventNames = indexingService.eventNames();

// Check if listeners exist
if (indexingService.hasListeners('entity-updated')) {
  console.log('There are listeners for entity updates');
}

// Unsubscribe specific listeners
const listenerId = indexingService.on('entity-updated', handler);
indexingService.off('entity-updated', listenerId);

// Unsubscribe all listeners for an event
indexingService.offAll('entity-updated');

// Unsubscribe all listeners for all events
indexingService.offAll();
```

### Real-world Example: LSP Integration

```typescript
class LSPClient {
  private indexingService: IndexingService;
  private listeners: string[] = [];

  constructor(indexingService: IndexingService) {
    this.indexingService = indexingService;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for file changes that affect LSP-managed entities
    const fileListenerId = this.indexingService.on('file-changed', (event) => {
      if (event.sourceType === 'vivafolio_data_construct') {
        console.log(`LSP: File changed, updating diagnostics for ${event.filePath}`);
        this.updateLSPDiagnostics(event.filePath);
      }
    }, {
      filter: (event) => event.affectedEntities.length > 0
    });

    // Listen for entity updates from Block Protocol blocks
    const entityListenerId = this.indexingService.on('entity-updated', (event) => {
      if (event.sourceType === 'vivafolio_data_construct') {
        console.log(`LSP: Entity updated, refreshing diagnostics`);
        this.refreshDiagnostics(event.sourcePath);
      }
    }, {
      priority: 5 // High priority for LSP updates
    });

    this.listeners.push(fileListenerId, entityListenerId);
  }

  private updateLSPDiagnostics(filePath: string) {
    // Update LSP diagnostics for the changed file
  }

  private refreshDiagnostics(filePath: string) {
    // Refresh diagnostics for the file
  }

  destroy() {
    // Clean up listeners
    this.listeners.forEach(id => {
      this.indexingService.offAll(); // In practice, you'd track which event type each ID belongs to
    });
  }
}
```

### Error Handling

The event system includes robust error handling:

```typescript
// Errors in listeners are caught and logged
indexingService.on('entity-updated', (event) => {
  // If this throws, it won't crash other listeners
  throw new Error('Something went wrong');
});

// Custom error handler can be configured during service initialization
const indexingService = new IndexingService(config, {
  errorHandler: (error, eventName, listener) => {
    console.error(`Custom error handler: ${eventName} - ${error.message}`);
    // Send to monitoring system, etc.
  }
});
```

### Performance Considerations

- **Async Delivery**: Events are delivered asynchronously by default for better performance
- **Priority Queuing**: High-priority listeners are called first
- **Listener Limits**: Maximum listener limits prevent memory leaks (configurable)
- **Batch Operations**: Use batch operations for multiple related changes to reduce event overhead
- **Filtering**: Use filters to reduce unnecessary event processing

### Migration from Simple Events

If migrating from the old simple event system:

```typescript
// Old way (deprecated)
indexingService.on('entity-updated', (entityId, properties) => {
  console.log(`Entity ${entityId} updated`);
});

// New way (enhanced)
indexingService.on('entity-updated', (event) => {
  console.log(`Entity ${event.entityId} updated at ${event.timestamp}`);
  console.log(`Previous:`, event.previousProperties);
  console.log(`New:`, event.properties);
});
```

## Integration with Block Protocol

The indexing service is designed to work seamlessly with Block Protocol blocks:

1. **Entity Discovery**: Automatically discovers and indexes entities from files
2. **Real-time Updates**: Updates entities when files change
3. **Bidirectional Sync**: Handles Block Protocol messages and updates source files
4. **DSL Execution**: Supports complex editing operations through DSL modules

## Configuration

```typescript
interface IndexingServiceConfig {
  watchPaths: string[];           // Paths to watch for file changes
  supportedExtensions: string[];  // File extensions to process
  excludePatterns: string[];      // Glob patterns to exclude
}
```

## Error Handling

The service provides robust error handling:

- File read/write errors are logged and handled gracefully
- Invalid data formats are reported without crashing
- Editing operations return success/failure status
- Events are emitted for monitoring and debugging

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the package
npm run build
```

## API Reference

### IndexingService

#### Methods

- `start()`: Start the indexing service
- `stop()`: Stop the indexing service
- `updateEntity(entityId, properties)`: Update an entity
- `createEntity(entityId, properties, metadata)`: Create a new entity
- `deleteEntity(entityId)`: Delete an entity
- `getEntityMetadata(entityId)`: Get metadata for an entity
- `getAllEntities()`: Get all entities
- `registerEditingModule(module)`: Register a custom editing module

#### Events

- `file-changed`: Emitted when files are added, changed, or deleted
- `entity-updated`: Emitted when an entity is updated
- `entity-created`: Emitted when an entity is created
- `entity-deleted`: Emitted when an entity is deleted

## License

MIT
