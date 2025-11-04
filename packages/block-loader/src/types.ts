/**
 * Core types for the Vivafolio Block Loader
 * These types define the public API for loading and managing Block Protocol blocks in webviews
 */
import type { VivafolioBlockNotification, BlockResource, Entity, EntityGraph, LinkEntity } from '@vivafolio/block-core';
export type { VivafolioBlockNotification, BlockResource, Entity, EntityGraph, LinkEntity } from '@vivafolio/block-core';

// Entity, EntityGraph, BlockResource, VivafolioBlockNotification now come from @vivafolio/block-core

export interface BlockLoaderDiagnostics {
  bundleUrl: string
  evaluatedAt: string
  integritySha256?: string | null
  requiredDependencies: string[]
  blockedDependencies: string[]
  allowedDependencies: string[]
  localModules?: Array<{
    logicalName: string
    type: 'js' | 'css'
    integritySha256?: string | null
  }>
}

// Block identifier for cache operations
// Reuse canonical cache types from block-resources-cache (local path to dist to avoid resolver issues)
import type { BlockIdentifier } from '../../block-resources-cache/dist/types';
import type { BlockResourcesCache as CanonicalBlockResourcesCache } from '../../block-resources-cache/dist/index';

// Alias for backwards compatibility within block-loader public API
export type { BlockIdentifier } from '../../block-resources-cache/dist/types';
export type BlockResourcesCache = CanonicalBlockResourcesCache;

export interface BlockLoaderOptions {
  allowedDependencies?: Set<string>
  enableIntegrityChecking?: boolean
  enableDiagnostics?: boolean
  onBlockUpdate?: (payload: { entityId: string; properties: Record<string, unknown> }) => void
  resourcesCache?: BlockResourcesCache
}

export interface HtmlTemplateHandlers {
  setEntity: (entity: Entity) => void
  setReadonly: (readonly: boolean) => void
}

export interface HookData {
  node: HTMLElement | null
  type: string
  path: (string | number)[]
  hookId: string | null
  entityId: string
}

export interface HookResponse {
  hookId: string
}

export interface NestedBlockOptions {
  entityId: string
  entityTypeId: string
  container: HTMLElement
  onBlockUpdate?: (payload: { entityId: string; properties: Record<string, unknown> }) => void
}

export interface MiniHost {
  handleHookMessage: (data: HookData) => Promise<HookResponse | null>
  mountNestedBlock: (options: NestedBlockOptions) => Promise<HTMLElement>
  unmountNestedBlock: (entityId: string) => void
}

export interface BlockLoader {
  loadBlock(notification: VivafolioBlockNotification, container: HTMLElement): Promise<HTMLElement>
  updateBlock(notification: VivafolioBlockNotification): void
  destroy(): void
  getDiagnostics(): BlockLoaderDiagnostics | null
  getMiniHost(): MiniHost
}

export interface BlockLoaderFactory {
  createLoader(options?: BlockLoaderOptions): BlockLoader
}

// Default allowed dependencies (matches Block Protocol security model)
export const DEFAULT_ALLOWED_DEPENDENCIES = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@blockprotocol/graph',
  '@blockprotocol/graph/stdlib',
  '@blockprotocol/graph/custom-element',
  'solid-js',
  'solid-js/web',
  'solid-js/store'
])
