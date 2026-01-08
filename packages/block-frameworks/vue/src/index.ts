import { defineComponent, reactive, computed, ref, type Component, type App } from 'vue'

// Reuse shared core types: import for local use and re-export for consumers
import type { Entity, BlockGraph, GraphService, BlockProps } from '@vivafolio/block-core'
export type { Entity, BlockGraph, GraphService, BlockProps } from '@vivafolio/block-core'

type EntityProperties = NonNullable<Entity['properties']>

// Vue component wrapper type
export type BlockComponent<T = {}> = Component<BlockProps & T>

// Helper to create a Block Protocol compatible Vue component
export function createBlock<T = {}>(
  component: BlockComponent<T>,
  options: {
    name: string
    version?: string
    description?: string
  }
): BlockComponent<T> {
  return defineComponent({
    name: options.name,
    ...component,
    props: {
      graph: {
        type: Object as () => GraphService,
        required: true
      },
      ...((component as any).props || {})
    }
  })
}

// Composable for accessing entity data with reactivity
export function useEntity(graph: GraphService) {
  const entity = reactive(graph.blockEntity)

  // In a real implementation, this would listen to graph updates
  // For now, we'll just return the reactive entity
  return entity
}

// Composable for updating entity properties
export function useEntityUpdater(graph: GraphService) {
  return (updates: Partial<EntityProperties>) => {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('Entity update requested:', updates)
  }
}

// Base block wrapper component with common styling
export const BlockContainer = defineComponent({
  name: 'BlockContainer',
  props: {
    className: {
      type: String,
      default: ''
    }
  },
  template: `
    <div :class="['block-container', className]">
      <slot />
    </div>
  `
})

// Form field components for common block patterns
export const BlockField = defineComponent({
  name: 'BlockField',
  props: {
    label: {
      type: String,
      required: true
    },
    className: {
      type: String,
      default: ''
    }
  },
  template: `
    <label :class="['block-field', className]">
      <span class="block-field__label">{{ label }}</span>
      <slot />
    </label>
  `
})

export const BlockInput = defineComponent({
  name: 'BlockInput',
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    placeholder: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      default: 'text',
      validator: (value: string) => ['text', 'email', 'url', 'number'].includes(value)
    }
  },
  emits: ['update:modelValue'],
  template: `
    <input
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="block-input"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `
})

export const BlockSelect = defineComponent({
  name: 'BlockSelect',
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    options: {
      type: Array as () => Array<{ value: string; label: string }>,
      default: () => []
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue'],
  template: `
    <select
      :value="modelValue"
      :disabled="disabled"
      class="block-select"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  `
})

export const BlockButton = defineComponent({
  name: 'BlockButton',
  props: {
    disabled: {
      type: Boolean,
      default: false
    },
    variant: {
      type: String,
      default: 'primary',
      validator: (value: string) => ['primary', 'secondary', 'danger'].includes(value)
    }
  },
  emits: ['click'],
  template: `
    <button
      :class="['block-button', \`block-button--\${variant}\`]"
      :disabled="disabled"
      @click="$emit('click')"
    >
      <slot />
    </button>
  `
})

// Utility function to register a Vue component as a Web Component
export function registerBlockElement(
  tagName: string,
  vueComponent: Component<any>,
  propsMapper?: (element: HTMLElement) => Record<string, unknown>
) {
  if (customElements.get(tagName)) {
    return
  }

  class VueBlockElement extends HTMLElement {
    private app?: App
    private root?: ShadowRoot

    constructor() {
      super()
      this.root = this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
      // In a real implementation, this would mount the Vue component
      // For now, we'll create a placeholder
      if (this.root) {
        this.root.innerHTML = `
          <div class="vue-block-placeholder">
            <h3>${tagName}</h3>
            <p>Vue.js Block Component</p>
            <pre>${JSON.stringify(propsMapper ? propsMapper(this) : {}, null, 2)}</pre>
          </div>
        `
      }
    }

    disconnectedCallback() {
      if (this.app) {
        this.app.unmount()
      }
    }
  }

  customElements.define(tagName, VueBlockElement)
}
