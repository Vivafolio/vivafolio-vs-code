export interface BlockMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  keywords?: string[];
  main?: string;
  module?: string;
  types?: string;
  files?: string[];
  dist?: {
    tarball: string;
    shasum?: string;
    integrity?: string;
    [key: string]: any;
  };
  'dist-tags'?: {
    latest?: string;
    [key: string]: string | undefined;
  };
  versions?: {
    [version: string]: BlockMetadata;
  };
  blockprotocol?: {
    blockType?: {
      entryPoint?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any; // Allow additional properties from NPM
}

export interface BlockResource {
  url: string;
  content: string;
  contentType: string;
  sha256: string;
  size: number;
  lastModified?: string;
  etag?: string;
}

export interface CacheEntry {
  metadata: BlockMetadata;
  resources: Map<string, BlockResource>;
  cachedAt: Date;
  expiresAt?: Date;
  version: string;
  integrity: string; // SHA-256 of the entire block package
}

export interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  ttl: number; // Time to live in milliseconds
  maxEntries: number; // Maximum number of entries
  cacheDir?: string; // Directory for persistent storage
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hits: number;
  misses: number;
  evictions: number;
  lastCleanup: Date;
}

export interface FetchOptions {
  timeout?: number;
  retries?: number;
  userAgent?: string;
  headers?: Record<string, string>;
}

export interface CacheResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;
  cacheHit?: boolean;
}

export type BlockIdentifier = {
  name: string;
  version?: string;
  registry?: string;
};
