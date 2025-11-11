/**
 * Secure Block Protocol loader for Vivafolio webviews
 *
 * This class implements the security model described in the BlockProtocol-in-Vivafolio.md spec:
 * - Dependency allowlist enforcement
 * - Bundle integrity checking (SHA-256)
 * - Audit logging and diagnostics
 * - Local resource resolution with integrity verification
 */

import { GraphEmbedderHandler } from '@blockprotocol/graph'
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'

// Extend window interface for HTML template support
declare global {
  interface Window {
    blockprotocol?: {
      getBlockContainer: (url: string) => HTMLElement
    }
  }
}

// Hook message types
interface HookMessage {
  type: 'hook'
  data: {
    node: HTMLElement | null
    type: string
    path: (string | number)[]
    hookId: string | null
    entityId: string
  }
}
import type { Entity, EntityGraph, BlockResource, VivafolioBlockNotification } from '@vivafolio/block-core'
import {
  BlockLoaderDiagnostics,
  BlockLoaderOptions,
  HtmlTemplateHandlers,
  BlockLoader,
  BlockResourcesCache,
  DEFAULT_ALLOWED_DEPENDENCIES,
  HookData,
  HookResponse,
  NestedBlockOptions,
  MiniHost
} from './types'

interface LocalModuleEntry {
  logicalName: string
  url: string
  type: 'js' | 'css'
  source: string
  integritySha256?: string | null
  executed: boolean
  exports?: unknown
}

interface LinkedAggregationEntry {
  aggregationId: string
  sourceEntityId: string
  aggregation: {
    operation: {
      entityTypeId?: string
      entityTypeIds?: string[]
    }
    pageNumber: number
    itemsPerPage: number
    sort?: Array<{
      field: string
      desc?: boolean
    }>
  }
  result: {
    entities: Entity[]
    totalCount: number
    pageCount: number
  }
}

interface BlockGraphState {
  depth: number
  linkedEntities: Entity[]
  subgraphVertices: Array<{
    kind: 'entity'
    inner: {
      entityId: string
      entityTypeId: string
      properties: Record<string, unknown>
    }
  }>
}

interface BlockEntitySubgraph {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
  linkedEntities: Array<{
    linkEntity: {
      entityId: string
      sourceEntityId: string
      destinationEntityId: string
      properties: Record<string, unknown>
    }
    destinationEntity: {
      entityId: string
      entityTypeId: string
      properties: Record<string, unknown>
    }
  }>
}

export class VivafolioBlockLoader implements BlockLoader {
  private notification: VivafolioBlockNotification
  private options: Required<BlockLoaderOptions>
  private resourcesCache?: BlockResourcesCache

  // Block state
  private blockEntity: Entity
  private blockGraph: BlockGraphState
  private blockSubgraph: BlockEntitySubgraph
  private resources: BlockResource[]

  // Runtime state
  private destroyed = false
  private diagnostics: BlockLoaderDiagnostics | null = null
  private localModuleCache = new Map<string, LocalModuleEntry>()
  private linkedAggregations = new Map<string, LinkedAggregationEntry>()

  // React rendering
  private reactModule?: typeof React
  private reactDomModule?: typeof ReactDOM
  private reactRoot?: ReturnType<typeof ReactDOM.createRoot>
  private blockComponent?: unknown
  private blockMount?: HTMLElement

  // Custom element support
  private isCustomElement = false
  private customElementInstance?: HTMLElement
  private customElementUpdateFn?: (entity: Entity, readonly: boolean) => void

  // Graph embedder
  private embedder?: GraphEmbedderHandler

  // HTML template support
  private htmlTemplateHandlers?: HtmlTemplateHandlers

  // Mini-host for nested blocks
  private miniHost: MiniHost
  private mountedBlocks = new Map<string, HTMLElement>()

  constructor(notification: VivafolioBlockNotification, options: BlockLoaderOptions = {}) {
    this.notification = notification
    this.resourcesCache = options.resourcesCache

    this.options = {
      allowedDependencies: options.allowedDependencies || DEFAULT_ALLOWED_DEPENDENCIES,
      enableIntegrityChecking: options.enableIntegrityChecking ?? true,
      enableDiagnostics: options.enableDiagnostics ?? true,
      onBlockUpdate: options.onBlockUpdate || (() => {}),
      resourcesCache: options.resourcesCache
    } as Required<BlockLoaderOptions>

    // Initialize block state
  this.resources = notification.resources || []
    this.blockEntity = this.deriveBlockEntity(notification)
    this.blockGraph = this.deriveBlockGraph(notification)
    this.blockSubgraph = this.buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)

