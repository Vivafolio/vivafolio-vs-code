const React = require('react');

function FeatureShowcaseBlock({ entity, readonly, updateEntity }) {
  // Simple feature showcase - displays the entity data
  return React.createElement('div', {
    className: 'feature-showcase-block',
    style: {
      padding: '20px',
      border: '2px solid #6048E5',
      borderRadius: '8px',
      backgroundColor: '#f8f9ff'
    }
  }, [
    React.createElement('h3', {
      key: 'title',
      style: { margin: '0 0 16px 0', color: '#6048E5' }
    }, 'Block Protocol Feature Showcase'),
    React.createElement('p', {
      key: 'description',
      style: { margin: '0 0 16px 0' }
    }, 'This block demonstrates the Block Protocol graph module with @blockprotocol/graph@0.3.4'),
    React.createElement('div', {
      key: 'entity-info',
      style: {
        backgroundColor: 'white',
        padding: '12px',
        borderRadius: '4px',
        border: '1px solid #e0e0e0'
      }
    }, [
      React.createElement('strong', { key: 'label' }, 'Entity ID: '),
      React.createElement('span', { key: 'value' }, entity?.entityId || 'No entity loaded')
    ])
  ]);
}

module.exports = FeatureShowcaseBlock;
