import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import NodeCache from 'node-cache';
import { CacheEntry, CacheConfig, CacheStats, BlockIdentifier } from './types';

export class CacheStorage {
  private memoryCache: NodeCache;
  private cacheDir: string;
  private config: CacheConfig;
  private stats: CacheStats;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB default
      ttl: config.ttl || 24 * 60 * 60 * 1000, // 24 hours default
      maxEntries: config.maxEntries || 1000,
      cacheDir: config.cacheDir || path.join(process.cwd(), '.block-cache'),
    };

    // Initialize cacheDir from config (config.cacheDir is guaranteed to be set above)
    this.cacheDir = this.config.cacheDir!;

    this.memoryCache = new NodeCache({
      stdTTL: this.config.ttl / 1000,
      checkperiod: 600, // Check for expired entries every 10 minutes
      maxKeys: this.config.maxEntries,
    });

    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      lastCleanup: new Date(),
    };

    // Ensure cache directory exists synchronously
    this.ensureCacheDirSync();
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.access(this.cacheDir);
    } catch {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  private ensureCacheDirSync(): void {
    try {
      // Use synchronous fs methods for constructor
      const fsSync = require('fs');
      if (!fsSync.existsSync(this.cacheDir)) {
        fsSync.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (error) {
      console.warn(`Failed to create cache directory ${this.cacheDir}:`, error);
    }
  }

  private getCacheKey(identifier: BlockIdentifier): string {
    const version = identifier.version || 'latest';
    const registry = identifier.registry || 'npm';
    return `${registry}:${identifier.name}@${version}`;
  }

  private getCacheFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9@\-_.]/g, '_');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  async get(identifier: BlockIdentifier): Promise<CacheEntry | null> {
    const key = this.getCacheKey(identifier);

    // Try memory cache first
    let entry: CacheEntry | undefined = this.memoryCache.get<CacheEntry>(key);
    if (entry) {
      this.stats.hits++;
      return entry;
    }

    // Try persistent storage
    try {
      const cacheFile = this.getCacheFilePath(key);
      const data = await fs.readFile(cacheFile, 'utf8');
      const parsedEntry = JSON.parse(data) as Omit<CacheEntry, 'integrity'>;

      // Recalculate integrity for verification
      const expectedIntegrity = this.calculateEntryIntegrity(parsedEntry as CacheEntry);
      const storedIntegrity = (parsedEntry as any).integrity;

      if (expectedIntegrity === storedIntegrity || !storedIntegrity) {
        // Restore integrity field
        const completeEntry: CacheEntry = {
          ...parsedEntry,
          integrity: expectedIntegrity,
        };

        // Check if entry has expired
        if (!completeEntry.expiresAt || new Date(completeEntry.expiresAt) > new Date()) {
          this.memoryCache.set(key, completeEntry);
          this.stats.hits++;
          return completeEntry;
        } else {
          // Remove expired entry
          await this.delete(identifier);
        }
      } else {
        // Integrity check failed, remove corrupted entry
        await this.delete(identifier);
      }
    } catch {
      // File doesn't exist or is corrupted
    }

    this.stats.misses++;
    return null;
  }

  async set(identifier: BlockIdentifier, entry: CacheEntry): Promise<void> {
    const key = this.getCacheKey(identifier);

    // Calculate total size of entry
    const entrySize = this.calculateEntrySize(entry);

    // Check if we need to evict entries
    if (this.stats.totalSize + entrySize > this.config.maxSize) {
      await this.evictEntries(entrySize);
    }

    // Set expiration
    entry.expiresAt = new Date(Date.now() + this.config.ttl);

    // Calculate and set integrity hash
    entry.integrity = this.calculateEntryIntegrity(entry);

    // Store in memory
    this.memoryCache.set(key, entry);

    // Store persistently (exclude integrity from serialization)
    try {
      const cacheFile = this.getCacheFilePath(key);
      const { integrity, ...entryForStorage } = entry; // Exclude integrity using destructuring
      await fs.writeFile(cacheFile, JSON.stringify(entryForStorage, null, 2));
    } catch (error) {
      console.warn(`Failed to persist cache entry ${key}:`, error);
    }

    this.stats.totalEntries++;
    this.stats.totalSize += entrySize;
  }

  async delete(identifier: BlockIdentifier): Promise<boolean> {
    const key = this.getCacheKey(identifier);

    // Remove from memory
    const memoryDeleted = this.memoryCache.del(key);

    // Remove from disk
    let diskDeleted = false;
    try {
      const cacheFile = this.getCacheFilePath(key);
      await fs.unlink(cacheFile);
      diskDeleted = true;
    } catch {
      // File doesn't exist
    }

    if (memoryDeleted || diskDeleted) {
      this.stats.totalEntries = Math.max(0, this.stats.totalEntries - 1);
      return true;
    }

    return false;
  }

  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.flushAll();

    // Clear disk cache
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
    } catch (error) {
      console.warn('Failed to clear disk cache:', error);
    }

    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      lastCleanup: new Date(),
    };
  }

  private async evictEntries(requiredSpace: number): Promise<void> {
    // Simple LRU eviction - remove oldest entries until we have enough space
    const keys = this.memoryCache.keys();
    const entries = keys.map((key: string) => ({
      key,
      entry: this.memoryCache.get<CacheEntry>(key),
    })).filter((item: { key: string; entry: CacheEntry | undefined }) => item.entry) as Array<{ key: string; entry: CacheEntry }>;

    // Sort by cache time (oldest first)
    entries.sort((a, b) => a.entry.cachedAt.getTime() - b.entry.cachedAt.getTime());

    let freedSpace = 0;
    for (const { key, entry } of entries) {
      if (this.stats.totalSize - freedSpace + requiredSpace <= this.config.maxSize) {
        break;
      }

      this.memoryCache.del(key);
      try {
        const cacheFile = this.getCacheFilePath(key);
        await fs.unlink(cacheFile);
      } catch {
        // File doesn't exist
      }

      freedSpace += this.calculateEntrySize(entry);
      this.stats.evictions++;
    }

    this.stats.totalSize -= freedSpace;
    this.stats.totalEntries -= entries.length;
  }

  private calculateEntrySize(entry: CacheEntry): number {
    let size = 0;

    // Estimate metadata size
    size += JSON.stringify(entry.metadata).length;

    // Add resource sizes
    for (const resource of entry.resources.values()) {
      size += resource.size;
    }

    // Add overhead for cache structure
    size += JSON.stringify({
      cachedAt: entry.cachedAt,
      expiresAt: entry.expiresAt,
      version: entry.version,
      integrity: entry.integrity,
    }).length;

    return size;
  }

  private calculateEntryIntegrity(entry: CacheEntry): string {
    // Calculate the entry's integrity hash
    // Handle case where resources might be a plain object (from JSON parsing) instead of a Map
    let resourcesArray: [string, any][];
    if (entry.resources instanceof Map) {
      resourcesArray = Array.from(entry.resources.entries());
    } else if (typeof entry.resources === 'object' && entry.resources !== null) {
      // Convert plain object back to entries array
      resourcesArray = Object.entries(entry.resources);
    } else {
      resourcesArray = [];
    }

    // Ensure consistent serialization of dates
    const normalizedEntry = {
      metadata: entry.metadata,
      resources: resourcesArray,
      version: entry.version,
      cachedAt: entry.cachedAt instanceof Date ? entry.cachedAt.toISOString() : entry.cachedAt,
      expiresAt: entry.expiresAt instanceof Date ? entry.expiresAt.toISOString() : entry.expiresAt,
    };

    const entryData = JSON.stringify(normalizedEntry);

    return crypto.createHash('sha256').update(entryData).digest('hex');
  }

  private verifyEntryIntegrity(entry: CacheEntry): boolean {
    try {
      // Verify the entry's integrity hash
      const calculatedHash = this.calculateEntryIntegrity(entry);
      return calculatedHash === entry.integrity;
    } catch {
      return false;
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  async cleanup(): Promise<void> {
    // Clean up expired entries from memory (handled by NodeCache)
    // Clean up orphaned files on disk
    try {
      const files = await fs.readdir(this.cacheDir);
      const memoryKeys = new Set(this.memoryCache.keys());

      for (const file of files) {
        if (file.endsWith('.json')) {
          const key = file.replace('.json', '').replace(/_/g, ':');
          if (!memoryKeys.has(key)) {
            // Check if file exists in memory cache with original key format
            const originalKey = key.replace(/:/g, '/').replace('@', '/');
            if (!memoryKeys.has(originalKey)) {
              await fs.unlink(path.join(this.cacheDir, file));
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup orphaned cache files:', error);
    }

    this.stats.lastCleanup = new Date();
  }
}
