import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core'
import { BlockComponent, createBlock } from '../../src/index'

@Component({
  selector: 'app-angular-task-block',
  template: `
    <div class="block-container">
      <h3 class="block-heading">Task Block (Angular)</h3>

      <div class="block-body">
        <label class="block-field">
          <span class="block-field__label">Title:</span>
          <input
            type="text"
            [value]="title"
            [disabled]="readonly"
            placeholder="Enter task title..."
            class="block-input"
            (input)="onTitleInput($event)"
          />
        </label>

        <label class="block-field">
          <span class="block-field__label">Description:</span>
          <input
            type="text"
            [value]="description"
            [disabled]="readonly"
            placeholder="Enter task description..."
            class="block-input"
            (input)="onDescriptionInput($event)"
          />
        </label>

        <label class="block-field">
          <span class="block-field__label">Status:</span>
          <select
            [value]="status"
            [disabled]="readonly"
            class="block-select"
            (change)="onStatusChange($event)"
          >
            <option *ngFor="let option of statusOptions" [value]="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <button
          class="block-button block-button--primary"
          [disabled]="readonly"
          (click)="onUpdate()"
        >
          Update Task
        </button>
      </div>

      <div class="block-footnote">
        Entity ID: {{ entity?.entityId || 'none' }} | Framework: Angular
      </div>
    </div>
  `,
  styles: [`
    .block-container {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      color: white;
      border-radius: 12px;
      padding: 1.5rem;
    }

    .block-heading {
      color: white;
      margin: 0 0 1rem 0;
    }

    .block-field {
      margin-bottom: 1rem;
    }

    .block-field__label {
      color: #e9d5ff;
      margin-bottom: 0.5rem;
      display: block;
      font-weight: 600;
    }

    .block-input,
    .block-select {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 0.5rem;
      border-radius: 4px;
      width: 100%;
    }

    .block-input::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }

    .block-button {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .block-button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.3);
    }

    .block-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .block-footnote {
      color: #e9d5ff;
      margin-top: 1rem;
      opacity: 0.8;
    }
  `]
})
export class AngularTaskBlockComponent extends BlockComponent {
  @Input() graph!: any

  title = ''
  description = ''
  status = 'todo'

  statusOptions = [
    { value: 'todo', label: 'To Do' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'done', label: 'Done' }
  ]

  protected onGraphChange() {
    if (this.entity) {
      this.title = (this.entity.properties?.title as string) || ''
      this.description = (this.entity.properties?.description as string) || ''
      this.status = (this.entity.properties?.status as string) || 'todo'
    }
  }

  onTitleInput(event: Event) {
    const target = event.target as HTMLInputElement
    this.title = target.value
  }

  onDescriptionInput(event: Event) {
    const target = event.target as HTMLInputElement
    this.description = target.value
  }

  onStatusChange(event: Event) {
    const target = event.target as HTMLSelectElement
    this.status = target.value
  }

  onUpdate() {
    this.updateEntity({
      title: this.title,
      description: this.description,
      status: this.status,
      lastUpdated: new Date().toISOString()
    })
  }
}

// Apply Block Protocol metadata
export const AngularTaskBlock = createBlock(AngularTaskBlockComponent, {
  name: 'angular-task-block',
  version: '0.1.0',
  description: 'Task management block built with Angular'
})
