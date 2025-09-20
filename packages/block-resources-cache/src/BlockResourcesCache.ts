import * as crypto from 'crypto';
import * as semver from 'semver';
import { HttpClient } from './HttpClient';
import { CacheStorage } from './CacheStorage';
import {
  BlockIdentifier,
  BlockMetadata,
  BlockResource,
  CacheConfig,
  CacheResult,
  CacheStats,
  FetchOptions
} from './types';

export class BlockResourcesCache {
  private httpClient: HttpClient;
  private storage: CacheStorage;
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB
      ttl: config.ttl || 24 * 60 * 60 * 1000, // 24 hours
      maxEntries: config.maxEntries || 1000,
      cacheDir: config.cacheDir,
    };

    this.httpClient = new HttpClient();
    this.storage = new CacheStorage(this.config);
  }

  /**
   * Fetch a block and all its resources, using cache when available
   */
  async fetchBlock(
    identifier: BlockIdentifier,
    options: FetchOptions = {}
  ): Promise<CacheResult<{
    metadata: BlockMetadata;
    resources: Map<string, BlockResource>;
  }>> {
    try {
      // Check cache first
      const cachedEntry = await this.storage.get(identifier);
      if (cachedEntry) {
        return {
          success: true,
          data: {
            metadata: cachedEntry.metadata,
            resources: cachedEntry.resources,
          },
          fromCache: true,
          cacheHit: true,
        };
      }

      // Cache miss - fetch from network
      const result = await this.fetchBlockFromNetwork(identifier, options);

      if (result.success && result.data) {
        // Store in cache for future use
        await this.storage.set(identifier, {
          metadata: result.data.metadata,
          resources: result.data.resources,
          cachedAt: new Date(),
          version: result.data.metadata.version,
          integrity: this.calculateEntryIntegrity(result.data.metadata, result.data.resources, new Date(), undefined),
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch block ${identifier.name}: ${error}`,
      };
    }
  }

  /**
   * Fetch block metadata only (for version checking, etc.)
   */
  async fetchBlockMetadata(
    identifier: BlockIdentifier,
    options: FetchOptions = {}
  ): Promise<CacheResult<BlockMetadata>> {
    try {
      // Check if we have the full block cached
      const cachedEntry = await this.storage.get(identifier);
      if (cachedEntry) {
        return {
          success: true,
          data: cachedEntry.metadata,
          fromCache: true,
          cacheHit: true,
        };
      }

      // Fetch metadata from network
      const registryUrl = identifier.registry || 'https://registry.npmjs.org';
      const metadataUrl = `${registryUrl}/${identifier.name}`;

      const metadata = await this.httpClient.fetchJson<BlockMetadata>(metadataUrl, options);

      // If no specific version requested, use latest
      if (!identifier.version) {
        identifier.version = metadata['dist-tags']?.latest || metadata.version;
      }

      // Get version-specific metadata
      if (identifier.version && metadata.versions?.[identifier.version]) {
        const versionMetadata = metadata.versions[identifier.version];
        return {
          success: true,
          data: versionMetadata,
          fromCache: false,
          cacheHit: false,
        };
      }

      return {
        success: true,
        data: metadata,
        fromCache: false,
        cacheHit: false,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch block metadata ${identifier.name}: ${error}`,
      };
    }
  }

  /**
   * Preload a block into cache
   */
  async preloadBlock(
    identifier: BlockIdentifier,
    options: FetchOptions = {}
  ): Promise<CacheResult<void>> {
    const result = await this.fetchBlock(identifier, options);
    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Check if a block is available in cache
   */
  async isCached(identifier: BlockIdentifier): Promise<boolean> {
    const entry = await this.storage.get(identifier);
    return entry !== null;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.storage.getStats();
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Remove a specific block from cache
   */
  async evict(identifier: BlockIdentifier): Promise<boolean> {
    return await this.storage.delete(identifier);
  }

  /**
   * Cleanup expired and orphaned cache entries
   */
  async cleanup(): Promise<void> {
    await this.storage.cleanup();
  }

  /**
   * Get cache hit ratio
   */
  getHitRatio(): number {
    const stats = this.getStats();
    const total = stats.hits + stats.misses;
    return total > 0 ? stats.hits / total : 0;
  }

  private async fetchBlockFromNetwork(
    identifier: BlockIdentifier,
    options: FetchOptions
  ): Promise<CacheResult<{
    metadata: BlockMetadata;
    resources: Map<string, BlockResource>;
  }>> {
    try {
      // First fetch metadata
      const metadataResult = await this.fetchBlockMetadata(identifier, options);
      if (!metadataResult.success || !metadataResult.data) {
        return metadataResult as CacheResult<any>;
      }

      const metadata = metadataResult.data;
      const resources = new Map<string, BlockResource>();

      // If no dist information, try to construct URLs
      if (!metadata.dist?.tarball) {
        return {
          success: false,
          error: `No distribution tarball found for ${identifier.name}@${identifier.version}`,
        };
      }

      // Download the main tarball
      const tarballUrl = metadata.dist.tarball;
      const tarballResource = await this.httpClient.fetchResource(tarballUrl, options);
      resources.set('package.tgz', tarballResource);

      // Download additional resources if specified
      if (metadata.files) {
        // Note: In real npm registries, individual files are not served separately.
        // They are only available inside the tarball. This is a simulation for testing.
        const baseUrl = tarballUrl.replace(/\/[^\/]+$/, ''); // Remove filename from URL

        for (const file of metadata.files) {
          try {
            const fileUrl = `${baseUrl}/${file}`;
            console.log(`[BlockResourcesCache] Attempting to fetch: ${fileUrl}`);
            try {
              const fileResource = await this.httpClient.fetchResource(fileUrl, options);
              resources.set(file, fileResource);
              console.log(`[BlockResourcesCache] Successfully fetched: ${file}`);
            } catch (error) {
              console.log(`[BlockResourcesCache] Failed to fetch ${file}:`, error);
              // Don't re-throw - continue with other files
            }
          } catch (error) {
            // Some files might not be accessible, continue with others
            console.warn(`Failed to fetch resource ${file}:`, error);
          }
        }
      }

      return {
        success: true,
        data: {
          metadata,
          resources,
        },
        fromCache: false,
        cacheHit: false,
      };
    } catch (error) {
      return {
        success: false,
        error: `Network fetch failed for ${identifier.name}: ${error}`,
      };
    }
  }

  private calculateEntryIntegrity(
    metadata: BlockMetadata,
    resources: Map<string, BlockResource>,
    cachedAt?: Date,
    expiresAt?: Date
  ): string {
    // Handle case where resources might be a plain object (from JSON parsing) instead of a Map
    let resourcesArray: [string, any][];
    if (resources instanceof Map) {
      resourcesArray = Array.from(resources.entries());
    } else if (typeof resources === 'object' && resources !== null) {
      // Convert plain object back to entries array
      resourcesArray = Object.entries(resources);
    } else {
      resourcesArray = [];
    }

    // Ensure consistent serialization of dates
    const normalizedEntry = {
      metadata,
      resources: resourcesArray,
      version: metadata.version,
      cachedAt: cachedAt instanceof Date ? cachedAt.toISOString() : cachedAt,
      expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
    };

    const entryData = JSON.stringify(normalizedEntry);
    return crypto.createHash('sha256').update(entryData).digest('hex');
  }

  /**
   * Verify integrity of cached block resources
   */
  async verifyIntegrity(identifier: BlockIdentifier): Promise<boolean> {
    try {
      const entry = await this.storage.get(identifier);
      if (!entry) {
        return false;
      }

      // Recalculate integrity
      const expectedIntegrity = this.calculateEntryIntegrity(
        entry.metadata,
        entry.resources,
        entry.cachedAt,
        entry.expiresAt
      );
      return expectedIntegrity === entry.integrity;
    } catch {
      return false;
    }
  }
}
