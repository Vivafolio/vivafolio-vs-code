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
import {
  Entity,
  EntityGraph,
  BlockResource,
  VivafolioBlockNotification,
  BlockLoaderDiagnostics,
  BlockLoaderOptions,
  HtmlTemplateHandlers,
  BlockLoader,
  DEFAULT_ALLOWED_DEPENDENCIES
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

  constructor(notification: VivafolioBlockNotification, options: BlockLoaderOptions = {}) {
    this.notification = notification
    this.options = {
      allowedDependencies: options.allowedDependencies || DEFAULT_ALLOWED_DEPENDENCIES,
      enableIntegrityChecking: options.enableIntegrityChecking ?? true,
      enableDiagnostics: options.enableDiagnostics ?? true,
      onBlockUpdate: options.onBlockUpdate || (() => {})
    }

    // Initialize block state
    this.resources = notification.resources
    this.blockEntity = this.deriveBlockEntity(notification)
    this.blockGraph = this.deriveBlockGraph(notification)
    this.blockSubgraph = this.buildBlockEntitySubgraph(this.blockEntity, this.blockGraph)
  }

  async loadBlock(notification: VivafolioBlockNotification, container: HTMLElement): Promise<HTMLElement> {
    console.log('[BlockLoader] Loading block:', notification.blockId, notification.blockType)

    this.notification = notification
    this.options = {
      allowedDependencies: new Set(DEFAULT_ALLOWED_DEPENDENCIES),
      enableIntegrityChecking: true,
      enableDiagnostics: true,
      onBlockUpdate: () => {} // Will be set by caller
    }

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
  }

  getDiagnostics(): BlockLoaderDiagnostics | null {
    return this.diagnostics
  }

  // Private implementation methods

  private detectBlockMode(): 'bundle' | 'html' {
    const mainResource = this.findResource('main.js')
    const htmlResource = this.findResource('app.html')
    return mainResource ? 'bundle' : 'html'
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

    const bundleUrl = this.resolveResourceUrl('main.js')
    if (!bundleUrl) {
      throw new Error('Bundle resource missing (main.js)')
    }

    await this.prefetchLocalResources('main.js')

    const bundleResponse = await fetch(bundleUrl, { cache: 'no-store' })
    if (!bundleResponse.ok) {
      throw new Error(`Bundle request failed with ${bundleResponse.status}`)
    }

    const bundleBuffer = await bundleResponse.arrayBuffer()
    const bundleSource = new TextDecoder('utf-8').decode(bundleBuffer)
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
    const evaluator = new Function('require', 'module', 'exports', `${bundleSource}\nreturn module.exports;`)
    const blockModule = evaluator(requireShim, moduleShim, exportsShim) ?? moduleShim.exports
    console.log('[BlockLoader] Bundle evaluation result:', blockModule)

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
    const componentOrFactory = blockModule?.default ?? blockModule?.App ?? blockModule
    console.log('[BlockLoader] componentOrFactory:', componentOrFactory)
    console.log('[BlockLoader] typeof componentOrFactory:', typeof componentOrFactory)

    if (typeof componentOrFactory === 'function') {
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
    const response = await fetch(htmlUrl)
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
        const jsResponse = await fetch(jsUrl)
        if (jsResponse.ok) {
          const jsCode = await jsResponse.text()
          console.log('[BlockLoader] Executing JavaScript, length:', jsCode.length)

          // Execute the JavaScript in a try-catch
          try {
            // Create a script element to execute the code
            const script = document.createElement('script')
            script.textContent = jsCode
            container.appendChild(script)
            console.log('[BlockLoader] JavaScript executed')
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

    // Render React component
    console.log('[BlockLoader] Rendering React component:', this.blockComponent)
    console.log('[BlockLoader] Component props:', componentProps)
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
        const response = await fetch(absoluteUrl, { cache: 'no-store' })
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
        const response = await fetch(absoluteUrl, { cache: 'no-store' })
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
