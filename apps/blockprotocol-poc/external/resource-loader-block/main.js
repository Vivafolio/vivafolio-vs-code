const React = require('react')
const chunk = require('./chunk.js')
require('./style.css')

module.exports = function ResourceLoaderBlock(props) {
  const nameProperty =
    props.graph?.blockEntity?.properties?.['https://blockprotocol.org/@blockprotocol/types/property-type/name/'] ||
    props.graph?.blockEntity?.properties?.['https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1'] ||
    'Unknown'

  return React.createElement(
    'section',
    { className: 'cjs-resource-block' },
    React.createElement('h2', null, chunk.heading),
    React.createElement('p', null, chunk.message),
    React.createElement('p', { className: 'cjs-resource-block__name' }, `Entity name: ${nameProperty}`)
  )
}
