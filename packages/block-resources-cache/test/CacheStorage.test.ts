import * as fs from 'fs';
import * as path from 'path';
import { CacheStorage } from '../src/CacheStorage';
import { BlockIdentifier, CacheEntry, BlockMetadata, BlockResource } from '../src/types';

describe('CacheStorage', () => {
  let storage: CacheStorage;
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = path.join(__dirname, 'test-cache');
    storage = new CacheStorage({
      cacheDir,
      maxSize: 1024 * 1024, // 1MB
      maxEntries: 10,
    });
  });

  afterEach(async () => {
    try {
      await storage.clear();
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean up test cache directory
    try {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn('Failed to cleanup test cache directory:', error);
    }
  });

  const createMockEntry = (): CacheEntry => {
    const metadata: BlockMetadata = {
      name: 'test-block',
      version: '1.0.0',
      description: 'Test block',
    };

    const resources = new Map<string, BlockResource>();
    resources.set('index.js', {
      url: 'https://example.com/index.js',
      content: 'console.log("Hello");',
      contentType: 'application/javascript',
      sha256: 'abc123',
      size: 21,
    });

    return {
      metadata,
      resources,
      cachedAt: new Date(),
      version: '1.0.0',
      integrity: '', // Will be set by set() method
    };
  };

  const createMockIdentifier = (): BlockIdentifier => ({
    name: 'test-block',
    version: '1.0.0',
  });

  describe('set and get', () => {
    it('should store and retrieve entries correctly', async () => {
      const identifier = createMockIdentifier();
      const entry = createMockEntry();

      await storage.set(identifier, entry);
      const retrieved = await storage.get(identifier);

      expect(retrieved).toBeTruthy();
      expect(retrieved!.metadata.name).toBe('test-block');
      expect(retrieved!.version).toBe('1.0.0');
    });

    it('should return null for non-existent entries', async () => {
      const identifier = createMockIdentifier();
      const result = await storage.get(identifier);

      expect(result).toBeNull();
    });

    it('should handle different versions separately', async () => {
      const identifier1 = { name: 'test-block', version: '1.0.0' };
      const identifier2 = { name: 'test-block', version: '2.0.0' };

      const entry1 = createMockEntry();
      const entry2 = { ...createMockEntry(), version: '2.0.0' };

      await storage.set(identifier1, entry1);
      await storage.set(identifier2, entry2);

      const retrieved1 = await storage.get(identifier1);
      const retrieved2 = await storage.get(identifier2);

      expect(retrieved1!.version).toBe('1.0.0');
      expect(retrieved2!.version).toBe('2.0.0');
    });
  });

  describe('delete', () => {
    it('should delete existing entries', async () => {
      const identifier = createMockIdentifier();
      const entry = createMockEntry();

      await storage.set(identifier, entry);
      expect(await storage.get(identifier)).toBeTruthy();

      const deleted = await storage.delete(identifier);
      expect(deleted).toBe(true);
      expect(await storage.get(identifier)).toBeNull();
    });

    it('should return false for non-existent entries', async () => {
      const identifier = createMockIdentifier();
      const deleted = await storage.delete(identifier);

      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      const identifier1 = { name: 'block1', version: '1.0.0' };
      const identifier2 = { name: 'block2', version: '1.0.0' };

      await storage.set(identifier1, createMockEntry());
      await storage.set(identifier2, createMockEntry());

      expect(await storage.get(identifier1)).toBeTruthy();
      expect(await storage.get(identifier2)).toBeTruthy();

      await storage.clear();

      expect(await storage.get(identifier1)).toBeNull();
      expect(await storage.get(identifier2)).toBeNull();

      const stats = storage.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('stats', () => {
    it('should track cache statistics correctly', async () => {
      const stats = storage.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      const identifier = createMockIdentifier();
      const entry = createMockEntry();

      // Cache miss
      await storage.get(identifier);
      let updatedStats = storage.getStats();
      expect(updatedStats.misses).toBe(1);

      // Cache set
      await storage.set(identifier, entry);
      updatedStats = storage.getStats();
      expect(updatedStats.totalEntries).toBe(1);

      // Cache hit
      await storage.get(identifier);
      updatedStats = storage.getStats();
      expect(updatedStats.hits).toBe(1);
    });

    it('should calculate hit ratio correctly', async () => {
      // This would be tested on the main cache class
      // but we can verify stats are tracked
      const identifier = createMockIdentifier();

      // 2 misses, 1 hit
      await storage.get(identifier); // miss
      await storage.get(identifier); // miss
      await storage.set(identifier, createMockEntry());
      await storage.get(identifier); // hit

      const stats = storage.getStats();
      expect(stats.misses).toBe(2);
      expect(stats.hits).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist entries to disk and restore them', async () => {
      const identifier = createMockIdentifier();
      const entry = createMockEntry();

      // Set the entry
      await storage.set(identifier, entry);

      // Check if it exists in the current storage
      const original = await storage.get(identifier);
      expect(original).toBeTruthy();

      // Create new storage instance (simulating app restart)
      const newStorage = new CacheStorage({ cacheDir });

      const retrieved = await newStorage.get(identifier);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.metadata.name).toBe('test-block');
    });
  });

  describe('cleanup', () => {
    it('should cleanup expired entries', async () => {
      // Create storage with very short TTL
      const tempStorage = new CacheStorage({
        cacheDir: path.join(cacheDir, 'temp'),
        ttl: 100, // 100ms
      });

      const identifier = createMockIdentifier();
      const entry = createMockEntry();

      await tempStorage.set(identifier, entry);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 200));

      // Entry should be expired
      const retrieved = await tempStorage.get(identifier);
      expect(retrieved).toBeNull();
    });
  });
});
