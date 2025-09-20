# @vivafolio/block-resources-cache

A centralized caching system for Block Protocol block resources with integrity verification and cross-webview sharing capabilities.

## Features

- **Cache-First Loading**: Automatically serves cached resources when available, falling back to network requests
- **Integrity Verification**: SHA-256 verification ensures cached resources haven't been tampered with
- **Automatic Cache Management**: Configurable TTL, size limits, and eviction policies
- **Persistent Storage**: Survives application restarts with on-disk persistence
- **Cross-WebView Sharing**: Multiple webviews can share the same cached resources
- **HTTP Retry Logic**: Robust network request handling with configurable retries
- **Performance Monitoring**: Built-in statistics and hit ratio tracking

## Installation

```bash
npm install @vivafolio/block-resources-cache
```

## Quick Start

```typescript
import { BlockResourcesCache } from '@vivafolio/block-resources-cache';

// Create cache instance with custom configuration
const cache = new BlockResourcesCache({
  maxSize: 100 * 1024 * 1024, // 100MB
  ttl: 24 * 60 * 60 * 1000,   // 24 hours
  maxEntries: 1000,
  cacheDir: './my-cache',      // Custom cache directory
});

// Fetch a block and all its resources
const result = await cache.fetchBlock({
  name: '@blockprotocol/test-block',
  version: '1.0.0',
});

if (result.success) {
  console.log('Block metadata:', result.data.metadata);
  console.log('Block resources:', Array.from(result.data.resources.keys()));
} else {
  console.error('Failed to fetch block:', result.error);
}
```

## API Reference

### BlockResourcesCache

#### Constructor

```typescript
new BlockResourcesCache(config?: Partial<CacheConfig>)
```

**Parameters:**
- `config.maxSize` (number): Maximum cache size in bytes (default: 100MB)
- `config.ttl` (number): Time-to-live in milliseconds (default: 24 hours)
- `config.maxEntries` (number): Maximum number of cached entries (default: 1000)
- `config.cacheDir` (string): Directory for persistent storage (default: `./.block-cache`)

#### Methods

##### `fetchBlock(identifier, options?)`

Fetches a complete block with all its resources, using cache when available.

```typescript
async fetchBlock(
  identifier: BlockIdentifier,
  options?: FetchOptions
): Promise<CacheResult<{ metadata: BlockMetadata; resources: Map<string, BlockResource> }>>
```

**Parameters:**
- `identifier.name` (string): Block package name
- `identifier.version` (string, optional): Specific version (defaults to 'latest')
- `identifier.registry` (string, optional): NPM registry URL (defaults to npmjs.org)

**Returns:** Promise resolving to a `CacheResult` with block data or error

##### `fetchBlockMetadata(identifier, options?)`

Fetches only the block's metadata (package.json) without downloading resources.

```typescript
async fetchBlockMetadata(
  identifier: BlockIdentifier,
  options?: FetchOptions
): Promise<CacheResult<BlockMetadata>>
```

##### `preloadBlock(identifier, options?)`

Preloads a block into cache without returning the data.

```typescript
async preloadBlock(
  identifier: BlockIdentifier,
  options?: FetchOptions
): Promise<CacheResult<void>>
```

##### `isCached(identifier)`

Checks if a block is available in the cache.

```typescript
async isCached(identifier: BlockIdentifier): Promise<boolean>
```

##### `verifyIntegrity(identifier)`

Verifies the integrity of a cached block's resources.

```typescript
async verifyIntegrity(identifier: BlockIdentifier): Promise<boolean>
```

##### `evict(identifier)`

Removes a specific block from the cache.

```typescript
async evict(identifier: BlockIdentifier): Promise<boolean>
```

##### `clear()`

Clears all cached entries.

```typescript
async clear(): Promise<void>
```

##### `cleanup()`

Cleans up expired and orphaned cache entries.

```typescript
async cleanup(): Promise<void>
```

##### `getStats()`

Returns cache statistics.

```typescript
getStats(): CacheStats
```

**Returns:**
```typescript
{
  totalEntries: number;
  totalSize: number;
  hits: number;
  misses: number;
  evictions: number;
  lastCleanup: Date;
}
```

##### `getHitRatio()`

Returns the cache hit ratio (hits / total requests).

```typescript
getHitRatio(): number
```

## Configuration

### CacheConfig

```typescript
interface CacheConfig {
  maxSize: number;     // Maximum cache size in bytes
  ttl: number;         // Cache entry TTL in milliseconds
  maxEntries: number;  // Maximum number of entries
  cacheDir?: string;   // Cache directory path
}
```

### FetchOptions

```typescript
interface FetchOptions {
  timeout?: number;     // Request timeout in milliseconds
  retries?: number;     // Number of retry attempts
  userAgent?: string;   // HTTP User-Agent header
  headers?: Record<string, string>; // Additional HTTP headers
}
```

## Cache Strategy

1. **Cache-First**: Always check cache before making network requests
2. **Integrity Verification**: SHA-256 hashes ensure resource integrity
3. **Automatic Eviction**: LRU eviction when cache limits are exceeded
4. **TTL Expiration**: Entries automatically expire based on configured TTL
5. **Persistent Storage**: Cache survives application restarts

## Error Handling

All methods return a `CacheResult` object:

```typescript
interface CacheResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;   // Whether result came from cache
  cacheHit?: boolean;    // Whether it was a cache hit
}
```

## Performance Monitoring

The cache provides built-in performance tracking:

```typescript
const stats = cache.getStats();
console.log(`Cache hit ratio: ${(cache.getHitRatio() * 100).toFixed(1)}%`);
console.log(`Total cached: ${stats.totalEntries} entries, ${stats.totalSize} bytes`);
```

## Integration with Block Loader

This cache is designed to integrate seamlessly with `@vivafolio/block-loader`:

```typescript
import { BlockLoader } from '@vivafolio/block-loader';
import { BlockResourcesCache } from '@vivafolio/block-resources-cache';

const cache = new BlockResourcesCache();
const loader = new BlockLoader({
  resourcesCache: cache,
});

// Blocks will now use the cache automatically
await loader.loadBlock('@blockprotocol/my-block');
```

## Testing

```bash
npm test
```

Tests include:
- HTTP client functionality and retry logic
- Cache storage operations and persistence
- Cache hit/miss ratios and statistics
- Integrity verification
- Error handling and edge cases

## License

MIT
