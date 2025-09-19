const React = require('react')

// TableViewBlock - Container block that displays entities in a table format (React implementation)
function TableViewBlock({ graph }) {
  const { blockEntity, readonly } = graph

  // Get entities from the graph - these come from initialGraph
  const entities = graph.initialGraph?.entities || []

  // Filter entities that look like table rows (from vivafolio_data! constructs)
  const tableEntities = entities.filter(entity =>
    entity.entityId && entity.entityId.includes('-row-')
  )

  // Extract table data from entities
  const tableData = tableEntities.map(entity => ({
    id: entity.entityId,
    ...entity.properties
  }))

  // Extract column headers from the first entity
  const columns = tableData.length > 0 ? Object.keys(tableData[0]).filter(key => key !== 'id') : []

  const statusConfig = {
    'todo': { label: 'To Do', color: '#6b7280', bgColor: '#f3f4f6' },
    'in-progress': { label: 'In Progress', color: '#f59e0b', bgColor: '#fef3c7' },
    'done': { label: 'Done', color: '#10b981', bgColor: '#d1fae5' }
  }

  const priorityConfig = {
    'low': { label: 'Low', color: '#6b7280' },
    'medium': { label: 'Medium', color: '#f59e0b' },
    'high': { label: 'High', color: '#ef4444' }
  }

  const mockPeople = {
    'alice': { name: 'Alice Johnson', avatar: 'AJ', color: '#3b82f6' },
    'bob': { name: 'Bob Smith', avatar: 'BS', color: '#10b981' },
    'carol': { name: 'Carol Davis', avatar: 'CD', color: '#f59e0b' },
    'dave': { name: 'Dave Wilson', avatar: 'DW', color: '#8b5cf6' }
  }

  const renderStatusPill = (status) => {
    const config = statusConfig[status] || statusConfig.todo
    return React.createElement('div', {
      key: 'status',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        borderRadius: '8px',
        backgroundColor: config.bgColor,
        border: `1px solid ${config.color}30`,
        fontSize: '11px',
        fontWeight: '500',
        color: config.color
      }
    }, [
      React.createElement('div', {
        key: 'dot',
        style: {
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          backgroundColor: config.color,
          marginRight: '4px'
        }
      }),
      config.label
    ])
  }

  const renderPersonChip = (personId) => {
    const person = mockPeople[personId] || mockPeople.alice
    return React.createElement('div', {
      key: personId,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 4px',
        margin: '1px',
        borderRadius: '8px',
        backgroundColor: '#f3f4f6',
        border: '1px solid #e5e7eb',
        fontSize: '11px'
      }
    }, [
      React.createElement('div', {
        key: 'avatar',
        style: {
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          backgroundColor: person.color,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          fontWeight: '600',
          marginRight: '4px'
        }
      }, person.avatar),
      person.name
    ])
  }

  const renderPriority = (priority) => {
    const config = priorityConfig[priority] || priorityConfig.medium
    return React.createElement('span', {
      key: 'priority',
      style: {
        color: config.color,
        fontWeight: '600',
        fontSize: '11px'
      }
    }, config.label)
  }

  const renderTableRow = (row) => {
    return React.createElement('tr', {
      key: row.id,
      style: {
        borderBottom: '1px solid #e5e7eb'
      }
    }, columns.map(column => {
      const value = row[column]
      let cellContent = value

      // Special rendering for known column types
      if (column.toLowerCase().includes('status') && statusConfig[value]) {
        cellContent = renderStatusPill(value)
      } else if (column.toLowerCase().includes('priority') && priorityConfig[value]) {
        cellContent = renderPriority(value)
      }

      return React.createElement('td', {
        key: column,
        style: {
          padding: '12px 8px',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }
      }, cellContent)
    }))
  }

  return React.createElement('div', {
    className: 'table-view-block',
    style: {
      width: '100%',
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'hidden'
    }
  }, [
    // Header
    React.createElement('div', {
      key: 'header',
      style: {
        padding: '16px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }
    }, [
      React.createElement('h3', {
        key: 'title',
        style: {
          margin: '0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#111827'
        }
      }, 'Data Table View'),
      React.createElement('p', {
        key: 'subtitle',
        style: {
          margin: '4px 0 0 0',
          fontSize: '14px',
          color: '#6b7280'
        }
      }, `Live data from vivafolio_data!() constructs • ${tableData.length} rows`)
    ]),

    // Table
    React.createElement('div', {
      key: 'table-container',
      style: { overflowX: 'auto' }
    }, React.createElement('table', {
      key: 'table',
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '14px'
      }
    }, [
      // Table header
      React.createElement('thead', {
        key: 'thead',
        style: {
          backgroundColor: '#f9fafb',
          borderBottom: '2px solid #e5e7eb'
        }
      }, React.createElement('tr', {
        key: 'header-row'
      }, columns.map(column =>
        React.createElement('th', {
          key: column,
          style: {
            padding: '12px 8px',
            textAlign: 'left',
            fontWeight: '600',
            color: '#374151'
          }
        }, column.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())) // Convert camelCase to Title Case
      ))),

      // Table body
      React.createElement('tbody', {
        key: 'tbody'
      }, tableData.map(row => renderTableRow(row)))
    ])),

    // Footer
    React.createElement('div', {
      key: 'footer',
      style: {
        padding: '12px 16px',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        fontSize: '12px',
        color: '#6b7280'
      }
    }, `Showing ${tableData.length} rows • ${columns.length} columns • Powered by Indexing Service`)
  ])
}

module.exports = TableViewBlock
