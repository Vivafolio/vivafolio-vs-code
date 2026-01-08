import { LitElement, html, css, type TemplateResult, type CSSResult } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from 'lit/decorators.js'

// Reuse shared core types: import for local use and re-export for consumers
import type { Entity, BlockGraph, GraphService, BlockProps } from '@vivafolio/block-core'
export type { Entity, BlockGraph, GraphService, BlockProps } from '@vivafolio/block-core'

type EntityProperties = NonNullable<Entity['properties']>

// Lit component base class
export abstract class BlockElement extends LitElement {
  @property({ type: Object })
  graph!: GraphService

  // Reactive entity data
  protected get entity(): Entity {
    return this.graph?.blockEntity || {} as Entity
  }

  protected get readonly(): boolean {
    return this.graph?.readonly || false
  }

  // Helper method for updating entity properties
  protected updateEntity(updates: Partial<EntityProperties>) {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('Entity update requested:', updates)
    this.dispatchEvent(new CustomEvent('entity-update', {
      detail: updates,
      bubbles: true,
      composed: true
    }))
  }
}

// Helper to create a Block Protocol compatible Lit component
export function createBlock<T extends BlockElement>(
  componentClass: new () => T,
  options: {
    name: string
    version?: string
    description?: string
  }
): new () => T {
  // Apply metadata to the class
  ;(componentClass as any).blockMetadata = options
  return componentClass
}

// Base block wrapper styles
export const blockStyles = css`
  :host {
    display: block;
    border: 2px solid #10b981;
    border-radius: 8px;
    padding: 1rem;
    background: rgba(16, 185, 129, 0.08);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .block-heading {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: #065f46;
  }

  .block-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .block-field {
    display: flex;
    flex-direction: column;
    font-size: 0.9rem;
    color: #14532d;
  }

  .block-field__label {
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .block-input,
  .block-select {
    padding: 0.4rem 0.5rem;
    border: 1px solid #bbf7d0;
    border-radius: 4px;
    font-size: 0.95rem;
    background: white;
  }

  .block-input:disabled,
  .block-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .block-button {
    align-self: flex-start;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    border: none;
    background: #10b981;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  .block-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .block-button:hover:not(:disabled) {
    background: #059669;
  }

  .block-footnote {
    font-size: 0.8rem;
    color: #065f46;
    margin-top: 0.5rem;
  }
`

// Form field components for common block patterns
export const BlockField = (label: string, content: TemplateResult) => html`
  <label class="block-field">
    <span class="block-field__label">${label}</span>
    ${content}
  </label>
`

export const BlockInput = (
  value: string,
  onInput: (value: string) => void,
  options: {
    placeholder?: string
    disabled?: boolean
    type?: 'text' | 'email' | 'url' | 'number'
  } = {}
) => html`
  <input
    type=${options.type || 'text'}
    .value=${value}
    placeholder=${options.placeholder || ''}
    ?disabled=${options.disabled}
    class="block-input"
    @input=${(e: Event) => onInput((e.target as HTMLInputElement).value)}
  />
`

export const BlockSelect = (
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
  disabled: boolean = false
) => html`
  <select
    .value=${value}
    ?disabled=${disabled}
    class="block-select"
    @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}
  >
    ${options.map(option => html`
      <option value=${option.value}>${option.label}</option>
    `)}
  </select>
`

export const BlockButton = (
  onClick: () => void,
  content: TemplateResult,
  options: {
    disabled?: boolean
    variant?: 'primary' | 'secondary' | 'danger'
  } = {}
) => html`
  <button
    class="block-button block-button--${options.variant || 'primary'}"
    ?disabled=${options.disabled}
    @click=${onClick}
  >
    ${content}
  </button>
`

// Utility function to register a Lit component as a Web Component
export function registerBlockElement(
  tagName: string,
  litComponent: new () => LitElement,
  propsMapper?: (element: HTMLElement) => Record<string, unknown>
) {
  // Lit components are automatically registered as custom elements
  // when using the @customElement decorator
  console.log(`Lit component registered as ${tagName}`)
}