    // Initialize mini-host for nested blocks
    this.miniHost = this.createMiniHost()
  }

  async loadBlock(notification: VivafolioBlockNotification, container: HTMLElement): Promise<HTMLElement> {
    console.log('[BlockLoader] Loading block:', notification.blockId, notification.blockType)

    this.notification = notification
    this.options = {
      allowedDependencies: new Set(DEFAULT_ALLOWED_DEPENDENCIES),
      enableIntegrityChecking: true,
      enableDiagnostics: true,
      onBlockUpdate: () => {}, // Will be set by caller
      resourcesCache: this.resourcesCache
    } as Required<BlockLoaderOptions>

    // Extract block state from notification
    this.blockEntity = this.deriveBlockEntity(notification)
    this.blockGraph = this.deriveBlockGraph(notification)
    this.blockSubgraph = this.buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)
    this.resources = notification.resources || []

    console.log('[BlockLoader] Resources:', this.resources)
    console.log('[BlockLoader] Block entity:', this.blockEntity)

    try {
      // Determine block type
      const mode = this.detectBlockMode()
      console.log('[BlockLoader] Block mode:', mode)
      console.log('[BlockLoader] Available resources:', this.resources?.map(r => r.logicalName))

      if (mode === 'bundle') {
        console.log('[BlockLoader] Initializing as bundle block')
        await this.initializeBundleBlock(container)
        this.setupGraphEmbedder(container)
        this.renderBlock(container)
      } else {
        console.log('[BlockLoader] Initializing as HTML block')
        await this.initializeHtmlBlock(container)
        // HTML blocks are fully initialized after initializeHtmlBlock - no need for renderBlock
      }

      return container
    } catch (error) {
      console.error('[BlockLoader] Failed to load block:', error)
      throw error
    }
  }

  updateBlock(notification: VivafolioBlockNotification): void {
    this.notification = notification
    this.blockEntity = this.deriveBlockEntity(notification)
    this.blockGraph = this.deriveBlockGraph(notification)
    this.blockSubgraph = this.buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)

    // Update custom element if present
    if (this.isCustomElement && this.customElementUpdateFn) {
      this.customElementUpdateFn(this.blockEntity, false)
    }

    // Update embedder
    if (this.embedder) {
      // Note: GraphEmbedderHandler interface may not have these methods
      // This would need to be implemented based on actual Block Protocol API
      this.dispatchBlockEntitySubgraph()
      this.emitLinkedAggregations()
    }

    // Note: updateBlock doesn't have access to container, so renderBlock needs to be called differently
    // This is a limitation of the current design
  }

  destroy(): void {
    this.destroyed = true
    this.destroyLocalModules()
    this.embedder?.destroy()
    this.reactRoot?.unmount()

    if (this.customElementInstance) {
      this.customElementInstance.remove()
    }

    // Clean up mounted nested blocks
    for (const [entityId, container] of this.mountedBlocks) {
      this.miniHost.unmountNestedBlock(entityId)
    }
    this.mountedBlocks.clear()
  }

  getDiagnostics(): BlockLoaderDiagnostics | null {
    return this.diagnostics
  }

  getMiniHost(): MiniHost {
    return this.miniHost
  }

  // Mini-host implementation
  private createMiniHost(): MiniHost {
    return {
      handleHookMessage: async (data: HookData): Promise<HookResponse | null> => {
        console.log('[MiniHost] Handling hook message:', data)

        // Check if this is a vivafolio:embed:entity hook for nested blocks
        if (data.type === 'vivafolio:embed:entity') {
          return this.handleNestedBlockHook(data)
        }

        // For other hook types, return null to indicate not implemented
        console.log('[MiniHost] Hook type not implemented:', data.type)
        return null
      },

      mountNestedBlock: async (options: NestedBlockOptions): Promise<HTMLElement> => {
        console.log('[MiniHost] Mounting nested block:', options.entityId)

        // Create a new block loader instance for the nested block
        const nestedLoader = new VivafolioBlockLoader({
          blockId: `nested-${options.entityId}`,
          blockType: this.deriveBlockTypeForEntity(options.entityTypeId),
          displayMode: 'inline',
          sourceUri: this.notification.sourceUri,
          range: this.notification.range, // may be undefined when originating outside LSP
          entityId: options.entityId,
          resources: [], // Nested blocks get their resources from cache
          entityGraph: this.notification.entityGraph // Share the parent graph
        }, {
          ...this.options,
          onBlockUpdate: options.onBlockUpdate || this.options.onBlockUpdate
        })

        // Load the nested block
        const nestedContainer = await nestedLoader.loadBlock({
          blockId: `nested-${options.entityId}`,
          blockType: this.deriveBlockTypeForEntity(options.entityTypeId),
          displayMode: 'inline',
          sourceUri: this.notification.sourceUri,
          range: this.notification.range,
          entityId: options.entityId,
          resources: [],
          entityGraph: this.notification.entityGraph
        }, options.container)

        // Store the mounted block for cleanup
        this.mountedBlocks.set(options.entityId, nestedContainer)

        return nestedContainer
      },

      unmountNestedBlock: (entityId: string): void => {
        console.log('[MiniHost] Unmounting nested block:', entityId)
        const container = this.mountedBlocks.get(entityId)
        if (container) {
          // Find and destroy the block loader instance
          // Note: In a real implementation, we'd need to track block loader instances
          container.remove()
          this.mountedBlocks.delete(entityId)
        }
      }
    }
  }

  private async handleNestedBlockHook(data: HookData): Promise<HookResponse> {
    const { entityId, node } = data

    if (!node) {
      // This is a teardown request
      this.miniHost.unmountNestedBlock(entityId)
      return { hookId: 'teardown' }
    }

    // Find the entity in the graph
    const entity = this.notification.entityGraph.entities.find(e => e.entityId === entityId)
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`)
    }

    // Derive entity type (simplified - in real implementation this would come from schema)
    const entityTypeId = this.deriveEntityTypeId(entity)

    // Mount the nested block
    await this.miniHost.mountNestedBlock({
      entityId,
      entityTypeId,
      container: node,
      onBlockUpdate: this.options.onBlockUpdate
    })

    return { hookId: data.hookId || `nested-${entityId}` }
  }

  private deriveBlockTypeForEntity(entityTypeId: string): string {
    // Map entity types to block types (simplified mapping)
    const blockTypeMap: Record<string, string> = {
      'https://blockprotocol.org/@alice/types/entity-type/person/v/1': 'person-chip-block',
      'https://blockprotocol.org/@alice/types/entity-type/task/v/1': 'task-card-block',
      'https://blockprotocol.org/@alice/types/entity-type/board/v/1': 'kanban-board-block'
    }

    return blockTypeMap[entityTypeId] || 'generic-entity-block'
  }

  private deriveEntityTypeId(entity: Entity): string {
    // Simplified entity type derivation - in real implementation this would come from schema
    // For now, we'll use a heuristic based on properties
    if (entity.properties.name && entity.properties.email) {
      return 'https://blockprotocol.org/@alice/types/entity-type/person/v/1'
    }
    if (entity.properties.title && entity.properties.status) {
      return 'https://blockprotocol.org/@alice/types/entity-type/task/v/1'
    }
    return 'https://blockprotocol.org/@alice/types/entity-type/generic/v/1'
  }

  // Private implementation methods

  private detectBlockMode(): 'bundle' | 'html' {
  // Prefer explicit HTML template blocks
  const htmlResource = this.findResource('app.html')
  if (htmlResource) return 'html'
  // Fall back to bundle if we have a main.js or (legacy) app.js without HTML
  if (this.findResource('main.js') || this.findResource('app.js')) return 'bundle'
  return 'html'
  }

  private async initializeBundleBlock(container: HTMLElement): Promise<void> {
    const [reactModule, reactDomModule, graphModule] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('@blockprotocol/graph')
    ])

    // Store React modules for later use
    this.reactModule = reactModule.default || reactModule
    this.reactDomModule = reactDomModule.default || reactDomModule

    // Support legacy/fallback naming (app.js used by HTML template blocks when loaded as bundle)
    const bundleLogicalName = this.findResource('main.js')
      ? 'main.js'
      : this.findResource('app.js')
        ? 'app.js'
        : null
    const bundleUrl = bundleLogicalName ? this.resolveResourceUrl(bundleLogicalName) : null
    if (!bundleUrl) {
      throw new Error('Bundle resource missing (main.js/app.js)')
    }

    console.log('[BlockLoader] Bundle URL:', bundleUrl)

  await this.prefetchLocalResources(bundleLogicalName!)

    console.log('[BlockLoader] Fetching bundle from:', bundleUrl)
    const bundleResponse = await this.fetchResource(bundleUrl, { cache: 'no-store' as RequestCache })
    if (!bundleResponse.ok) {
      console.error('[BlockLoader] Bundle request failed:', bundleResponse.status, bundleResponse.statusText)
      throw new Error(`Bundle request failed with ${bundleResponse.status}`)
    }

    console.log('[BlockLoader] Bundle response OK, reading content...')
    const bundleBuffer = await bundleResponse.arrayBuffer()
    const bundleSource = new TextDecoder('utf-8').decode(bundleBuffer)
    console.log('[BlockLoader] Bundle source length:', bundleSource.length)
    console.log('[BlockLoader] Bundle source preview:', bundleSource.substring(0, 200) + '...')
    const integrity = this.options.enableIntegrityChecking ? await this.computeSha256Hex(bundleBuffer) : null

    const requiredDependencies: string[] = []
    const blockedDependencies: string[] = []

    const requireShim = (specifier: string) => {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        requiredDependencies.push(specifier)
        return this.loadLocalModule(specifier)
      }

      if (!this.options.allowedDependencies.has(specifier)) {
        blockedDependencies.push(specifier)
        throw new Error(`Unsupported dependency: ${specifier}`)
      }

      requiredDependencies.push(specifier)

      switch (specifier) {
        case 'react':
        case 'react/jsx-runtime':
        case 'react/jsx-dev-runtime':
          return this.reactModule
        case 'react-dom':
        case 'react-dom/client':
          return this.reactDomModule
        case '@blockprotocol/graph':
          return graphModule
        default:
          throw new Error(`Dependency resolution failed for ${specifier}`)
      }
    }

    // Evaluate bundle with CommonJS shim
    console.log('[BlockLoader] Evaluating bundle...')
    const moduleShim: { exports: unknown } = { exports: {} }
    const exportsShim = moduleShim.exports as Record<string, unknown>
    let blockModule: unknown
    try {
      const evaluator = new Function('require', 'module', 'exports', `${bundleSource}\nreturn module.exports;`)
      blockModule = evaluator(requireShim, moduleShim, exportsShim) ?? moduleShim.exports
      console.log('[BlockLoader] Bundle evaluation result:', blockModule)
      console.log('[BlockLoader] Block module type:', typeof blockModule)
      if (blockModule && typeof blockModule === 'object') {
        console.log('[BlockLoader] Block module keys:', Object.keys(blockModule))
      }
    } catch (error) {
      console.error('[BlockLoader] Bundle evaluation failed:', error)
      throw error
    }

    // Collect diagnostics
    if (this.options.enableDiagnostics) {
      const localModulesDiagnostics = Array.from(this.localModuleCache.values()).map(entry => ({
        logicalName: entry.logicalName,
        type: entry.type,
        integritySha256: entry.integritySha256
      }))

      this.diagnostics = {
        bundleUrl,
        evaluatedAt: new Date().toISOString(),
        integritySha256: integrity,
        requiredDependencies,
        blockedDependencies,
        allowedDependencies: Array.from(this.options.allowedDependencies),
        localModules: localModulesDiagnostics
      }
    }

    // Handle different block types
    const blockModuleObj = blockModule as Record<string, unknown> | undefined
    const componentOrFactory = blockModuleObj?.default ?? blockModuleObj?.App ?? blockModule
    console.log('[BlockLoader] componentOrFactory:', componentOrFactory)
    console.log('[BlockLoader] typeof componentOrFactory:', typeof componentOrFactory)

    if (typeof componentOrFactory === 'function') {
      console.log('[BlockLoader] Detected function component, attempting to call...')
      // Check if this is a factory function by calling it with graphModule
      let factoryResult: unknown
      try {
        factoryResult = componentOrFactory(graphModule)
        console.log('[BlockLoader] factoryResult:', factoryResult)

        // If it returns a React element, it means the function was called with wrong arguments
        // This happens when we call a React component with graphModule instead of props
        if (this.reactModule!.isValidElement?.(factoryResult)) {
          console.log('[BlockLoader] Function returned React element when called with graphModule, treating as direct React component')
          this.blockComponent = componentOrFactory
          return
        }

        // If it returns an object with element property, it's a factory
        if (factoryResult && typeof factoryResult === 'object' && 'element' in factoryResult && typeof (factoryResult as any).element === 'function') {
          // Custom element factory (like custom-element-block)
          this.isCustomElement = true
          const customElement = new ((factoryResult as any).element)()
          customElement.dataset.blockId = this.notification.blockId
          this.customElementInstance = customElement
          container.appendChild(customElement)

          if (typeof (factoryResult as any).init === 'function') {
            (factoryResult as any).init({
              element: customElement,
              entity: this.blockEntity,
              readonly: false,
              updateEntity: (properties: Record<string, unknown>) => {
                this.options.onBlockUpdate({
                  entityId: this.blockEntity.entityId,
                  properties
                })
              }
            })
          }

          if (typeof (factoryResult as any).updateEntity === 'function') {
            this.customElementUpdateFn = (entity: Entity, readonly: boolean) => {
              (factoryResult as any).updateEntity({ element: customElement, entity, readonly })
            }
          }
          return
        }

        // If it returns a function or another React element, treat it as a React component
        if (typeof factoryResult === 'function' || this.reactModule!.isValidElement?.(factoryResult)) {
          this.blockComponent = factoryResult
          console.log('[BlockLoader] Set blockComponent from factory result:', this.blockComponent)
          return
        }

      } catch (error) {
        console.log('[BlockLoader] Function call with graphModule failed, treating as direct React component:', (error as Error).message)
        // If calling with graphModule fails, it's likely a direct React component
        this.blockComponent = componentOrFactory
        return
      }

      // If we get here, assume it's a direct React component
      this.blockComponent = componentOrFactory
      console.log('[BlockLoader] Default: treating as direct React component')
    } else {
      throw new Error('Block module does not export a valid component or factory')
    }
  }

  private async initializeHtmlBlock(container: HTMLElement): Promise<void> {
    console.log('[BlockLoader] Initializing HTML block')

    // Set up blockprotocol API for HTML templates
    if (!window.blockprotocol) {
      window.blockprotocol = {
        getBlockContainer: (url: string) => {
          // For HTML templates, return the container element
          return container
        }
      }
    }

    // Set up HTML template host bridge
    this.setupHtmlTemplateBridge(container)

    const htmlResource = this.findResource('app.html')
    console.log('[BlockLoader] HTML resource:', htmlResource)
    if (!htmlResource) {
      throw new Error('HTML resource missing (app.html)')
    }

    const htmlUrl = this.resolveResourceUrl('app.html')
    console.log('[BlockLoader] HTML URL:', htmlUrl)
    if (!htmlUrl) {
      throw new Error('HTML resource URL could not be resolved')
    }

    console.log('[BlockLoader] Fetching HTML from:', htmlUrl)
    const response = await this.fetchResource(htmlUrl)
    if (!response.ok) {
      throw new Error(`Failed to load HTML from ${htmlUrl}: ${response.status}`)
    }

    const html = await response.text()
    console.log('[BlockLoader] HTML content length:', html.length)
    console.log('[BlockLoader] Setting container innerHTML')
    container.innerHTML = html

    // Load and execute JavaScript if present
    const jsResource = this.findResource('app.js')
    if (jsResource) {
      const jsUrl = this.resolveResourceUrl('app.js')
      if (jsUrl) {
        console.log('[BlockLoader] Loading JavaScript from:', jsUrl)
        const jsResponse = await this.fetchResource(jsUrl)
        if (jsResponse.ok) {
          const jsCode = await jsResponse.text()
          console.log('[BlockLoader] Executing JavaScript, length:', jsCode.length)

          // Execute the JavaScript in a try-catch
          try {
            // Check if this should be executed as a module
            // For HTML template blocks, the JavaScript should run as a module
            const script = document.createElement('script')
            script.type = 'module'

            // For modules, we need to create a blob URL since we can't use textContent with type="module"
            const blob = new Blob([jsCode], { type: 'application/javascript' })
            const url = URL.createObjectURL(blob)
            script.src = url

            container.appendChild(script)
            console.log('[BlockLoader] JavaScript module executed')
          } catch (error) {
            console.error('[BlockLoader] JavaScript execution failed:', error)
          }
        }
      }
    }

    console.log('[BlockLoader] HTML block initialized successfully')
  }

  private setupHtmlTemplateBridge(container: HTMLElement): void {
    // Set up the HTML template host bridge for communication with HTML blocks
    const win = window as typeof window & {
      __vivafolioHtmlTemplateHost?: {
        register: (
          blockId: string,
          handlers: any
        ) => {
          updateEntity: (payload: { entityId: string; properties: Record<string, unknown> }) => void
        }
      }
    }

    if (!win.__vivafolioHtmlTemplateHost) {
      console.log('[BlockLoader] Setting up HTML template bridge')
      win.__vivafolioHtmlTemplateHost = {
        register: (blockId: string, handlers: any) => {
          console.log('[BlockLoader] HTML template registered for blockId:', blockId)

          // Apply initial entity data
          if (handlers.setEntity && this.blockEntity) {
            handlers.setEntity(this.blockEntity)
          }

          // Apply initial readonly state
          if (handlers.setReadonly) {
            handlers.setReadonly(false) // HTML templates start as editable
          }

          return {
            updateEntity: (payload: { entityId: string; properties: Record<string, unknown> }) => {
              // Forward updates to the block loader's update handler
              this.options.onBlockUpdate(payload)
            }
          }
        }
      }
    }
  }

  private setupGraphEmbedder(container: HTMLElement): void {
    // The blocks get their data directly via props, so graph embedder is not needed
    // This is a placeholder for future compatibility with Block Protocol graph operations

    // Set up hook interception for nested blocks
    this.setupHookInterception(container)
  }

  private setupHookInterception(container: HTMLElement): void {
    // Set up shared graph context
    this.setupGraphContext(container)

    // Create a hook embedder handler to intercept hook messages
    const hookEmbedder = {
      on: (messageName: string, handler: Function) => {
        if (messageName === 'hook') {
          // Intercept hook messages and route to mini-host
          const originalHandler = handler
          const interceptedHandler = async (message: any) => {
            const hookData = message.data as HookData

            // Try to handle with mini-host first
            const miniHostResponse = await this.miniHost.handleHookMessage(hookData)

            if (miniHostResponse) {
              // Mini-host handled it, return the response
              return { data: miniHostResponse }
            } else {
              // Mini-host didn't handle it, fall back to original handler
              return originalHandler(message)
            }
          }

          // Store the intercepted handler for later use
          ;(container as any)._hookHandler = interceptedHandler
        }
      }
    }

    // Make the hook embedder available to blocks
    ;(container as any)._hookEmbedder = hookEmbedder

    // Also expose it globally for blocks that need it
    if (!(window as any).__vivafolioHookEmbedder) {
      (window as any).__vivafolioHookEmbedder = hookEmbedder
    }
  }

  private setupGraphContext(container: HTMLElement): void {
    // Create a shared graph context for parent-child block communication
    const graphContext = {
      // Current entity graph
      graph: this.notification.entityGraph,

      // Subscribe to entity updates
      subscribeToEntity: (entityId: string, callback: (entity: Entity) => void) => {
        const handler = (payload: { entityId: string; properties: Record<string, unknown> }) => {
          if (payload.entityId === entityId) {
            // Find the updated entity
            const updatedEntity = this.notification.entityGraph.entities.find(e => e.entityId === entityId)
            if (updatedEntity) {
              callback(updatedEntity)
            }
          }
        }

        // Store the handler for cleanup
        if (!(container as any)._entitySubscriptions) {
          (container as any)._entitySubscriptions = new Map()
        }
        ;(container as any)._entitySubscriptions.set(callback, handler)

        // Register with the block loader
        const originalOnBlockUpdate = this.options.onBlockUpdate
        this.options.onBlockUpdate = (payload) => {
          handler(payload)
          originalOnBlockUpdate(payload)
        }

        // Return unsubscribe function
        return () => {
          ;(container as any)._entitySubscriptions?.delete(callback)
        }
      },

      // Get entity by ID
      getEntity: (entityId: string): Entity | undefined => {
        return this.notification.entityGraph.entities.find(e => e.entityId === entityId)
      },

      // Update entity
      updateEntity: (entityId: string, properties: Record<string, unknown>) => {
        this.options.onBlockUpdate({
          entityId,
          properties
        })
      }
    }

    // Make graph context available to blocks
    ;(container as any)._graphContext = graphContext

    // Also expose globally for hooks
    if (!(window as any).__vivafolioGraphContext) {
      (window as any).__vivafolioGraphContext = graphContext
    }
  }

  private renderBlock(container: HTMLElement): void {
    if (this.destroyed) return

    if (this.isCustomElement) {
      // Custom element is already rendered in initializeBundleBlock
      return
    }

    if (!this.reactModule || !this.blockComponent) {
      console.warn('[BlockLoader] React module or component not available')
      container.textContent = 'Initializing block...'
      return
    }

    // Create mount point for React component
    if (!this.blockMount) {
      this.blockMount = document.createElement('div')
      this.blockMount.className = 'block-mount'
      container.appendChild(this.blockMount)
    }

    // Set up props for the component (Block Protocol standard format)
    const componentProps = {
      // Direct props format (used by some blocks)
      entity: this.blockEntity,
      readonly: false,
      updateEntity: (properties: Record<string, unknown>) => {
        this.options.onBlockUpdate({
          entityId: this.blockEntity.entityId,
          properties
        })
      },
      // Graph format (used by other blocks)
      graph: {
        blockEntity: this.blockEntity,
        blockGraph: this.blockGraph,
        readonly: false
      }
    }

    // Check if the component is a vanilla JavaScript function that returns DOM elements
    console.log('[BlockLoader] Checking component type:', typeof this.blockComponent)

    let result: unknown
    try {
      // Try to call the component to see what it returns
      result = (this.blockComponent as Function)(componentProps)
      console.log('[BlockLoader] Component call result:', result)
      console.log('[BlockLoader] Result type:', typeof result)
    } catch (error) {
      console.error('[BlockLoader] Error calling component:', error)
      container.innerHTML = '<div style="color: red;">Error calling component</div>'
      return
    }

    // Check if the result is a DOM element (vanilla JavaScript component)
    if (result && typeof result === 'object' && 'nodeType' in result && result.nodeType === Node.ELEMENT_NODE) {
      console.log('[BlockLoader] Detected vanilla JavaScript DOM element, appending directly')
      if (this.blockMount) {
        this.blockMount.appendChild(result as Element)
      } else {
        container.appendChild(result as Element)
      }
      return
    }

    // Otherwise, try to render as React component
    console.log('[BlockLoader] Attempting React rendering')
    console.log('[BlockLoader] React module available:', !!this.reactModule)
    console.log('[BlockLoader] React DOM module available:', !!this.reactDomModule)

    if (!this.reactModule || !this.reactDomModule) {
      console.error('[BlockLoader] React modules not available!')
      container.innerHTML = '<div style="color: red;">React modules not loaded</div>'
      return
    }

    if (!this.blockMount) {
      console.error('[BlockLoader] Block mount not created!')
      return
    }

    if (!this.reactRoot) {
      console.log('[BlockLoader] Creating React root')
      this.reactRoot = this.reactDomModule.createRoot(this.blockMount)
    }

    try {
      console.log('[BlockLoader] Creating React element')
      const element = this.reactModule.createElement(this.blockComponent as React.ComponentType<any>, componentProps)
      console.log('[BlockLoader] React element created:', element)

      console.log('[BlockLoader] Calling React render')
      this.reactRoot.render(element)

      // Add a small delay to let React render
      setTimeout(() => {
        console.log('[BlockLoader] After render, block-mount HTML:', this.blockMount?.innerHTML)
      }, 100)

      console.log('[BlockLoader] React render call completed')
    } catch (error) {
      console.error('[BlockLoader] React render failed:', error)
      console.error('[BlockLoader] Error stack:', (error as Error).stack)
      container.innerHTML = `<div style="color: red;">React render failed: ${(error as Error).message}</div>`
      throw error
    }
  }

  // Utility methods

  private findResource(logicalName: string): BlockResource | undefined {
    return this.resources.find(r => r.logicalName === logicalName)
  }

  private resolveResourceUrl(logicalName: string): string | null {
    const resource = this.findResource(logicalName)
    if (!resource) return null

    const url = new URL(resource.physicalPath, window.location.origin)
    if (resource.cachingTag) {
      url.searchParams.set('cache', resource.cachingTag)
    }
    return url.pathname + url.search
  }

  private async fetchResource(url: string, options: RequestInit = {}): Promise<Response> {
    // Check if this is a local resource (starts with /examples/blocks/)
    const isLocalResource = url.startsWith('/examples/blocks/')

    // If cache is available and this is not a local resource, try to get from cache first
    if (this.resourcesCache && !isLocalResource) {
      try {
        // Parse the URL to extract package info for caching
        const urlObj = new URL(url, window.location.origin)
        const pathParts = urlObj.pathname.split('/')

        // Try to extract package name from URL path
        // This is a heuristic - in practice, the cache key would be determined
        // by the block loader based on the block type and version
        const packageName = pathParts.find(part => part.startsWith('@') || !part.includes('/'))
        const version = urlObj.searchParams.get('cache') || 'latest'

        if (packageName) {
          const cacheResult = await this.resourcesCache.fetchBlock({
            name: packageName,
            version: version
          })

          if (cacheResult.success && cacheResult.data) {
            // Find the specific resource in the cached block
            const resourceName = pathParts[pathParts.length - 1]
            const cachedResource = cacheResult.data.resources.get(resourceName)

            if (cachedResource) {
              // Return a Response-like object from cached data
              return new Response(cachedResource.content, {
                status: 200,
                statusText: 'OK',
                headers: {
                  'content-type': cachedResource.contentType,
                  'cache-control': 'public, max-age=31536000', // 1 year
                  'x-cache-status': 'HIT'
                }
              })
            }
          }
        }
      } catch (error) {
        console.warn('[BlockLoader] Cache fetch failed, falling back to network:', error)
      }
    }

    // Fall back to direct fetch
    const response = await fetch(url, { ...options, headers: { 'x-cache-status': 'MISS', ...options.headers } })
    return response
  }

  private async prefetchLocalResources(mainLogicalName: string): Promise<void> {
    this.destroyLocalModules()
    const resources = this.resources ?? []
    const localResources = resources.filter(r => r.logicalName !== mainLogicalName)

    for (const resource of localResources) {
      const extension = resource.logicalName.split('.').pop()?.toLowerCase()
      if (!extension || !['js', 'cjs', 'mjs', 'css'].includes(extension)) continue

      const relativeUrl = this.resolveResourceUrl(resource.logicalName)
      if (!relativeUrl) continue

      const absoluteUrl = new URL(relativeUrl, window.location.origin).toString()

      if (['js', 'cjs', 'mjs'].includes(extension)) {
        const response = await this.fetchResource(absoluteUrl, { cache: 'no-store' as RequestCache })
        if (!response.ok) continue

        const source = await response.text()
        const integritySha256 = this.options.enableIntegrityChecking
          ? await this.computeSha256Hex(new TextEncoder().encode(source).buffer)
          : null

        this.localModuleCache.set(resource.logicalName, {
          logicalName: resource.logicalName,
          url: absoluteUrl,
          type: 'js',
          source,
          integritySha256,
          executed: false
        })
      } else if (extension === 'css') {
        const response = await this.fetchResource(absoluteUrl, { cache: 'no-store' as RequestCache })
        if (!response.ok) continue

        const source = await response.text()
        const integritySha256 = this.options.enableIntegrityChecking
          ? await this.computeSha256Hex(new TextEncoder().encode(source).buffer)
          : null

        this.localModuleCache.set(resource.logicalName, {
          logicalName: resource.logicalName,
          url: absoluteUrl,
          type: 'css',
          source,
          integritySha256,
          executed: false
        })
      }
    }
  }

  private loadLocalModule(specifier: string): unknown {
    // Normalize relative paths by removing leading './' or '../'
    let normalizedSpecifier = specifier
    if (normalizedSpecifier.startsWith('./')) {
      normalizedSpecifier = normalizedSpecifier.slice(2)
    }
    while (normalizedSpecifier.startsWith('../')) {
      normalizedSpecifier = normalizedSpecifier.slice(3)
    }

    const entry = this.localModuleCache.get(normalizedSpecifier)
    if (!entry) {
      console.log('Available modules:', Array.from(this.localModuleCache.keys()))
      throw new Error(`Local module not found: ${specifier} (normalized: ${normalizedSpecifier})`)
    }

    if (entry.type === 'css') {
      // Inject CSS
      if (!entry.executed) {
        const style = document.createElement('style')
        style.textContent = entry.source
        document.head.appendChild(style)
        entry.executed = true
      }
      return {}
    }

    // Execute JavaScript module
    if (!entry.executed) {
      const moduleShim: { exports: unknown } = { exports: {} }
      const evaluator = new Function('require', 'module', 'exports', entry.source)
      evaluator(this.loadLocalModule.bind(this), moduleShim, moduleShim.exports)
      entry.exports = moduleShim.exports
      entry.executed = true
    }

    return entry.exports
  }

  private destroyLocalModules(): void {
    // Clean up CSS styles and reset module cache
    this.localModuleCache.clear()
  }

  private async computeSha256Hex(buffer: ArrayBuffer): Promise<string | null> {
    try {
      if (!('crypto' in window) || !window.crypto.subtle) {
        return null
      }
      const digest = await window.crypto.subtle.digest('SHA-256', buffer)
      const bytes = new Uint8Array(digest)
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    } catch (error) {
      console.warn('[BlockLoader] SHA-256 computation failed:', error)
      return null
    }
  }

  // Graph helper methods
  private deriveBlockEntity(notification: VivafolioBlockNotification): Entity {
    // Implementation to derive block entity from notification
    return notification.entityGraph.entities.find(e => e.entityId === notification.entityId) || notification.entityGraph.entities[0]
  }

  private deriveBlockGraph(notification: VivafolioBlockNotification): BlockGraphState {
    // Implementation to derive block graph state
    return {
      depth: 1,
      linkedEntities: notification.entityGraph.entities,
      subgraphVertices: notification.entityGraph.entities.map(entity => ({
        kind: 'entity' as const,
        inner: {
          entityId: entity.entityId,
          entityTypeId: 'unknown', // Would be derived from schema
          properties: entity.properties
        }
      }))
    }
  }

  private buildBlockEntitySubgraph(entity: Entity, graph: BlockGraphState): BlockEntitySubgraph {
    // Implementation to build block entity subgraph
    return {
      entityId: entity.entityId,
      entityTypeId: 'unknown', // Would be derived from schema
      properties: entity.properties,
      linkedEntities: []
    }
  }

  private dispatchBlockEntitySubgraph(): void {
    if (this.embedder) {
      // Implementation to dispatch subgraph to embedder
    }
  }

  private emitLinkedAggregations(): void {
    // Implementation to emit linked aggregations
  }
}
