/**
 * @vivafolio/block-loader
 *
 * Secure Block Protocol loader for Vivafolio webviews with integrity checking and dependency sandboxing.
 *
 * This package provides the block loading functionality that runs inside each VS Code webview,
 * implementing the security model described in the BlockProtocol-in-Vivafolio.md specification.
 */

export { VivafolioBlockLoader } from './BlockLoader'
export type {
  BlockLoader,
  BlockLoaderFactory,
  BlockLoaderOptions,
  BlockLoaderDiagnostics,
  VivafolioBlockNotification,
  BlockResource,
  Entity,
  EntityGraph,
  HtmlTemplateHandlers,
  HookData,
  HookResponse,
  NestedBlockOptions,
  MiniHost
} from './types'
export { DEFAULT_ALLOWED_DEPENDENCIES } from './types'
export * from './hooks'

// Factory function for creating block loaders
export function createBlockLoader(options?: import('./types').BlockLoaderOptions): import('./types').BlockLoader {
  // This would need a proper notification to initialize
  // For now, return null - actual usage would require proper initialization
  throw new Error('createBlockLoader requires a VivafolioBlockNotification. Use VivafolioBlockLoader constructor directly.')
}

// Version info
export const VERSION = '0.1.0'
