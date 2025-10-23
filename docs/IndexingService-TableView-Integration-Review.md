# IndexingService & TableViewBlock Integration Review

## Executive Summary

**Status**: ❌ **Critical Gap Identified - Integration Not Possible Without Adapter**

The `TableViewBlock` expects a `GraphService` with `aggregateEntities()` method for server-side pagination, but the `IndexingService` currently provides only CRUD operations (`updateEntity`, `createEntity`, `deleteEntity`). There is **no query/aggregation API** that matches the table view's requirements.

---

## 1. TableViewBlock Requirements Analysis

### 1.1 GraphService Interface Requirements

The `TableViewGraphService` extends the base `GraphService` with:

```typescript
export interface TableViewGraphService extends GraphService {
  // Server-side pagination and querying
  aggregateEntities: (args: {
    collectionId: string;
    pageNumber: number;
    itemsPerPage: number;
    sort?: { path: string; dir: "asc" | "desc" }[];
    filters?: { path: string; op: string; value?: unknown }[];
  }) => Promise<{ 
    items: any[]; 
    pageNumber: number; 
    itemsPerPage: number; 
    pageCount: number; 
    totalCount: number 
  }>;
  
  // Entity mutation
  updateEntity: (args: { 
    entityId: string; 
    properties: Record<string, unknown> 
  }) => Promise<void>;
}
```

### 1.2 Usage Pattern in TableView

**On Mount & Page Navigation:**
```typescript
async function loadPage() {
  setLoading(true);
  const res = await props.graph.aggregateEntities({
    collectionId: cfg().collectionId,  // e.g., "task-list" or CSV basename
    pageNumber: pageNumber(),           // 1-based page number
    itemsPerPage: pageSize(),          // 50 by default
    sort: cfg().sort,                  // e.g., [{ path: "status", dir: "asc" }]
    filters: cfg().filters,            // e.g., [{ path: "status", op: "equals", value: "done" }]
  });
  setRows(res.items);
  setPageCount(res.pageCount);
  setTotal(res.totalCount);
  setLoading(false);
}
```

**On Cell Edit:**
```typescript
await props.graph.updateEntity({
  entityId: row.entityId,
  properties: setByPath(row.properties ?? {}, col.path, newVal),
});
```

### 1.3 Key Features Required

1. **Server-Side Pagination**: Must return paginated results with metadata (totalCount, pageCount)
2. **Filtering**: Apply filters before pagination (path-based property filters)
3. **Sorting**: Multi-column sorting with asc/desc direction
4. **Collection Scoping**: Filter by `collectionId` (maps to CSV basename or entity collection)
5. **Entity Updates**: Commit cell edits back to underlying data source

---

## 2. IndexingService Current Capabilities

### 2.1 Available Methods

```typescript
class IndexingService {
  // Entity CRUD
  async updateEntity(entityId: string, properties: Record<string, any>): Promise<boolean>
  async createEntity(entityId: string, properties: Record<string, any>, sourceMetadata: any): Promise<boolean>
  async deleteEntity(entityId: string): Promise<boolean>
  
  // Metadata retrieval (synchronous, in-memory)
  getEntityMetadata(entityId: string): EntityMetadata | undefined
  getAllEntities(): EntityMetadata[]
  getEntitiesBySourceType(sourceType: string): EntityMetadata[]
  getEntitiesByBasename(basename: string): EntityMetadata[]
  
  // Batch operations
  async performBatchOperations(operations: Array<...>): Promise<...>
  
  // Event system
  on<T>(event: string, listener: (payload: T) => void | Promise<void>): string
  // ... other event methods
}
```

### 2.2 Entity Metadata Structure

```typescript
interface EntityMetadata {
  entityId: string;           // e.g., "tasks-row-0"
  sourcePath: string;         // e.g., "/data/tasks.csv"
  sourceType: string;         // "csv", "markdown", "vivafolio_data_construct"
  properties: Record<string, any>;
  lastModified: Date;
  dslModule?: DSLModule;      // For vivafolio_data!() constructs
}
```

### 2.3 CSV Indexing Behavior

