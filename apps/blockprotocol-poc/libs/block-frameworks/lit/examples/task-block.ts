import { html, css } from 'lit'
import { customElement } from 'lit/decorators.js'
import {
  BlockElement,
  createBlock,
  blockStyles,
  BlockField,
  BlockInput,
  BlockSelect,
  BlockButton
} from '../../src/index'

@customElement('lit-task-block')
export class LitTaskBlock extends createBlock(BlockElement, {
  name: 'lit-task-block',
  version: '0.1.0',
  description: 'Task management block built with Lit'
}) {
  private title = ''
  private description = ''
  private status = 'todo'

  private statusOptions = [
    { value: 'todo', label: 'To Do' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'done', label: 'Done' }
  ]

  // React to graph changes
  protected updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties)

    if (changedProperties.has('graph') && this.graph) {
      const entity = this.entity
      this.title = (entity?.properties?.title as string) || ''
      this.description = (entity?.properties?.description as string) || ''
      this.status = (entity?.properties?.status as string) || 'todo'
    }
  }

  private handleTitleInput(value: string) {
    this.title = value
  }

  private handleDescriptionInput(value: string) {
    this.description = value
  }

  private handleStatusChange(value: string) {
    this.status = value
  }

  private handleUpdate() {
    this.updateEntity({
      title: this.title,
      description: this.description,
      status: this.status,
      lastUpdated: new Date().toISOString()
    })
  }

  static styles = [
    blockStyles,
    css`
      :host {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
      }

      .block-heading {
        color: white;
      }

      .block-field__label {
        color: #fef3c7;
      }

      .block-input,
      .block-select {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.3);
        color: white;
      }

      .block-input::placeholder {
        color: rgba(255, 255, 255, 0.6);
      }

      .block-button {
        background: rgba(255, 255, 255, 0.2);
        color: white;
      }

      .block-button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.3);
      }

      .block-footnote {
        color: #fef3c7;
      }
    `
  ]

  render() {
    return html`
      <h3 class="block-heading">Task Block (Lit)</h3>

      <div class="block-body">
        ${BlockField('Title:', BlockInput(
          this.title,
          (value) => this.handleTitleInput(value),
          { placeholder: 'Enter task title...' }
        ))}

        ${BlockField('Description:', BlockInput(
          this.description,
          (value) => this.handleDescriptionInput(value),
          { placeholder: 'Enter task description...' }
        ))}

        ${BlockField('Status:', BlockSelect(
          this.status,
          this.statusOptions,
          (value) => this.handleStatusChange(value),
          this.readonly
        ))}

        ${BlockButton(
          () => this.handleUpdate(),
          html`Update Task`,
          { disabled: this.readonly }
        )}
      </div>

      <div class="block-footnote">
        Entity ID: ${this.entity?.entityId || 'none'} | Framework: Lit
      </div>
    `
  }
}
