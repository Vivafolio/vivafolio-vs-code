import { Component, createSignal, JSX, onMount, onCleanup } from 'solid-js'
import { render } from 'solid-js/web'
// Reuse shared core types: import for local use and re-export for consumers
import type { Entity, BlockGraph, GraphService, BlockProps } from '@vivafolio/block-core'
export type { Entity, BlockGraph, GraphService, BlockProps } from '@vivafolio/block-core'

// Web Component wrapper type (supports custom graph types)
export type BlockComponent<TProps extends Record<string, any> = BlockProps> = Component<TProps>

// Helper to create a Block Protocol compatible SolidJS component
export function createSolidBlock<T extends Record<string, any> = {}>(
  component: BlockComponent<BlockProps & T>,
  options: {
    name: string
    version?: string
    description?: string
  }
): {
  (props: BlockProps & T): JSX.Element
  blockMetadata: typeof options
} {
  const wrappedComponent = (props: BlockProps & T) => {
    return component(props)
  }
  ;(wrappedComponent as any).blockMetadata = options
  return wrappedComponent as any
}

// Hook for accessing entity data with reactivity (supports any GraphService type)
export function useEntity<TGraph extends { blockEntity: Entity }>(graph: TGraph) {
  const [entity, setEntity] = createSignal(graph.blockEntity)

  // In a real implementation, this would listen to graph updates
  // For now, we'll just return the initial entity
  return entity
}

// Hook for updating entity properties
export function useEntityUpdater<TGraph extends { blockEntity: Entity }>(graph: TGraph) {
  return (updates: Partial<Entity['properties']>) => {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('Entity update requested:', updates)
  }
}

// Base block wrapper styles (CSS-in-JS for SolidJS)
export const blockStyles = `
  .solidjs-block-container {
    display: block;
    border: 2px solid #8b5cf6;
    border-radius: 8px;
    padding: 1rem;
    background: rgba(139, 92, 246, 0.08);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .solidjs-block-heading {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: #5b21b6;
  }

  .solidjs-block-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .solidjs-block-field {
    display: flex;
    flex-direction: column;
    font-size: 0.9rem;
    color: #374151;
  }

  .solidjs-block-field__label {
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .solidjs-block-input,
  .solidjs-block-select {
    padding: 0.4rem 0.5rem;
    border: 1px solid #ddd6fe;
    border-radius: 4px;
    font-size: 0.95rem;
    background: white;
  }

  .solidjs-block-input:disabled,
  .solidjs-block-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .solidjs-block-button {
    align-self: flex-start;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    border: none;
    background: #8b5cf6;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  .solidjs-block-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .solidjs-block-button:hover:not(:disabled) {
    background: #7c3aed;
  }

  .solidjs-block-footnote {
    font-size: 0.8rem;
    color: #5b21b6;
    margin-top: 0.5rem;
  }
`

// Form field components for common block patterns
export const BlockContainer: Component<{
  className?: string
  children: any
}> = (props) => {
  onMount(() => {
    // Inject styles if not already present
    if (!document.querySelector('#solidjs-block-styles')) {
      const style = document.createElement('style')
      style.id = 'solidjs-block-styles'
      style.textContent = blockStyles
      document.head.appendChild(style)
    }
  })

  return (
    <div class={`solidjs-block-container ${props.className || ''}`}>
      {props.children}
    </div>
  )
}

export const BlockField: Component<{
  label: string
  children: any
}> = (props) => {
  return (
    <label class="solidjs-block-field">
      <span class="solidjs-block-field__label">{props.label}</span>
      {props.children}
    </label>
  )
}

export const BlockInput: Component<{
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'email' | 'url' | 'number'
}> = (props) => {
  return (
    <input
      type={props.type || 'text'}
      value={props.value}
      placeholder={props.placeholder || ''}
      disabled={props.disabled}
      class="solidjs-block-input"
      onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
    />
  )
}

export const BlockSelect: Component<{
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  disabled?: boolean
}> = (props) => {
  return (
    <select
      value={props.value}
      disabled={props.disabled}
      class="solidjs-block-select"
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
    >
      {props.options.map(option => (
        <option value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

export const BlockButton: Component<{
  onClick: () => void
  children: any
  disabled?: boolean
}> = (props) => {
  return (
    <button
      class="solidjs-block-button"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

// Enhanced factory function that supports custom GraphService interfaces
export function createBlockElement<TGraph extends Partial<GraphService> = GraphService>(
  component: Component<BlockProps<TGraph>>,
  options: {
    name: string
    version?: string
    description?: string
  }
): {
  element: typeof HTMLElement
  init: (params: {
    element: HTMLElement
    graph: TGraph
  }) => (() => void)
  updateGraph: (params: {
    element: HTMLElement
    graph: TGraph
  }) => void
} {
  class SolidBlockElement extends HTMLElement {
    public graph?: TGraph
    public _dispose?: () => void

    constructor() {
      super()
    }

    connectedCallback() {
      // Will be initialized by the init method
      if (this.graph) {
        // Auto-initialize if graph is already set
        const cleanup = init({ element: this, graph: this.graph })
        this._dispose = cleanup
      }
    }

    disconnectedCallback() {
      if (this._dispose) {
        this._dispose()
        this._dispose = undefined
      }
    }
  }

  const init = (params: {
    element: HTMLElement
    graph: TGraph
  }): (() => void) => {
  const { element, graph } = params

    // Create container for SolidJS rendering
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '100%'
    element.appendChild(container)

    // Render the SolidJS component
    const dispose = render(
      () => component({ graph } as BlockProps<TGraph>),
      container
    )

    // Persist references on the custom element for lifecycle management
    const blockElement = element as SolidBlockElement
    blockElement.graph = graph

    // Cleanup function that unmounts Solid and removes the container
    const cleanup = () => {
      dispose()
      if (container.parentNode) {
        container.parentNode.removeChild(container)
      }
    }

    // Store cleanup on the element so disconnectedCallback and updates can dispose correctly
    blockElement._dispose = cleanup

    // Inject block styles if not already present
    if (!document.querySelector('#solidjs-block-styles')) {
      const style = document.createElement('style')
      style.id = 'solidjs-block-styles'
      style.textContent = blockStyles
      document.head.appendChild(style)
    }

    // Return cleanup function
    return cleanup
  }

  const updateGraph = (params: {
    element: HTMLElement
    graph: TGraph
  }) => {
    const blockElement = params.element as SolidBlockElement
    blockElement.graph = params.graph

    // If not yet initialized (e.g. first update after external init), initialize now
    if (!blockElement._dispose) {
      blockElement._dispose = init(params)
      return
    }

    // If already initialized, re-render cleanly
    blockElement._dispose()
    blockElement._dispose = init(params)
  }

  return {
    element: SolidBlockElement,
    init,
    updateGraph
  }
}



// Utility function to register a SolidJS component as a Web Component
export function registerBlockElement(
  tagName: string,
  solidComponent: Component<any>,
  propsMapper?: (element: HTMLElement) => Record<string, unknown>
) {
  // SolidJS components are registered via the createBlockElement factory
  console.log(`SolidJS component registered as ${tagName}`)
}