**Robust CSV Parser Features:**
- Handles quoted fields with embedded delimiters/newlines
- Escape sequence support
- BOM stripping
- Header sanitization with deduplication
- Configurable typing (auto-detect int/float/bool/date)
- Null policy (strict/loose)
- Custom ID generation (column-based or template-based)

**Example Output:**
```typescript
// From tasks.csv:
// Name,Status,Priority
// Alice,Done,High
// Bob,In Progress,Low

entityMetadata.set("tasks-row-0", {
  entityId: "tasks-row-0",
  sourcePath: "/data/tasks.csv",
  sourceType: "csv",
  properties: { Name: "Alice", Status: "Done", Priority: "High" },
  lastModified: new Date()
});

entityMetadata.set("tasks-row-1", {
  entityId: "tasks-row-1",
  sourcePath: "/data/tasks.csv",
  sourceType: "csv",
  properties: { Name: "Bob", Status: "In Progress", Priority: "Low" },
  lastModified: new Date()
});
```

### 2.4 Editing Capabilities

**CSVEditingModule:**
- ✅ Updates entities by row index (preserves other columns)
- ✅ Creates new rows (appends to end)
- ✅ Writes back to CSV file synchronously
- ❌ No batch update optimization
- ❌ No transaction support

**DSLModuleExecutor:**
- ✅ Handles `vivafolio_data!()` constructs in source files
- ✅ Regex-based source rewriting
- ❌ Limited to simple CSV-like syntax in constructs

---

## 3. Critical Gap Analysis

### 3.1 Missing: Query/Aggregation API

| Required by TableView | Available in IndexingService | Status |
|----------------------|------------------------------|--------|
| `aggregateEntities()` with pagination | ❌ None | **MISSING** |
| Filtering by property paths | ❌ None | **MISSING** |
| Multi-column sorting | ❌ None | **MISSING** |
| Collection-scoped queries | ✅ `getEntitiesByBasename()` | **PARTIAL** |
| Total count calculation | ❌ Manual from `getAllEntities()` | **WORKAROUND** |

**The IndexingService can retrieve ALL entities but cannot:**
1. Filter entities by property values (only by source type/basename)
2. Sort entities by property values
3. Paginate results with offset/limit
4. Return pagination metadata (pageCount, totalCount)

### 3.2 Missing: Block Protocol Graph Module API

The TableView expects Block Protocol-compliant graph methods, but IndexingService is **not Block Protocol aware**:

**Block Protocol Standard (from `@blockprotocol/graph`):**
```typescript
interface GraphModule {
  queryEntities(data: {
    operation: {
      multiFilter?: MultiFilter;
      multiSort?: MultiSort;
    };
    graphResolveDepths?: GraphResolveDepths;
  }): Promise<{ data: Subgraph; errors?: Error[] }>;
  
  updateEntity(data: {
    entityId: EntityId;
    properties: EntityPropertiesObject;
  }): Promise<{ data: Entity; errors?: Error[] }>;
  
  // ... other methods
}
```

**IndexingService Approach:**
- Simpler API (no Block Protocol types)
- Direct CRUD operations
- Event-driven architecture
- File-centric (not graph-centric)

### 3.3 API Signature Mismatch

| Aspect | TableViewGraphService | IndexingService |
|--------|----------------------|-----------------|
| Method name | `aggregateEntities()` | `getAllEntities()` |
| Pagination | Server-side (page/size) | Client-side (return all) |
| Filtering | Property-based filters | Type/basename only |
| Sorting | Multi-column with direction | None (insertion order) |
| Return type | `{ items, pageNumber, pageCount, totalCount }` | `EntityMetadata[]` |
| Async | Yes | No (synchronous in-memory) |

### 3.4 Update API Mismatch

**TableView expects:**
```typescript
updateEntity({ entityId: "tasks-row-0", properties: { Status: "Done" } })
```

**IndexingService provides:**
```typescript
updateEntity("tasks-row-0", { Status: "Done" })  // Returns Promise<boolean>
```

Minor difference but requires adapter wrapper.

---

## 4. Architecture Problems

### 4.1 In-Memory State Management

**IndexingService Design:**
- Keeps all entities in `Map<string, EntityMetadata>`
- File changes trigger re-indexing → updates map
- Queries operate on in-memory map (fast but limited)

