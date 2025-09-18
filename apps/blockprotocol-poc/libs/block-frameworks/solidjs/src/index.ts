import { Component, createSignal } from 'solid-js'

// Block Protocol types
export interface Entity {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
  metadata?: {
    recordId: {
      entityId: string
      editionId: string
    }
    entityTypeId: string
  }
}

export interface BlockGraph {
  depth: number
  linkedEntities: Entity[]
  linkGroups: Array<Record<string, unknown>>
}

export interface GraphService {
  blockEntity: Entity
  blockGraph: BlockGraph
  entityTypes: Array<Record<string, unknown>>
  linkedAggregations: Array<Record<string, unknown>>
  readonly: boolean
}

export interface BlockProps {
  graph: GraphService
}

// Web Component wrapper type
export type BlockComponent<T = {}> = Component<BlockProps & T>

// Helper to create a Block Protocol compatible SolidJS component
export function createBlock<T = {}>(
  component: BlockComponent<T>,
  options: {
    name: string
    version?: string
    description?: string
  }
): BlockComponent<T> {
  return (props: BlockProps & T) => {
    return component(props)
  }
}

// Hook for accessing entity data with reactivity
export function useEntity(graph: GraphService) {
  const [entity, setEntity] = createSignal(graph.blockEntity)

  // In a real implementation, this would listen to graph updates
  // For now, we'll just return the initial entity
  return entity
}

// Hook for updating entity properties
export function useEntityUpdater(graph: GraphService) {
  return (updates: Partial<Entity['properties']>) => {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('Entity update requested:', updates)
  }
}

// Utility function to register a SolidJS component as a Web Component
export function registerBlockElement(
  tagName: string,
  solidComponent: Component<any>,
  propsMapper?: (element: HTMLElement) => Record<string, unknown>
) {
  if (customElements.get(tagName)) {
    return
  }

  class SolidBlockElement extends HTMLElement {
    private root: ShadowRoot
    private dispose?: () => void

    constructor() {
      super()
      this.root = this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
      const props = propsMapper ? propsMapper(this) : {}
      // In a real implementation, this would render the SolidJS component
      // For now, we'll create a placeholder
      this.root.innerHTML = `
        <div class="solid-block-placeholder">
          <h3>${tagName}</h3>
          <p>SolidJS Block Component</p>
          <pre>${JSON.stringify(props, null, 2)}</pre>
        </div>
      `
    }

    disconnectedCallback() {
      if (this.dispose) {
        this.dispose()
      }
    }
  }

  customElements.define(tagName, SolidBlockElement)
}
