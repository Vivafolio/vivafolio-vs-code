// =============================================================================
// Vivafolio Block Protocol Framework Types
// =============================================================================
// This file contains comprehensive TypeScript definitions for Block Protocol
// integration across all supported frameworks (SolidJS, Vue, Svelte, Lit, Angular)
//
// Usage: Import these types in your framework-specific implementations
// =============================================================================

/**
 * Core Block Protocol Entity Types
 */
export interface Entity {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
  metadata?: {
    recordId?: {
      entityId: string
      editionId: string
    }
    entityTypeId?: string
    temporalVersioning?: {
      transactionTime?: {
        start: {
          kind: 'inclusive'
          limit: string
        }
        end: {
          kind: 'unbounded' | 'inclusive' | 'exclusive'
          limit?: string
        }
      }
    }
  }
}

export interface EntityType {
  entityTypeId: string
  title: string
  description?: string
  properties?: Record<string, PropertyType>
  required?: string[]
}

export interface PropertyType {
  propertyTypeId: string
  title: string
  description?: string
  dataTypeId: string
  propertyTypes?: string[]
}

/**
 * Graph Service Types
 */
export interface BlockGraph {
  depth: number
  linkedEntities: Entity[]
  linkGroups: Array<Record<string, unknown>>
}

export interface GraphService {
  blockEntity: Entity
  blockGraph: BlockGraph
  entityTypes: EntityType[]
  linkedAggregations: Array<Record<string, unknown>>
  readonly: boolean
}

/**
 * Block Protocol Messaging
 */
export interface GraphUpdateMessage {
  type: 'graph/update'
  payload: {
    blockId: string
    kind: 'updateEntity'
    entityId: string
    properties: Record<string, unknown>
  }
}

export interface GraphAckMessage {
  type: 'graph/ack'
  receivedAt: string
}

export interface VivafolioBlockNotification {
  type: 'vivafolioblock-notification'
  payload: {
    blockId: string
    blockType: string
    entityId: string
    displayMode: 'multi-line' | 'inline'
    initialGraph: EntityGraph
    supportsHotReload?: boolean
    initialHeight?: number
    resources?: Array<{
      logicalName: string
      physicalPath: string
      cachingTag?: string
    }>
  }
}

export interface EntityGraph {
  entities: Entity[]
  links: LinkEntity[]
}

export interface LinkEntity extends Entity {
  sourceEntityId?: string
  destinationEntityId?: string
}

/**
 * Framework-agnostic Block Component Types
 */
export interface BlockProps<T = {}> {
  graph: GraphService
  config?: T
}

export interface BlockMetadata {
  name: string
  version: string
  description?: string
  author?: string
  license?: string
  keywords?: string[]
  repository?: string
  homepage?: string
}

export interface BlockDefinition<T = {}> {
  metadata: BlockMetadata
  component: BlockComponent<T>
  defaultConfig?: T
}

export type BlockComponent<T = {}> = (props: BlockProps<T>) => unknown

/**
 * Common UI Component Types (Framework Agnostic)
 */
export interface BlockContainerProps {
  className?: string
  style?: Record<string, unknown>
  children?: unknown
}

export interface BlockFieldProps {
  label?: string
  required?: boolean
  error?: string
  helpText?: string
  children?: unknown
}

export interface BlockInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number' | 'url'
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  pattern?: string
  minLength?: number
  maxLength?: number
}

export interface BlockSelectProps {
  value: string | number
  onChange: (value: string | number) => void
  options: Array<{ value: string | number; label: string }>
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

export interface BlockButtonProps {
  onClick: () => void
  children?: unknown
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'small' | 'medium' | 'large'
  type?: 'button' | 'submit' | 'reset'
}

export interface BlockCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  required?: boolean
}

export interface BlockRadioProps {
  value: string
  checked: boolean
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
  name?: string
}

/**
 * Validation and Error Types
 */
export interface ValidationError {
  field: string
  message: string
  code?: string
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
}

/**
 * Framework-specific Helper Types
 */

// SolidJS specific
export interface SolidJSBlockConfig {
  reactive?: boolean
  suspense?: boolean
  errorBoundary?: boolean
}

// Vue.js specific
export interface VueBlockConfig {
  reactive?: boolean
  lifecycle?: 'composition' | 'options'
  typescript?: boolean
}

// Svelte specific
export interface SvelteBlockConfig {
  reactive?: boolean
  typescript?: boolean
  immutable?: boolean
}

// Lit specific
export interface LitBlockConfig {
  reactive?: boolean
  shadowDom?: boolean
  typescript?: boolean
}

// Angular specific
export interface AngularBlockConfig {
  reactive?: boolean
  changeDetection?: 'default' | 'onPush'
  typescript?: boolean
}

/**
 * Framework Registry Types
 */
export interface FrameworkInfo {
  name: string
  version: string
  extensions: string[]
  compiler?: string
  bundler?: string
}

export interface FrameworkRegistry {
  solidjs: FrameworkInfo
  vue: FrameworkInfo
  svelte: FrameworkInfo
  lit: FrameworkInfo
  angular: FrameworkInfo
}

/**
 * Development and Build Types
 */
export interface BuildConfig {
  framework: keyof FrameworkRegistry
  entry: string
  outDir: string
  minify?: boolean
  sourcemap?: boolean
  watch?: boolean
}

export interface DevServerConfig {
  port?: number
  host?: string
  frameworks?: (keyof FrameworkRegistry)[]
  hotReload?: boolean
  openBrowser?: boolean
}

/**
 * Hot Reload Types
 */