**Problems:**
1. **Memory footprint**: All entities loaded at once (not scalable for 100k+ entities)
2. **Stale data**: If file changes externally, map is stale until next file watcher event
3. **No incremental loading**: Cannot lazy-load entities on-demand

**Ideal for:**
- Small datasets (< 10,000 entities)
- Local development/testing
- File-backed entity storage

**Not ideal for:**
- Large datasets requiring pagination
- Distributed systems (no shared state)
- Real-time collaboration (race conditions)

### 4.2 Lack of Query Engine

The IndexingService is a **file indexer**, not a **query engine**. It excels at:
- ✅ Watching files for changes
- ✅ Parsing structured data formats
- ✅ Maintaining entity-to-file mappings
- ✅ Writing changes back to files

But it lacks:
- ❌ Query planning/optimization
- ❌ Index structures (B-trees, hash indexes)
- ❌ Property-based filtering predicates
- ❌ Sorting algorithms for entity collections
- ❌ Pagination offset calculations

### 4.3 No Graph Semantics

**Block Protocol Graph Module Concepts:**
- **Subgraphs**: Entities + linked entities + entity types
- **Graph traversal**: `graphResolveDepths` for link following
- **Type system**: Entity types, property types, link types

**IndexingService Concepts:**
- **Flat entity list**: No relationships between entities
- **Source-file mapping**: Entities tied to source files
- **Type = sourceType**: "csv", "markdown", not semantic entity types

**Implication**: Cannot implement full Block Protocol GraphService without major refactoring.

---

## 5. Recommended Solutions

### 5.1 Immediate Solution: Create GraphServiceAdapter

**Approach:** Wrap IndexingService in adapter that implements `TableViewGraphService`

```typescript
// packages/indexing-service/src/GraphServiceAdapter.ts

import { IndexingService, EntityMetadata } from './IndexingService';
import type { GraphService, Entity, BlockGraph } from '@packages/block-frameworks/solidjs';

interface AggregateEntitiesArgs {
  collectionId: string;
  pageNumber: number;
  itemsPerPage: number;
  sort?: { path: string; dir: 'asc' | 'desc' }[];
  filters?: { path: string; op: string; value?: unknown }[];
}

interface AggregateEntitiesResult {
  items: any[];
  pageNumber: number;
  itemsPerPage: number;
  pageCount: number;
  totalCount: number;
}

export interface TableViewGraphService extends GraphService {
  aggregateEntities(args: AggregateEntitiesArgs): Promise<AggregateEntitiesResult>;
  updateEntity(args: { entityId: string; properties: Record<string, unknown> }): Promise<void>;
}

export class IndexingServiceGraphAdapter implements TableViewGraphService {
  constructor(
    private indexingService: IndexingService,
    private blockEntityId: string // The table view config entity ID
  ) {}

  // Implement GraphService base properties
  get blockEntity(): Entity {
    const metadata = this.indexingService.getEntityMetadata(this.blockEntityId);
    if (!metadata) {
      throw new Error(`Block entity ${this.blockEntityId} not found`);
    }
    return {
      entityId: metadata.entityId,
      entityTypeId: 'vivafolio/table-view-config',
      properties: metadata.properties,
      metadata: {
        recordId: {
          entityId: metadata.entityId,
          editionId: metadata.lastModified.toISOString()
        },
        entityTypeId: 'vivafolio/table-view-config'
      }
    };
  }

  get blockGraph(): BlockGraph {
    return { depth: 0, linkedEntities: [], linkGroups: [] };
  }

  entityTypes = [];
  linkedAggregations = [];
  readonly = false;

  // Core aggregation logic
  async aggregateEntities(args: AggregateEntitiesArgs): Promise<AggregateEntitiesResult> {
    const { collectionId, pageNumber, itemsPerPage, sort, filters } = args;

    // 1. Get all entities for collection
    let entities = this.indexingService.getEntitiesByBasename(`${collectionId}.csv`);
    
    // 2. Apply filters
    if (filters && filters.length > 0) {
      entities = this.applyFilters(entities, filters);
    }

    // 3. Apply sorting
    if (sort && sort.length > 0) {
      entities = this.applySorting(entities, sort);
    }

    // 4. Calculate pagination
    const totalCount = entities.length;
    const pageCount = Math.ceil(totalCount / itemsPerPage);
    const startIdx = (pageNumber - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageEntities = entities.slice(startIdx, endIdx);

    // 5. Convert to table items
    const items = pageEntities.map(meta => ({
      entityId: meta.entityId,
      properties: meta.properties
    }));

    return {
      items,
      pageNumber,
      itemsPerPage,
      pageCount,
      totalCount
    };
  }

  // Filter implementation
  private applyFilters(
    entities: EntityMetadata[],
    filters: { path: string; op: string; value?: unknown }[]
  ): EntityMetadata[] {
    return entities.filter(entity => {
      return filters.every(filter => {
        const value = this.getByPath(entity.properties, filter.path);
        return this.evaluateFilter(value, filter.op, filter.value);
      });
    });
  }

  private evaluateFilter(value: any, op: string, filterValue?: unknown): boolean {
    switch (op) {
      case 'equals':
        return value === filterValue;
      case 'not_equals':
        return value !== filterValue;
      case 'contains':
        return String(value).includes(String(filterValue));
      case 'starts_with':
        return String(value).startsWith(String(filterValue));
      case 'ends_with':
        return String(value).endsWith(String(filterValue));
      case 'greater_than':
        return value > filterValue;
      case 'less_than':
        return value < filterValue;
      case 'is_empty':
        return !value || value === '';
      case 'is_not_empty':
        return !!value && value !== '';
      default:
        console.warn(`Unknown filter operator: ${op}`);
        return true;
    }
  }

  // Sorting implementation
  private applySorting(
    entities: EntityMetadata[],
    sort: { path: string; dir: 'asc' | 'desc' }[]
  ): EntityMetadata[] {
    return [...entities].sort((a, b) => {
      for (const sortSpec of sort) {
        const aVal = this.getByPath(a.properties, sortSpec.path);
        const bVal = this.getByPath(b.properties, sortSpec.path);
        
        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;
        
        if (comparison !== 0) {
          return sortSpec.dir === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  // Property path navigation
  private getByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Update entity implementation
  async updateEntity(args: { entityId: string; properties: Record<string, unknown> }): Promise<void> {
    const success = await this.indexingService.updateEntity(args.entityId, args.properties);
    if (!success) {
      throw new Error(`Failed to update entity ${args.entityId}`);
    }
  }
}
```

