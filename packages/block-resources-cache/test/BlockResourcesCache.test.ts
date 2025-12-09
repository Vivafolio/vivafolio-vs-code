import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';
import { BlockResourcesCache } from '../src/BlockResourcesCache';
import { BlockIdentifier } from '../src/types';

describe('BlockResourcesCache', () => {
  let cache: BlockResourcesCache;
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = path.join(__dirname, 'test-cache-main');
    cache = new BlockResourcesCache({
      cacheDir,
      maxSize: 1024 * 1024, // 1MB
      maxEntries: 10,
    });
  });

  afterEach(async () => {
    try {
      await cache.clear();
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

    nock.cleanAll();
  });

  const mockNpmResponse = (packageName: string, version: string = '1.0.0') => {
    const mockPackageData = {
      name: packageName,
      version,
      description: 'Mock block package',
      main: 'index.js',
      files: ['index.js', 'styles.css'],
      dist: {
        tarball: `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`,
        shasum: 'mockshasum',
      },
      'dist-tags': {
        latest: version,
      },
      versions: {
        [version]: {
          name: packageName,
          version,
          description: 'Mock block package',
          main: 'index.js',
          files: ['index.js', 'styles.css'],
          dist: {
            tarball: `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`,
            shasum: 'mockshasum',
          },
        },
      },
    };

    nock('https://registry.npmjs.org')
      .get(`/${packageName}`)
      .reply(200, mockPackageData);
  };

  const mockTarballDownload = (packageName: string, version: string = '1.0.0') => {
    nock('https://registry.npmjs.org')
      .get(`/${packageName}/-/${packageName}-${version}.tgz`)
      .reply(200, 'mock-tarball-content', {
        'content-type': 'application/octet-stream',
      });

    // Mock individual resource files based on the package's files array
    const mockFiles = ['index.js', 'styles.css'];
    mockFiles.forEach(file => {
      // Based on the regex replacement, files are accessed at: /package-name/-/filename
      nock('https://registry.npmjs.org')
        .get(`/${packageName}/-/${file}`)
        .reply(200, `mock-${file}-content`, {
          'content-type': file.endsWith('.js') ? 'application/javascript' : 'text/css',
        });
    });

    // Catch-all for any other npm registry requests (should return 404)
    nock('https://registry.npmjs.org')
      .get(() => true) // Match any other npm registry requests
      .reply(404, 'Not Found');
  };

  describe('fetchBlock', () => {
    it('should fetch block from network when not cached', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');

      const result = await cache.fetchBlock(identifier);

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(result.cacheHit).toBe(false);
      expect(result.data?.metadata.name).toBe('test-block');
      expect(result.data?.resources.has('package.tgz')).toBe(true);
    });

    it('should return cached block when available', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      // First fetch (cache miss)
      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');

      await cache.fetchBlock(identifier);

      // Second fetch (cache hit)
      const result = await cache.fetchBlock(identifier);

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.cacheHit).toBe(true);
    });

    // Increase timeout to 10 seconds for this test
    jest.setTimeout(10000);
    it('should handle network errors gracefully', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      nock('https://registry.npmjs.org')
        .get('/test-block')
        .replyWithError('Network error');

      const result = await cache.fetchBlock(identifier);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch block');
    });

    it('should handle invalid package data', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      nock('https://registry.npmjs.org')
        .get('/test-block')
        .reply(200, { invalid: 'data' });

      const result = await cache.fetchBlock(identifier);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No distribution tarball found');
    });
  });

  describe('fetchBlockMetadata', () => {
    it('should fetch metadata from network', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      mockNpmResponse('test-block', '1.0.0');

      const result = await cache.fetchBlockMetadata(identifier);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('test-block');
      expect(result.data?.version).toBe('1.0.0');
      expect(result.fromCache).toBe(false);
    });

    it('should return cached metadata when available', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      // Cache the full block first
      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');
      await cache.fetchBlock(identifier);

      // Now fetch metadata (should be from cache)
      const result = await cache.fetchBlockMetadata(identifier);

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.cacheHit).toBe(true);
    });

    it('should use latest version when no version specified', async () => {
      const identifier: BlockIdentifier = { name: 'test-block' };

      mockNpmResponse('test-block', '2.0.0');

      const result = await cache.fetchBlockMetadata(identifier);

      expect(result.success).toBe(true);
      expect(result.data?.version).toBe('2.0.0');
    });
  });

  describe('preloadBlock', () => {
    it('should preload block into cache', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');

      const result = await cache.preloadBlock(identifier);

      expect(result.success).toBe(true);

      // Verify it's cached
      const isCached = await cache.isCached(identifier);
      expect(isCached).toBe(true);
    });
  });

  describe('isCached', () => {
    it('should return true for cached blocks', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      expect(await cache.isCached(identifier)).toBe(false);

      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');
      await cache.fetchBlock(identifier);

      expect(await cache.isCached(identifier)).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');
      await cache.fetchBlock(identifier);

      expect(await cache.isCached(identifier)).toBe(true);

      await cache.clear();

      expect(await cache.isCached(identifier)).toBe(false);
    });

    it('should evict specific blocks', async () => {
      const identifier1: BlockIdentifier = { name: 'test-block-1', version: '1.0.0' };
      const identifier2: BlockIdentifier = { name: 'test-block-2', version: '1.0.0' };

      mockNpmResponse('test-block-1', '1.0.0');
      mockTarballDownload('test-block-1', '1.0.0');
      await cache.fetchBlock(identifier1);

      mockNpmResponse('test-block-2', '1.0.0');
      mockTarballDownload('test-block-2', '1.0.0');
      await cache.fetchBlock(identifier2);

      expect(await cache.isCached(identifier1)).toBe(true);
      expect(await cache.isCached(identifier2)).toBe(true);

      const evicted = await cache.evict(identifier1);
      expect(evicted).toBe(true);

      expect(await cache.isCached(identifier1)).toBe(false);
      expect(await cache.isCached(identifier2)).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should track cache statistics', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      // Cache miss - storage.get() is called twice (once in fetchBlock, once in fetchBlockMetadata)
      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');
      await cache.fetchBlock(identifier);

      stats = cache.getStats();
      expect(stats.misses).toBe(2); // storage.get() called in fetchBlock and fetchBlockMetadata
      expect(stats.totalEntries).toBe(1);

      // Cache hit - storage.get() finds the cached entry
      await cache.fetchBlock(identifier);

      stats = cache.getStats();
      expect(stats.hits).toBe(1); // Only the storage.get() call in fetchBlock counts as a hit
    });

    it('should calculate hit ratio correctly', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      // First fetchBlock: 2 misses (storage.get() in fetchBlock + fetchBlockMetadata)
      // Second fetchBlock: 1 hit (storage.get() in fetchBlock finds cached entry)
      // Total: 3 storage requests, 1 hit = 33.3% hit ratio
      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');

      await cache.fetchBlock(identifier); // 2 misses from storage.get() calls
      await cache.fetchBlock(identifier); // 1 hit from storage.get()

      const hitRatio = cache.getHitRatio();
      expect(hitRatio).toBeCloseTo(0.333, 2); // 1 hit out of 3 total storage requests
    });
  });

  describe('integrity verification', () => {
    it('should verify integrity of cached blocks', async () => {
      const identifier: BlockIdentifier = { name: 'test-block', version: '1.0.0' };

      mockNpmResponse('test-block', '1.0.0');
      mockTarballDownload('test-block', '1.0.0');
      await cache.fetchBlock(identifier);

      const isValid = await cache.verifyIntegrity(identifier);
      expect(isValid).toBe(true);
    });
  });
});
