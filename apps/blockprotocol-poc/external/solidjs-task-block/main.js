const React = require('react')

// Simple SolidJS-inspired block using React for now
function SolidJSTaskBlock({ graph }) {
  const { blockEntity, readonly } = graph

  return React.createElement('div', {
    className: 'solidjs-task-block',
    style: {
      padding: '20px',
      border: '2px solid #10b981',
      borderRadius: '8px',
      backgroundColor: '#f0fdf4'
    }
  }, [
    React.createElement('h3', {
      key: 'title',
      style: { margin: '0 0 16px 0', color: '#047857' }
    }, 'SolidJS Task Block'),

    React.createElement('div', {
      key: 'content',
      style: { display: 'flex', flexDirection: 'column', gap: '12px' }
    }, [
      React.createElement('label', {
        key: 'title-label',
        style: { display: 'flex', flexDirection: 'column', fontSize: '14px', color: '#065f46' }
      }, [
        'Title:',
        React.createElement('input', {
          key: 'title-input',
          type: 'text',
          value: blockEntity?.properties?.title || '',
          disabled: readonly,
          style: {
            padding: '8px',
            border: '1px solid #d1fae5',
            borderRadius: '4px',
            fontSize: '14px'
          },
          onChange: (e) => {
            console.log('SolidJS block title changed:', e.target.value)
          }
        })
      ]),

      React.createElement('label', {
        key: 'status-label',
        style: { display: 'flex', flexDirection: 'column', fontSize: '14px', color: '#065f46' }
      }, [
        'Status:',
        React.createElement('select', {
          key: 'status-select',
          value: blockEntity?.properties?.status || 'todo',
          disabled: readonly,
          style: {
            padding: '8px',
            border: '1px solid #d1fae5',
            borderRadius: '4px',
            fontSize: '14px'
          },
          onChange: (e) => {
            console.log('SolidJS block status changed:', e.target.value)
          }
        }, [
          React.createElement('option', { key: 'todo', value: 'todo' }, 'To Do'),
          React.createElement('option', { key: 'in-progress', value: 'in-progress' }, 'In Progress'),
          React.createElement('option', { key: 'done', value: 'done' }, 'Done')
        ])
      ]),

      React.createElement('button', {
        key: 'update-btn',
        disabled: readonly,
        style: {
          padding: '8px 16px',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: '#10b981',
          color: 'white',
          fontWeight: 'bold',
          cursor: readonly ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start'
        },
        onClick: () => {
          console.log('SolidJS block update clicked')
        }
      }, 'Update Task')
    ]),

    React.createElement('div', {
      key: 'footer',
      style: { marginTop: '16px', fontSize: '12px', color: '#065f46' }
    }, `Entity ID: ${blockEntity?.entityId || 'none'} | Framework: SolidJS`)
  ])
}

module.exports = SolidJSTaskBlock
