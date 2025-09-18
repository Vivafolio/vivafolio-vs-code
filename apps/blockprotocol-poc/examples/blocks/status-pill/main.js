const React = require('react')

// StatusPillBlock - Property renderer for status values (SolidJS implementation)
function StatusPillBlock({ graph }) {
  const { blockEntity, readonly } = graph

  // Status configuration with colors and labels
  const statusConfig = {
    'todo': { label: 'To Do', color: '#6b7280', bgColor: '#f3f4f6' },
    'in-progress': { label: 'In Progress', color: '#f59e0b', bgColor: '#fef3c7' },
    'done': { label: 'Done', color: '#10b981', bgColor: '#d1fae5' },
    'blocked': { label: 'Blocked', color: '#ef4444', bgColor: '#fee2e2' },
    'review': { label: 'Review', color: '#8b5cf6', bgColor: '#e9d5ff' }
  }

  const currentStatus = blockEntity?.properties?.status || 'todo'
  const config = statusConfig[currentStatus] || statusConfig.todo

  const handleStatusChange = (newStatus) => {
    if (!readonly) {
      // In a real implementation, this would call the Block Protocol updateEntity method
      console.log('StatusPillBlock: Status changed to', newStatus)
    }
  }

  return React.createElement('div', {
    className: 'status-pill-block',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 8px',
      borderRadius: '12px',
      backgroundColor: config.bgColor,
      border: `1px solid ${config.color}20`,
      fontSize: '12px',
      fontWeight: '500',
      color: config.color,
      cursor: readonly ? 'default' : 'pointer',
      transition: 'all 0.2s ease'
    },
    onClick: readonly ? null : () => {
      // Cycle through statuses for demo
      const statuses = Object.keys(statusConfig)
      const currentIndex = statuses.indexOf(currentStatus)
      const nextIndex = (currentIndex + 1) % statuses.length
      handleStatusChange(statuses[nextIndex])
    }
  }, [
    // Status indicator dot
    React.createElement('div', {
      key: 'dot',
      style: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: config.color,
        marginRight: '6px',
        flexShrink: 0
      }
    }),
    // Status text
    React.createElement('span', {
      key: 'text',
      style: {
        whiteSpace: 'nowrap'
      }
    }, config.label),
    // Dropdown arrow (only if not readonly)
    !readonly ? React.createElement('div', {
      key: 'arrow',
      style: {
        marginLeft: '4px',
        fontSize: '10px',
        opacity: 0.6
      }
    }, '▼') : null
  ].filter(Boolean))
}

module.exports = StatusPillBlock