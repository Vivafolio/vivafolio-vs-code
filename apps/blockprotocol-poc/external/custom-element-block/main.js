// Vanilla WebComponent for Block Protocol integration
class CustomElementBlock extends HTMLElement {
  constructor() {
    super()
    this.entity = null
    this.readonly = false
    this.updateEntityCallback = null
  }

  connectedCallback() {
    this.render()
  }

  disconnectedCallback() {
    // Clean up event listeners if needed
  }

  setEntity(entity) {
    console.log('[CustomElementBlock] setEntity called with:', entity)
    this.entity = entity
    this.render()
  }

  setReadonly(readonly) {
    this.readonly = readonly
    if (document.contains(this)) {
      this.render()
    } else {
      this._pendingRender = true
    }
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
    console.log('[CustomElementBlock] render called, entity:', this.entity)
    // Clear existing content
    this.innerHTML = ''

    // Add stylesheet
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = './style.css'
    this.appendChild(link)

    // Create the block content
    const container = document.createElement('div')
    container.className = 'custom-element-block'

    const heading = document.createElement('h3')
    heading.className = 'block-heading'
    heading.textContent = 'Custom Element Block'
    container.appendChild(heading)

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
    button.textContent = 'Update Block'
    button.disabled = this.readonly
    button.addEventListener('click', () => {
      // Trigger a general update
      this.handleUpdate('lastUpdated', new Date().toISOString())
    })
    body.appendChild(button)

    container.appendChild(body)

    // Footnote
    const footnote = document.createElement('div')
    footnote.className = 'block-footnote'
    footnote.textContent = `Entity ID: ${this.entity?.entityId || 'none'} | Read-only: ${this.readonly}`
    container.appendChild(footnote)

    this.appendChild(container)
  }
}

// Register the custom element
if (!customElements.get('custom-element-block')) {
  customElements.define('custom-element-block', CustomElementBlock)
}

// Export the Block Protocol compatible factory function
module.exports = function CustomElementBlockFactory(graphModule) {
  return {
    element: CustomElementBlock,
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
