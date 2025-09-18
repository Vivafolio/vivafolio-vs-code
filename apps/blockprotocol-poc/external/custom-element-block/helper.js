// We'll define a simple base class instead of requiring the external module
class BlockElementBase extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.entity = null
    this.graphModule = null
  }

  connectedCallback() {
    // Override in subclass
  }

  disconnectedCallback() {
    // Override in subclass
  }

  setEntity(entity) {
    this.entity = entity
  }

  getBlockEntity() {
    return this.entity
  }
}

function registerBlockElement(tagName, renderCallback) {
  if (customElements.get(tagName)) {
    return
  }

  class BlockProtocolElement extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this.renderCallback = renderCallback
      this.entity = null
      this.readonly = false
      this.updateEntityCallback = null
    }

    setEntity(entity) {
      this.entity = entity
      this.render()
    }

    async updateEntity(properties) {
      if (this.updateEntityCallback) {
        await this.updateEntityCallback(properties)
      }
    }

    render() {
      if (typeof this.renderCallback === 'function') {
        this.renderCallback({
          element: this,
          shadowRoot: this.shadowRoot,
          entity: this.entity,
          readonly: this.readonly,
          updateEntity: (properties) => this.updateEntity(properties)
        })
      }
    }

    connectedCallback() {
      this.render()
    }
  }

  customElements.define(tagName, BlockProtocolElement)
}

module.exports = {
  registerBlockElement
}
