const React = require('react')

// TableViewBlock - Container block that displays entities in a table format (Svelte implementation)
function TableViewBlock({ graph }) {
  const { blockEntity, readonly } = graph

  // Mock data for demonstration - in a real implementation, this would come from the graph
  const mockTasks = [
    {
      id: 'task-1',
      title: 'Design new API',
      description: 'Create REST API for user management',
      status: 'in-progress',
      assignees: ['alice'],
      priority: 'high'
    },
    {
      id: 'task-2',
      title: 'Update documentation',
      description: 'Update API documentation with new endpoints',
      status: 'todo',
      assignees: ['bob', 'carol'],
      priority: 'medium'
    },
    {
      id: 'task-3',
      title: 'Fix login bug',
      description: 'Users unable to login with social accounts',
      status: 'done',
      assignees: ['dave'],
      priority: 'high'
    }
  ]

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

  const renderTableRow = (task) => {
    return React.createElement('tr', {
      key: task.id,
      style: {
        borderBottom: '1px solid #e5e7eb'
      }
    }, [
      // Title
      React.createElement('td', {
        key: 'title',
        style: {
          padding: '12px 8px',
          fontWeight: '500'
        }
      }, task.title),

      // Description
      React.createElement('td', {
        key: 'description',
        style: {
          padding: '12px 8px',
          color: '#6b7280',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }
      }, task.description),

      // Status
      React.createElement('td', {
        key: 'status',
        style: { padding: '12px 8px' }
      }, renderStatusPill(task.status)),

      // Assignees
      React.createElement('td', {
        key: 'assignees',
        style: { padding: '12px 8px' }
      }, React.createElement('div', {
        style: { display: 'flex', flexWrap: 'wrap' }
      }, task.assignees.map(personId => renderPersonChip(personId)))),

      // Priority
      React.createElement('td', {
        key: 'priority',
        style: { padding: '12px 8px' }
      }, renderPriority(task.priority))
    ])
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
      }, 'Tasks Table View'),
      React.createElement('p', {
        key: 'subtitle',
        style: {
          margin: '4px 0 0 0',
          fontSize: '14px',
          color: '#6b7280'
        }
      }, 'Spreadsheet-style view of project tasks')
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
      }, [
        React.createElement('th', {
          key: 'title',
          style: {
            padding: '12px 8px',
            textAlign: 'left',
            fontWeight: '600',
            color: '#374151'
          }
        }, 'Title'),
        React.createElement('th', {
          key: 'description',
          style: {
            padding: '12px 8px',
            textAlign: 'left',
            fontWeight: '600',
            color: '#374151'
          }
        }, 'Description'),
        React.createElement('th', {
          key: 'status',
          style: {
            padding: '12px 8px',
            textAlign: 'left',
            fontWeight: '600',
            color: '#374151'
          }
        }, 'Status'),
        React.createElement('th', {
          key: 'assignees',
          style: {
            padding: '12px 8px',
            textAlign: 'left',
            fontWeight: '600',
            color: '#374151'
          }
        }, 'Assignees'),
        React.createElement('th', {
          key: 'priority',
          style: {
            padding: '12px 8px',
            textAlign: 'left',
            fontWeight: '600',
            color: '#374151'
          }
        }, 'Priority')
      ])),

      // Table body
      React.createElement('tbody', {
        key: 'tbody'
      }, mockTasks.map(task => renderTableRow(task)))
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
    }, `Showing ${mockTasks.length} tasks • Framework: Svelte`)
  ])
}

module.exports = TableViewBlock
