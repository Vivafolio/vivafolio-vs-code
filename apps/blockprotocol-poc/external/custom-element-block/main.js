const React = require('react')
const { registerBlockElement } = require('./helper.js')
require('./style.css')

const NAME_BASE = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/'
const NAME_VERSIONED = `${NAME_BASE}v/1`

registerBlockElement('vivafolio-custom-block', ({ shadowRoot, entity, readonly, updateEntity }) => {
  if (!shadowRoot) return

  if (!shadowRoot.querySelector('.custom-block-root')) {
    const container = document.createElement('div')
    container.className = 'custom-block-root'
    container.innerHTML = `
      <style>@import url("./style.css");</style>
      <h3 class="block-heading">Custom Element Block</h3>
      <div class="block-body">
        <p class="entity-copy"></p>
        <label>
          Update name
          <input type="text" class="name-input" />
        </label>
        <button type="button" class="append-button">Append “ ✅”</button>
      </div>
      <p class="block-footnote">Graph updates propagate to sibling views.</p>
    `
    shadowRoot.appendChild(container)

    const input = shadowRoot.querySelector('.name-input')
    const button = shadowRoot.querySelector('.append-button')

    input?.addEventListener('change', async (event) => {
      const value = event.target.value
      await updateEntity({
        [NAME_BASE]: value,
        [NAME_VERSIONED]: value
      })
    })

    button?.addEventListener('click', async () => {
      const current = shadowRoot.querySelector('.name-input')?.value ?? ''
      const next = current.endsWith(' ✅') ? current : `${current} ✅`
      await updateEntity({
        [NAME_BASE]: next,
        [NAME_VERSIONED]: next
      })
    })
  }

  const copy = shadowRoot.querySelector('.entity-copy')
  const input = shadowRoot.querySelector('.name-input')
  const button = shadowRoot.querySelector('.append-button')

  const currentName =
    entity?.properties?.[NAME_BASE] ??
    entity?.properties?.[NAME_VERSIONED] ??
    'Unknown'

  if (copy) {
    copy.textContent = `Entity name: ${currentName}`
  }

  if (input && document.activeElement !== input) {
    input.value = currentName
  }

  if (button) {
    button.disabled = readonly
  }
  if (input) {
    input.disabled = readonly
  }
})

module.exports = function CustomElementBlock() {
  return React.createElement('vivafolio-custom-block')
}
