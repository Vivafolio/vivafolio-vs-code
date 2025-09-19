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

## Event System

The service emits events for various operations:

```typescript
// File system events
indexingService.on('file-changed', (filePath, eventType) => {
  console.log(`File ${eventType}: ${filePath}`);
});

// Entity events
indexingService.on('entity-updated', (entityId, properties) => {
  console.log(`Entity updated: ${entityId}`, properties);
});

indexingService.on('entity-created', (entityId, properties) => {
  console.log(`Entity created: ${entityId}`, properties);
});

indexingService.on('entity-deleted', (entityId) => {
  console.log(`Entity deleted: ${entityId}`);
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