**Usage:**
```typescript
// In VS Code extension
import { IndexingService } from '@vivafolio/indexing-service';
import { IndexingServiceGraphAdapter } from '@vivafolio/indexing-service/GraphServiceAdapter';
import { createBlockElement } from '@packages/block-frameworks/solidjs';
import TableView from '@blocks/table-view-tanstack';

// Initialize indexing service
const indexingService = new IndexingService({
  watchPaths: [workspaceRoot],
  supportedExtensions: ['csv', 'md'],
  excludePatterns: ['**/node_modules/**']
});
await indexingService.start();

// Create adapter for each table view instance
const adapter = new IndexingServiceGraphAdapter(
  indexingService,
  'table-view-config-1' // The config entity ID
);

// Create block element
const TableViewElement = createBlockElement<typeof adapter>(
  TableView,
  { name: 'table-view', version: '1.0.0' }
);

// Register and use
customElements.define('vivafolio-table-view', TableViewElement);
const el = document.createElement('vivafolio-table-view');
el.init({ graph: adapter });
```

### 5.2 Medium-Term: Enhance IndexingService

**Add Query API directly to IndexingService:**

```typescript
// packages/indexing-service/src/IndexingService.ts

class IndexingService {
  // ... existing methods

  /**
   * Query entities with filtering, sorting, and pagination
   */
  async queryEntities(options: {
    sourceType?: string;
    basename?: string;
    filters?: Array<{ path: string; op: string; value?: unknown }>;
    sort?: Array<{ path: string; dir: 'asc' | 'desc' }>;
    page?: number;
    pageSize?: number;
  }): Promise<{
    entities: EntityMetadata[];
    totalCount: number;
    pageCount: number;
  }> {
    // Implementation similar to adapter above
    let entities = Array.from(this.entityMetadata.values());

    // Filter by source type/basename
    if (options.sourceType) {
      entities = entities.filter(e => e.sourceType === options.sourceType);
    }
    if (options.basename) {
      entities = entities.filter(e => 
        path.basename(e.sourcePath) === options.basename
      );
    }

    // Apply property filters
    // ... (same as adapter)

    // Apply sorting
    // ... (same as adapter)

    // Paginate
    const totalCount = entities.length;
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const pageCount = Math.ceil(totalCount / pageSize);
    const start = (page - 1) * pageSize;
    const paginatedEntities = entities.slice(start, start + pageSize);

    return { entities: paginatedEntities, totalCount, pageCount };
  }
}
```

