import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core'

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

// Angular component type
export type AngularComponent = new (...args: any[]) => any

// Helper to create a Block Protocol compatible Angular component
export function createBlock<T>(
  componentClass: AngularComponent,
  options: {
    name: string
    version?: string
    description?: string
  }
): AngularComponent {
  // Add metadata to the component
  ;(componentClass as any).blockMetadata = options
  return componentClass
}

// Base block component class
export abstract class BlockComponent implements OnChanges {
  @Input() graph!: GraphService
  @Output() entityUpdate = new EventEmitter<Partial<Entity['properties']>>()

  protected get entity(): Entity {
    return this.graph?.blockEntity || {} as Entity
  }

  protected get readonly(): boolean {
    return this.graph?.readonly || false
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['graph'] && this.graph) {
      this.onGraphChange()
    }
  }

  protected abstract onGraphChange(): void

  protected updateEntity(updates: Partial<Entity['properties']>) {
    this.entityUpdate.emit(updates)
  }
}

// Service for Block Protocol operations
export class BlockProtocolService {
  updateEntity(updates: Partial<Entity['properties']>) {
    // In a real implementation, this would call the Block Protocol updateEntity method
    console.log('Entity update requested:', updates)
  }
}

// Form field components for common block patterns (would be implemented as Angular components)
export const BlockField = `
  <label class="block-field">
    <span class="block-field__label">{{ label }}</span>
    <ng-content></ng-content>
  </label>
`

export const BlockInput = `
  <input
    [type]="type || 'text'"
    [value]="value"
    [placeholder]="placeholder || ''"
    [disabled]="disabled || false"
    class="block-input"
    (input)="onInput($event.target.value)"
  />
`

export const BlockSelect = `
  <select
    [value]="value"
    [disabled]="disabled || false"
    class="block-select"
    (change)="onChange($event.target.value)"
  >
    <option *ngFor="let option of options" [value]="option.value">
      {{ option.label }}
    </option>
  </select>
`

export const BlockButton = `
  <button
    class="block-button block-button--{{ variant || 'primary' }}"
    [disabled]="disabled || false"
    (click)="onClick()"
  >
    <ng-content></ng-content>
  </button>
`

// Utility function to register an Angular component as a Web Component
export function registerBlockElement(
  tagName: string,
  angularComponent: AngularComponent,
  propsMapper?: (element: HTMLElement) => Record<string, unknown>
) {
  // In Angular, components can be registered as custom elements using @angular/elements
  // This would typically be done in the main application module
  console.log(`Angular component ${tagName} registered`)
}

// Common styles for block components
export const blockStyles = `
  :host {
    display: block;
    border: 2px solid #8b5cf6;
    border-radius: 8px;
    padding: 1rem;
    background: rgba(139, 92, 246, 0.08);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .block-heading {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: #5b21b6;
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
    color: #4c1d95;
  }

  .block-field__label {
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .block-input,
  .block-select {
    padding: 0.4rem 0.5rem;
    border: 1px solid #d8b4fe;
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
    background: #8b5cf6;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  .block-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .block-button:hover:not(:disabled) {
    background: #7c3aed;
  }

  .block-footnote {
    font-size: 0.8rem;
    color: #5b21b6;
    margin-top: 0.5rem;
  }
`