export interface HotReloadMessage {
  type: 'hot-reload'
  framework: string
  blockId: string
  bundle: {
    id: string
    hash: string
    entryPoint: string
    lastModified: string
  }
}

/**
 * Framework API Surface
 */
export interface FrameworkAPI {
  // Block creation
  createBlock: <T = {}>(
    component: BlockComponent<T>,
    metadata: BlockMetadata,
    config?: T
  ) => BlockDefinition<T>

  // Entity hooks
  useEntity: (graph: GraphService) => Entity
  useEntityUpdater: (graph: GraphService) => (updates: Partial<Entity['properties']>) => void

  // UI components
  BlockContainer: (props: BlockContainerProps) => unknown
  BlockField: (props: BlockFieldProps) => unknown
  BlockInput: (props: BlockInputProps) => unknown
  BlockSelect: (props: BlockSelectProps) => unknown
  BlockButton: (props: BlockButtonProps) => unknown
  BlockCheckbox: (props: BlockCheckboxProps) => unknown
  BlockRadio: (props: BlockRadioProps) => unknown

  // Validation
  validateEntity: (entity: Entity, schema?: EntityType) => ValidationResult

  // Utilities
  generateEntityId: () => string
  formatPropertyValue: (value: unknown, propertyType?: PropertyType) => string
}

/**
 * Framework-specific API extensions
 */
export interface SolidJSAPI extends FrameworkAPI {
  createSignal: <T>(initialValue: T) => [() => T, (value: T) => void]
  createEffect: (fn: () => void) => void
  onMount: (fn: () => void) => void
  onCleanup: (fn: () => void) => void
}

export interface VueAPI extends FrameworkAPI {
  ref: <T>(initialValue: T) => { value: T }
  reactive: <T extends object>(obj: T) => T
  computed: <T>(fn: () => T) => { value: T }
  onMounted: (fn: () => void) => void
  onUnmounted: (fn: () => void) => void
}

export interface SvelteAPI extends FrameworkAPI {
  writable: <T>(initialValue: T) => { subscribe: (fn: (value: T) => void) => () => void; set: (value: T) => void; update: (fn: (value: T) => T) => void }
  readable: <T>(initialValue: T, start?: (set: (value: T) => void) => () => void) => { subscribe: (fn: (value: T) => void) => () => void }
  derived: <T>(store: any, fn: (value: any) => T) => { subscribe: (fn: (value: T) => void) => () => void }
}

export interface LitAPI extends FrameworkAPI {
  html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown
  css: (strings: TemplateStringsArray, ...values: unknown[]) => unknown
  property: (options?: PropertyDeclaration) => (proto: object, name: string) => void
  state: (options?: PropertyDeclaration) => (proto: object, name: string) => void
}

export interface AngularAPI extends FrameworkAPI {
  Component: (config: ComponentConfig) => ClassDecorator
  Input: () => PropertyDecorator
  Output: () => PropertyDecorator
  ViewChild: (selector: string) => PropertyDecorator
  inject: <T>(token: any) => T
}

/**
 * Utility Types for Framework Implementations
 */
export interface PropertyDeclaration {
  type?: any
  attribute?: string | boolean
  reflect?: boolean
  hasChanged?: (value: any, oldValue: any) => boolean
}

export interface ComponentConfig {
  selector: string
  template: string
  styles?: string[]
  standalone?: boolean
  imports?: any[]
}

/**
 * Export convenience types for common use cases
 */
export type AnyFrameworkAPI = SolidJSAPI | VueAPI | SvelteAPI | LitAPI | AngularAPI
export type BlockConfig<T extends keyof FrameworkRegistry> =
  T extends 'solidjs' ? SolidJSBlockConfig :
  T extends 'vue' ? VueBlockConfig :
  T extends 'svelte' ? SvelteBlockConfig :
  T extends 'lit' ? LitBlockConfig :
  T extends 'angular' ? AngularBlockConfig :
  never

/**
 * Framework detection and compatibility
 */
export interface FrameworkCapabilities {
  supportsHotReload: boolean
  supportsTypeScript: boolean
  supportsJSX: boolean
  supportsShadowDom: boolean
  preferredBundler: string
  ecosystemSize: 'large' | 'medium' | 'small'
}

/**
 * Framework comparison matrix for documentation
 */
export const FRAMEWORK_CAPABILITIES: Record<keyof FrameworkRegistry, FrameworkCapabilities> = {
  solidjs: {
    supportsHotReload: true,
    supportsTypeScript: true,
    supportsJSX: true,
    supportsShadowDom: false,
    preferredBundler: 'Vite',
    ecosystemSize: 'small'
  },
  vue: {
    supportsHotReload: true,
    supportsTypeScript: true,
    supportsJSX: true,
    supportsShadowDom: false,
    preferredBundler: 'Vite',
    ecosystemSize: 'large'
  },
  svelte: {
    supportsHotReload: true,
    supportsTypeScript: true,
    supportsJSX: false,
    supportsShadowDom: false,
    preferredBundler: 'Vite',
    ecosystemSize: 'medium'
  },
  lit: {
    supportsHotReload: true,
    supportsTypeScript: true,
    supportsJSX: false,
    supportsShadowDom: true,
    preferredBundler: 'Rollup',
    ecosystemSize: 'small'
  },
  angular: {
    supportsHotReload: true,
    supportsTypeScript: true,
    supportsJSX: false,
    supportsShadowDom: false,
    preferredBundler: 'esbuild',
    ecosystemSize: 'large'
  }
} as const