**Pros:**
- Centralized query logic
- Reusable across multiple blocks
- Can optimize later (indexes, caching)

**Cons:**
- Still in-memory (memory limits apply)
- Doesn't solve Block Protocol type mismatch

### 5.3 Long-Term: Block Protocol Integration

**Goal:** Make IndexingService a full Block Protocol Graph Module implementation

**Requirements:**
1. Implement `@blockprotocol/graph` message handlers
2. Support Block Protocol entity types (not just source types)
3. Implement subgraph construction with link traversal
4. Support temporal queries (versioning)
5. Add type system (Property Types, Entity Types, Link Types)

**Architecture:**
```
┌─────────────────────────────────────────────────┐
│  VS Code Extension (Host)                       │
│  ┌───────────────────────────────────────────┐  │
│  │  Block Protocol Message Router            │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  Graph Module Handler               │  │  │
│  │  │  (queryEntities, updateEntity, ...) │  │  │
│  │  └────────────┬────────────────────────┘  │  │
│  └───────────────┼────────────────────────────┘  │
│                  │                                │
│  ┌───────────────▼────────────────────────────┐  │
│  │  IndexingService                           │  │
│  │  - Maintains entity graph                  │  │
│  │  - Handles file parsing                    │  │
│  │  - Executes queries                        │  │
│  │  - Manages entity types                    │  │
│  └────────────────────────────────────────────┘  │
│                  │                                │
│  ┌───────────────▼────────────────────────────┐  │
│  │  File System Watchers & Editing Modules   │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Benefits:**
- Standard Block Protocol compliance
- Works with any Block Protocol block (not just table view)
- Ecosystem compatibility (use blocks from Hub)
- Future-proof architecture

**Effort:** High (2-4 weeks for full implementation)

---

## 6. Performance Considerations

### 6.1 Current Bottlenecks

1. **Synchronous Filtering/Sorting**: O(n) for every query (no indexes)
2. **Full Scan**: Must iterate all entities to find matches
3. **String Operations**: Property path navigation via string splitting
4. **Memory Copies**: Sorting creates new array copies

### 6.2 Optimization Strategies

**Immediate (Adapter):**
- Cache sorted/filtered results per query signature
- Debounce rapid queries (e.g., during column resizing)
- Use `Set` for fast entity ID lookups

**Medium-Term (IndexingService):**
- Add property indexes (Map<propertyPath, Map<value, EntityMetadata[]>>)
- Lazy-load entities (don't keep all in memory)
- Use worker threads for sorting large datasets

**Long-Term (Query Engine):**
- SQLite integration for complex queries
- Custom query optimizer (predicate pushdown)
- Incremental materialized views

### 6.3 Scale Targets

| Dataset Size | Strategy | Expected Performance |
|-------------|----------|---------------------|
| < 1,000 entities | In-memory, no optimization | < 10ms per query |
| 1,000 - 10,000 | In-memory + indexes | < 50ms per query |
| 10,000 - 100,000 | Hybrid (hot data in memory) | < 200ms per query |
| > 100,000 | SQLite or external DB | < 500ms per query |

**Current Implementation: < 1,000 entities target**

---

## 7. Testing Strategy

### 7.1 Adapter Unit Tests

```typescript
// packages/indexing-service/src/__tests__/GraphServiceAdapter.test.ts

