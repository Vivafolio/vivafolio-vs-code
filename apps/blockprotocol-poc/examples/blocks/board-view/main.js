const React = require('react')

// BoardViewBlock - Kanban board view that groups tasks by status (Lit implementation)
function BoardViewBlock({ graph }) {
  const { blockEntity, readonly } = graph

  // State for editing
  const [editingTaskId, setEditingTaskId] = React.useState(null)
  const [editForm, setEditForm] = React.useState({ title: '', description: '' })

  // Mock data for demonstration - in a real implementation, this would come from the graph
  const [mockTasks, setMockTasks] = React.useState([
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
  ])

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

  // Editing functions
  const startEditing = (task) => {
    if (readonly) return
    setEditingTaskId(task.id)
    setEditForm({ title: task.title, description: task.description })
  }

  const cancelEditing = () => {
    setEditingTaskId(null)
    setEditForm({ title: '', description: '' })
  }

  const saveEditing = () => {
    if (!editingTaskId) return

    setMockTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === editingTaskId
          ? { ...task, title: editForm.title, description: editForm.description }
          : task
      )
    )
    setEditingTaskId(null)
    setEditForm({ title: '', description: '' })
  }

  const handleInputChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
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
    const isEditing = editingTaskId === task.id

    if (isEditing) {
      // Edit mode
      return React.createElement('div', {
        key: task.id,
        className: 'task-card editing',
        style: {
          backgroundColor: 'white',
          border: '2px solid #3b82f6',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
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
          React.createElement('input', {
            key: 'title-input',
            type: 'text',
            value: editForm.title,
            onChange: (e) => handleInputChange('title', e.target.value),
            style: {
              flex: '1',
              fontSize: '14px',
              fontWeight: '600',
              color: '#111827',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '4px 8px',
              marginRight: '8px'
            }
          }),
          renderPriorityBadge(task.priority)
        ]),

        React.createElement('textarea', {
          key: 'description-input',
          value: editForm.description,
          onChange: (e) => handleInputChange('description', e.target.value),
          style: {
            width: '100%',
            minHeight: '60px',
            fontSize: '12px',
            color: '#6b7280',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            padding: '4px 8px',
            marginBottom: '8px',
            resize: 'vertical'
          }
        }),

        React.createElement('div', {
          key: 'assignees',
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            marginBottom: '8px'
          }
        }, task.assignees.map(personId => renderPersonChip(personId))),

        React.createElement('div', {
          key: 'actions',
          style: {
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end'
          }
        }, [
          React.createElement('button', {
            key: 'cancel',
            onClick: cancelEditing,
            style: {
              padding: '4px 12px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }
          }, 'Cancel'),
          React.createElement('button', {
            key: 'save',
            onClick: saveEditing,
            style: {
              padding: '4px 12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }
          }, 'Save')
        ]),

        React.createElement('div', {
          key: 'footer',
          style: {
            fontSize: '10px',
            color: '#9ca3af',
            marginTop: '8px'
          }
        }, `ID: ${task.id}`)
      ])
    } else {
      // View mode
      return React.createElement('div', {
        key: task.id,
        className: 'task-card',
        onClick: () => startEditing(task),
        style: {
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '8px',
          cursor: readonly ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        },
        onMouseEnter: (e) => {
          if (!readonly) {
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
          }
        },
        onMouseLeave: (e) => {
          if (!readonly) {
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
          }
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
    }, `Total: ${mockTasks.length} tasks • Framework: Lit • ${readonly ? 'Read-only' : 'Click to edit'}`)
  ])
}

module.exports = BoardViewBlock
