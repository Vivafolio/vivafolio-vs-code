const { GraphBlockHandler } = require('@blockprotocol/graph')

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
      this.graphHandler = new GraphBlockHandler({
        element: this,
        callbacks: {
          blockEntity: ({ data }) => {
            if (data) {
              this.setEntity(data)
            }
          },
          readonly: ({ data }) => {
            this.readonly = Boolean(data)
            this.render()
          }
        }
      })
    }

    setEntity(entity) {
      this.entity = entity
      this.render()
    }

    async updateEntity(properties) {
      if (!this.entity) return
      const entityId = this.entity.metadata?.recordId?.entityId ?? this.entity.entityId
      const entityTypeId = this.entity.metadata?.entityTypeId ?? this.entity.entityTypeId
      const response = await this.graphHandler.updateEntity({
        data: {
          entityId,
          entityTypeId,
          properties
        }
      })
      if (response?.data) {
        this.entity = response.data
        this.render()
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

    disconnectedCallback() {
      this.graphHandler.destroy()
    }
  }

  customElements.define(tagName, BlockProtocolElement)
}

module.exports = {
  registerBlockElement
}