describe('IndexingServiceGraphAdapter', () => {
  let indexingService: IndexingService;
  let adapter: IndexingServiceGraphAdapter;

  beforeEach(async () => {
    indexingService = new IndexingService({
      watchPaths: ['/tmp/test'],
      supportedExtensions: ['csv'],
      excludePatterns: []
    });
    
    // Mock CSV file
    await fs.writeFile('/tmp/test/tasks.csv', 
      'Name,Status,Priority\nAlice,Done,High\nBob,In Progress,Low\nCharlie,Done,Medium'
    );
    
    await indexingService.start();
    adapter = new IndexingServiceGraphAdapter(indexingService, 'table-config');
  });

  test('aggregateEntities - basic pagination', async () => {
    const result = await adapter.aggregateEntities({
      collectionId: 'tasks',
      pageNumber: 1,
      itemsPerPage: 2
    });

    expect(result.items).toHaveLength(2);
    expect(result.totalCount).toBe(3);
    expect(result.pageCount).toBe(2);
  });

  test('aggregateEntities - filtering', async () => {
    const result = await adapter.aggregateEntities({
      collectionId: 'tasks',
      pageNumber: 1,
      itemsPerPage: 10,
      filters: [{ path: 'Status', op: 'equals', value: 'Done' }]
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].properties.Name).toBe('Alice');
  });

  test('aggregateEntities - sorting', async () => {
    const result = await adapter.aggregateEntities({
      collectionId: 'tasks',
      pageNumber: 1,
      itemsPerPage: 10,
      sort: [{ path: 'Priority', dir: 'asc' }]
    });

    expect(result.items[0].properties.Priority).toBe('High');
    expect(result.items[2].properties.Priority).toBe('Low');
  });

  test('updateEntity - success', async () => {
    const entityId = 'tasks-row-0';
    await adapter.updateEntity({
      entityId,
      properties: { Status: 'In Review' }
    });

    const metadata = indexingService.getEntityMetadata(entityId);
    expect(metadata?.properties.Status).toBe('In Review');
  });
});
```

### 7.2 Integration Tests with TableView

```typescript
// blocks/table-view-tanstack/src/__tests__/integration.test.tsx

import { render, screen, waitFor } from '@solidjs/testing-library';
import { IndexingService } from '@vivafolio/indexing-service';
import { IndexingServiceGraphAdapter } from '@vivafolio/indexing-service/GraphServiceAdapter';
import TableView from '../TableViewBlock';

