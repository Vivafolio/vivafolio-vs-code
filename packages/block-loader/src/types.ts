/**
 * Core types for the Vivafolio Block Loader
 * These types define the public API for loading and managing Block Protocol blocks in webviews
 */

export interface Entity {
  entityId: string
  properties: Record<string, unknown>
}

export interface EntityGraph {
  entities: Entity[]
  links: Array<Record<string, unknown>>
}

export interface BlockResource {
  logicalName: string
  physicalPath: string
  cachingTag?: string
}

export interface VivafolioBlockNotification {
  blockId: string
  blockType: string
  displayMode: 'multi-line' | 'inline'
  sourceUri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  entityId?: string
  resources: BlockResource[]
  entityGraph: EntityGraph
}

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

export interface BlockLoaderOptions {
  allowedDependencies?: Set<string>
  enableIntegrityChecking?: boolean
  enableDiagnostics?: boolean
  onBlockUpdate?: (payload: { entityId: string; properties: Record<string, unknown> }) => void
}

export interface HtmlTemplateHandlers {
  setEntity: (entity: Entity) => void
  setReadonly: (readonly: boolean) => void
}

export interface BlockLoader {
  loadBlock(notification: VivafolioBlockNotification, container: HTMLElement): Promise<HTMLElement>
  updateBlock(notification: VivafolioBlockNotification): void
  destroy(): void
  getDiagnostics(): BlockLoaderDiagnostics | null
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
  '@blockprotocol/graph/custom-element'
])
