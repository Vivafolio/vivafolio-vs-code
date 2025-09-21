// ESM wrapper for CommonJS module
import * as mod from './index.js'
import * as hooks from './hooks.js'

export const {
  VivafolioBlockLoader,
  BlockLoader,
  DEFAULT_ALLOWED_DEPENDENCIES,
  VivafolioBlockNotification,
  BlockResource,
  Entity,
  EntityGraph,
  HtmlTemplateHandlers,
  HookData,
  HookResponse,
  NestedBlockOptions,
  MiniHost,
  createBlockLoader,
  VERSION
} = mod

// Re-export hooks explicitly
export const {
  useHook,
  useEmbedEntity,
  useGraphContext,
  useEntityUpdates
} = hooks