describe('TableView + IndexingService Integration', () => {
  test('renders CSV data in table', async () => {
    const indexingService = new IndexingService({...});
    await indexingService.start();

    const adapter = new IndexingServiceGraphAdapter(indexingService, 'config-1');
    
    render(() => <TableView graph={adapter} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  test('cell edit persists to CSV', async () => {
    // ... setup
    
    const cell = screen.getByDisplayValue('Done');
    await userEvent.clear(cell);
    await userEvent.type(cell, 'In Progress{Enter}');

    await waitFor(() => {
      const csvContent = fs.readFileSync('/tmp/test/tasks.csv', 'utf-8');
      expect(csvContent).toContain('In Progress');
    });
  });
});
```

---

## 8. Recommendations

### Priority 1: Implement GraphServiceAdapter (1-2 days)

**Why**: Unblocks table view integration immediately with minimal IndexingService changes.

**Tasks**:
1. Create `GraphServiceAdapter.ts` with filtering/sorting/pagination
2. Add unit tests for adapter logic
3. Add integration test with table view
4. Document usage in README

### Priority 2: Add QueryAPI to IndexingService (2-3 days)

**Why**: Makes query logic reusable and easier to optimize later.

**Tasks**:
1. Add `queryEntities()` method to IndexingService
2. Refactor adapter to use new method
3. Add property indexes for common query patterns
4. Performance benchmarks for 10k+ entities

### Priority 3: Block Protocol Compliance (1-2 weeks)

**Why**: Enables ecosystem compatibility and future blocks.

**Tasks**:
1. Research Block Protocol Graph Module spec deeply
2. Design entity type system (map source types → entity types)
3. Implement message handlers for all CRUD operations
4. Add subgraph construction with link support
5. Temporal query support (entity versioning)

### Non-Goals (Out of Scope)

- ❌ Real-time collaboration (operational transforms)
- ❌ Distributed systems (multi-host sync)
- ❌ Persistent query caching (Redis/Memcached)
- ❌ Advanced full-text search (Elasticsearch integration)

---

## 9. Migration Path

### Phase 1: Adapter Pattern (Current → 1 month)
```
TableView → GraphServiceAdapter → IndexingService → CSV Files
```
- ✅ No breaking changes
- ✅ Works with existing IndexingService
- ⚠️ Limited performance (<10k entities)

### Phase 2: Enhanced IndexingService (1-3 months)
```
TableView → GraphServiceAdapter → IndexingService (with queryAPI) → CSV/DB
```
- ✅ Better performance (indexes)
- ✅ Easier to add new data sources
- ⚠️ Still not Block Protocol compliant

### Phase 3: Full Block Protocol (3-6 months)
```
TableView → Block Protocol Messages → BlockProtocolGraphModule → IndexingService → Storage
```
- ✅ Standard compliance
- ✅ Ecosystem compatibility
- ✅ Future-proof
- ⚠️ Major refactoring effort

---

## 10. Conclusion

**Current Status**: IndexingService is a well-designed file indexer but lacks query/aggregation capabilities needed by TableViewBlock.

**Immediate Action**: Implement `GraphServiceAdapter` to bridge the gap. This requires:
1. Filtering logic (property-based predicates)
2. Sorting logic (multi-column comparators)
3. Pagination logic (offset/limit calculations)
4. API translation (IndexingService ↔ TableViewGraphService)

**Long-Term Vision**: Evolve IndexingService into Block Protocol-compliant graph service with:
- Standard message handlers
- Entity type system
- Link/relationship support
- Query optimization (indexes, caching)
- Scalability (DB backend option)

**Effort Estimate**:
- Adapter implementation: 1-2 days
- Testing & documentation: 1 day
- **Total for MVP**: 2-3 days

**Risk Assessment**:
- 🟢 Low: Adapter pattern is proven, non-invasive
- 🟡 Medium: Performance unknowns for large datasets
- 🔴 High: Block Protocol compliance is complex, may require architecture changes

---

## Appendix A: Block Protocol queryEntities Reference

From `@blockprotocol/graph` spec:

```typescript
interface QueryEntitiesData {
  operation: {
    multiFilter?: {
      filters: Array<{
        field: (string | number)[];     // Property path
        operator: FilterOperatorType;   // EQUALS, CONTAINS_SEGMENT, etc.
        value?: unknown;
      }>;
      operator: 'AND' | 'OR';
    };
    multiSort?: Array<{
      field: (string | number)[];
      desc?: boolean;
    }>;
  };
  graphResolveDepths?: {
    hasLeftEntity: { incoming: number; outgoing: number };
    hasRightEntity: { incoming: number; outgoing: number };
  };
}

// Response includes full subgraph
interface QueryEntitiesResult {
  data: Subgraph<EntityRootType>;  // Contains entities, entity types, temporal data
  errors?: Error[];
}
```

**Key Differences from TableView API:**
- Block Protocol uses `multiFilter` with complex nested structure
- TableView uses simpler `filters: { path, op, value }[]`
- Block Protocol returns full subgraph (includes types, links)
- TableView returns flat `{ items, pageCount, totalCount }`

**Recommendation**: Keep TableView's simpler API, implement Block Protocol later for full compliance.

---

## Appendix B: Example collectionId Resolution

**Problem**: How does `collectionId` map to IndexingService entities?

**Current Approach (CSV-centric):**
```typescript
// TableView config entity:
{
  entityId: "table-config-1",
  properties: {
    collectionId: "tasks",  // <-- User-provided collection name
    columns: [...],
    sort: [...],
    filters: [...]
  }
}

// Adapter resolves to CSV file:
const basename = `${collectionId}.csv`;  // "tasks.csv"
const entities = indexingService.getEntitiesByBasename(basename);
```

**Future Approach (Type-based):**
```typescript
// Use entity type instead of filename
const entities = indexingService.getEntitiesByType('vivafolio/task-entity');
```

**Hybrid Approach:**
```typescript
// Support both for flexibility
if (collectionId.endsWith('.csv')) {
  // File-based
  entities = indexingService.getEntitiesByBasename(collectionId);
} else {
  // Type-based
  entities = indexingService.getEntitiesByType(collectionId);
}
```

