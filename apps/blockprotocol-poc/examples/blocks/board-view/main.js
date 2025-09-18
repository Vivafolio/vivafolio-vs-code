const React = require('react')

// BoardViewBlock - Kanban board view that groups tasks by status (Lit implementation)
function BoardViewBlock({ graph }) {
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
    },
    {
      id: 'task-4',
      title: 'Add dark mode',
      description: 'Implement dark mode toggle and theme switching',
      status: 'todo',
      assignees: ['alice'],
      priority: 'low'
    },
    {
      id: 'task-5',
      title: 'Performance optimization',
      description: 'Optimize bundle size and loading performance',
      status: 'in-progress',
      assignees: ['carol'],
      priority: 'high'
    }
  ]

  const statusConfig = {
    'todo': {
      label: 'To Do',
      color: '#6b7280',
      bgColor: '#f3f4f6',
      tasks: mockTasks.filter(task => task.status === 'todo')
    },
    'in-progress': {
      label: 'In Progress',
      color: '#f59e0b',
      bgColor: '#fef3c7',
      tasks: mockTasks.filter(task => task.status === 'in-progress')
    },
    'done': {
      label: 'Done',
      color: '#10b981',
      bgColor: '#d1fae5',
      tasks: mockTasks.filter(task => task.status === 'done')
    }
  }

  const priorityConfig = {
    'low': { label: 'Low', color: '#6b7280', bgColor: '#f3f4f6' },
    'medium': { label: 'Medium', color: '#f59e0b', bgColor: '#fef3c7' },
    'high': { label: 'High', color: '#ef4444', bgColor: '#fee2e2' }
  }

  const mockPeople = {
    'alice': { name: 'Alice Johnson', avatar: 'AJ', color: '#3b82f6' },
    'bob': { name: 'Bob Smith', avatar: 'BS', color: '#10b981' },
    'carol': { name: 'Carol Davis', avatar: 'CD', color: '#f59e0b' },
    'dave': { name: 'Dave Wilson', avatar: 'DW', color: '#8b5cf6' }
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

  const renderPriorityBadge = (priority) => {
    const config = priorityConfig[priority] || priorityConfig.medium
    return React.createElement('span', {
      key: 'priority',
      style: {
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: '8px',
        backgroundColor: config.bgColor,
        color: config.color,
        fontSize: '10px',
        fontWeight: '600'
      }
    }, config.label)
  }

  const renderTaskCard = (task) => {
    return React.createElement('div', {
      key: task.id,
      className: 'task-card',
      style: {
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        cursor: readonly ? 'default' : 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }
    }, [
      React.createElement('div', {
        key: 'header',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px'
        }
      }, [
        React.createElement('h4', {
          key: 'title',
          style: {
            margin: '0',
            fontSize: '14px',
            fontWeight: '600',
            color: '#111827',
            flex: '1'
          }
        }, task.title),
        renderPriorityBadge(task.priority)
      ]),

      React.createElement('p', {
        key: 'description',
        style: {
          margin: '0 0 8px 0',
          fontSize: '12px',
          color: '#6b7280',
          lineHeight: '1.4'
        }
      }, task.description),

      React.createElement('div', {
        key: 'assignees',
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          marginBottom: '8px'
        }
      }, task.assignees.map(personId => renderPersonChip(personId))),

      React.createElement('div', {
        key: 'footer',
        style: {
          fontSize: '10px',
          color: '#9ca3af'
        }
      }, `ID: ${task.id}`)
    ])
  }

  const renderKanbanColumn = (statusKey, config) => {
    return React.createElement('div', {
      key: statusKey,
      className: 'kanban-column',
      style: {
        flex: '1',
        minWidth: '280px',
        margin: '0 8px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        padding: '16px'
      }
    }, [
      React.createElement('div', {
        key: 'header',
        style: {
          display: 'flex',
          alignItems: 'center',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: '2px solid #e5e7eb'
        }
      }, [
        React.createElement('div', {
          key: 'status-indicator',
          style: {
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: config.color,
            marginRight: '8px'
          }
        }),
        React.createElement('h3', {
          key: 'title',
          style: {
            margin: '0',
            fontSize: '16px',
            fontWeight: '600',
            color: '#374151'
          }
        }, config.label),
        React.createElement('span', {
          key: 'count',
          style: {
            marginLeft: '8px',
            backgroundColor: config.color,
            color: 'white',
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: '600'
          }
        }, config.tasks.length)
      ]),

      React.createElement('div', {
        key: 'tasks',
        className: 'kanban-tasks'
      }, config.tasks.map(task => renderTaskCard(task)))
    ])
  }

  return React.createElement('div', {
    className: 'board-view-block',
    style: {
      width: '100%',
      padding: '20px',
      backgroundColor: '#f3f4f6',
      minHeight: '600px'
    }
  }, [
    // Header
    React.createElement('div', {
      key: 'header',
      style: {
        marginBottom: '24px',
        textAlign: 'center'
      }
    }, [
      React.createElement('h2', {
        key: 'title',
        style: {
          margin: '0 0 8px 0',
          fontSize: '24px',
          fontWeight: '700',
          color: '#111827'
        }
      }, 'Project Board'),
      React.createElement('p', {
        key: 'subtitle',
        style: {
          margin: '0',
          fontSize: '16px',
          color: '#6b7280'
        }
      }, 'Kanban-style task management board')
    ]),

    // Kanban board
    React.createElement('div', {
      key: 'kanban-board',
      style: {
        display: 'flex',
        gap: '16px',
        overflowX: 'auto',
        paddingBottom: '16px'
      }
    }, Object.entries(statusConfig).map(([statusKey, config]) =>
      renderKanbanColumn(statusKey, config)
    )),

    // Footer
    React.createElement('div', {
      key: 'footer',
      style: {
        marginTop: '24px',
        textAlign: 'center',
        fontSize: '14px',
        color: '#6b7280'
      }
    }, `Total: ${mockTasks.length} tasks • Framework: Lit`)
  ])
}

module.exports = BoardViewBlock
