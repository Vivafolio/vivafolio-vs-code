// SolidJS Task Block - Custom Element Implementation
class SolidJSTaskBlock extends HTMLElement {
  constructor() {
    super()
    this.entity = null
    this.readonly = false
    this.updateEntityCallback = null
  }

  connectedCallback() {
    this.render()
  }

  setEntity(entity) {
    this.entity = entity
    this.render()
  }

  setReadonly(readonly) {
    this.readonly = readonly
    this.render()
  }

  setUpdateEntityCallback(callback) {
    this.updateEntityCallback = callback
  }

  handleUpdate(property, value) {
    if (this.updateEntityCallback && !this.readonly) {
      this.updateEntityCallback({ [property]: value })
    }
  }

  render() {
    // Clear existing content
    this.innerHTML = ''

    // Add styles
    const style = document.createElement('style')
    style.textContent = `
      .solidjs-task-block {
        padding: 20px;
        border: 2px solid #8b5cf6;
        border-radius: 8px;
        background: rgba(139, 92, 246, 0.08);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .solidjs-task-block h3 {
        margin: 0 0 16px 0;
        color: #5b21b6;
      }
      .solidjs-task-block .block-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .solidjs-task-block label {
        display: flex;
        flex-direction: column;
        font-size: 14px;
        color: #374151;
      }
      .solidjs-task-block input,
      .solidjs-task-block select {
        padding: 8px;
        border: 1px solid #ddd6fe;
        border-radius: 4px;
        font-size: 14px;
        background: white;
        margin-top: 4px;
      }
      .solidjs-task-block input:disabled,
      .solidjs-task-block select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .solidjs-task-block button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background: #8b5cf6;
        color: white;
        font-weight: bold;
        cursor: pointer;
        align-self: flex-start;
      }
      .solidjs-task-block button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .solidjs-task-block button:hover:not(:disabled) {
        background: #7c3aed;
      }
      .solidjs-task-block .block-footnote {
        margin-top: 16px;
        font-size: 12px;
        color: #5b21b6;
      }
    `
    this.appendChild(style)

    // Create container
    const container = document.createElement('div')
    container.className = 'solidjs-task-block'

    // Title
    const title = document.createElement('h3')
    title.textContent = 'SolidJS Task Block'
    container.appendChild(title)

    // Body
    const body = document.createElement('div')
    body.className = 'block-body'

    // Title field
    const titleLabel = document.createElement('label')
    titleLabel.textContent = 'Title:'
    const titleInput = document.createElement('input')
    titleInput.type = 'text'
    titleInput.value = this.entity?.properties?.title || ''
    titleInput.disabled = this.readonly
    titleInput.addEventListener('input', (e) => {
      this.handleUpdate('title', e.target.value)
    })
    titleLabel.appendChild(titleInput)
    body.appendChild(titleLabel)

    // Description field
    const descLabel = document.createElement('label')
    descLabel.textContent = 'Description:'
    const descInput = document.createElement('input')
    descInput.type = 'text'
    descInput.value = this.entity?.properties?.description || ''
    descInput.disabled = this.readonly
    descInput.addEventListener('input', (e) => {
      this.handleUpdate('description', e.target.value)
    })
    descLabel.appendChild(descInput)
    body.appendChild(descLabel)

    // Status selector
    const statusLabel = document.createElement('label')
    statusLabel.textContent = 'Status:'
    const statusSelect = document.createElement('select')
    statusSelect.disabled = this.readonly
    const statuses = ['todo', 'in-progress', 'done']
    statuses.forEach(status => {
      const option = document.createElement('option')
      option.value = status
      option.textContent = status.charAt(0).toUpperCase() + status.slice(1)
      if (this.entity?.properties?.status === status) {
        option.selected = true
      }
      statusSelect.appendChild(option)
    })
    statusSelect.addEventListener('change', (e) => {
      this.handleUpdate('status', e.target.value)
    })
    statusLabel.appendChild(statusSelect)
    body.appendChild(statusLabel)

    // Update button
    const button = document.createElement('button')
    button.textContent = 'Update Task'
    button.disabled = this.readonly
    button.addEventListener('click', () => {
      this.handleUpdate('lastUpdated', new Date().toISOString())
    })
    body.appendChild(button)

    container.appendChild(body)

    // Footnote
    const footnote = document.createElement('div')
    footnote.className = 'block-footnote'
    footnote.textContent = `Entity ID: ${this.entity?.entityId || 'none'} | Framework: SolidJS`
    container.appendChild(footnote)

    this.appendChild(container)
  }
}

// Register the custom element
if (!customElements.get('solidjs-task-block')) {
  customElements.define('solidjs-task-block', SolidJSTaskBlock)
}

// Export the Block Protocol compatible factory function
module.exports = function SolidJSTaskBlockFactory(graphModule) {
  return {
    element: SolidJSTaskBlock,
    init: function({ element, entity, readonly, updateEntity }) {
      if (element && typeof element.setEntity === 'function') {
        element.setEntity(entity)
        element.setReadonly(readonly)
        element.setUpdateEntityCallback(updateEntity)
      }
    },
    updateEntity: function({ element, entity, readonly }) {
      if (element && typeof element.setEntity === 'function') {
        element.setEntity(entity)
        element.setReadonly(readonly)
      }
    }
  }
}
