import { writable, readable, derived } from 'svelte/store'

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

// Svelte component type (simplified for TypeScript)
export type SvelteComponent = any

// Helper to create a Block Protocol compatible Svelte component
export function createBlock<T = {}>(
  component: SvelteComponent,
  options: {
    name: string
    version?: string
    description?: string
  }
): SvelteComponent {
  // In Svelte, we can add metadata to the component
  if (component && typeof component === 'function') {
    (component as any).blockMetadata = options
  }
  return component
}

// Store for accessing entity data with reactivity
export function useEntity(graph: GraphService) {
  const entityStore = writable(graph.blockEntity)

  // In a real implementation, this would listen to graph updates
  // For now, we'll just return the store
  return {
    subscribe: entityStore.subscribe,
    set: entityStore.set,
    update: entityStore.update
  }
}

// Store for updating entity properties
export function useEntityUpdater(graph: GraphService) {
  return (updates: Partial<Entity['properties']>) => {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('Entity update requested:', updates)
  }
}

// Base block wrapper component (would be implemented as a Svelte component)
export const BlockContainer = `
  <div class="block-container" class={$$props.class}>
    <slot />
  </div>
`

// Form field components for common block patterns (would be Svelte components)
export const BlockField = `
  <label class="block-field {$$props.class || ''}">
    <span class="block-field__label">{label}</span>
    <slot />
  </label>
`

export const BlockInput = `
  <input
    type={type || 'text'}
    value={value}
    placeholder={placeholder || ''}
    disabled={disabled || false}
    class="block-input"
    on:input={(e) => dispatch('input', e.target.value)}
  />
`

export const BlockSelect = `
  <select
    value={value}
    disabled={disabled || false}
    class="block-select"
    on:change={(e) => dispatch('change', e.target.value)}
  >
    {#each options as option}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
`

export const BlockButton = `
  <button
    class="block-button block-button--{variant || 'primary'}"
    disabled={disabled || false}
    on:click
  >
    <slot />
  </button>
`

// Utility function to register a Svelte component as a Web Component
export function registerBlockElement(
  tagName: string,
  svelteComponent: SvelteComponent,
  propsMapper?: (element: HTMLElement) => Record<string, unknown>
) {
  if (customElements.get(tagName)) {
    return
  }

  class SvelteBlockElement extends HTMLElement {
    private app?: any
    private root?: ShadowRoot

    constructor() {
      super()
      this.root = this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
      const props = propsMapper ? propsMapper(this) : {}
      // In a real implementation, this would mount the Svelte component
      // For now, we'll create a placeholder
      if (this.root) {
        this.root.innerHTML = `
          <div class="svelte-block-placeholder">
            <h3>${tagName}</h3>
            <p>Svelte Block Component</p>
            <pre>${JSON.stringify(props, null, 2)}</pre>
          </div>
        `
      }
    }

    disconnectedCallback() {
      if (this.app && typeof this.app.$destroy === 'function') {
        this.app.$destroy()
      }
    }
  }

  customElements.define(tagName, SvelteBlockElement)
}
