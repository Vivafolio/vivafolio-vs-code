const React = require('react')

module.exports = function CustomElementBlock({ entity, readonly, updateEntity }) {
  // For now, just render a simple div - we'll enhance this later
  return React.createElement('div', {
    className: 'custom-element-placeholder',
    style: {
      padding: '20px',
      border: '2px dashed #ccc',
      borderRadius: '8px',
      textAlign: 'center',
      backgroundColor: '#f9f9f9'
    }
  }, 'Custom Element Block - Coming Soon!')
}
