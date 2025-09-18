const React = require('react')

// PersonChipBlock - Property renderer for person/assignee values (Vue.js implementation)
function PersonChipBlock({ graph }) {
  const { blockEntity, readonly } = graph

  // Mock person data - in a real implementation, this would come from the graph
  const mockPeople = {
    'alice': { name: 'Alice Johnson', avatar: 'AJ', color: '#3b82f6' },
    'bob': { name: 'Bob Smith', avatar: 'BS', color: '#10b981' },
    'carol': { name: 'Carol Davis', avatar: 'CD', color: '#f59e0b' },
    'dave': { name: 'Dave Wilson', avatar: 'DW', color: '#8b5cf6' }
  }

  const assignees = blockEntity?.properties?.assignees || ['alice']

  const handleAssigneeToggle = (personId) => {
    if (!readonly) {
      console.log('PersonChipBlock: Toggled assignee', personId)
    }
  }

  const renderPersonChip = (personId) => {
    const person = mockPeople[personId] || mockPeople.alice

    return React.createElement('div', {
      key: personId,
      className: 'person-chip',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        margin: '1px',
        borderRadius: '12px',
        backgroundColor: '#f3f4f6',
        border: '1px solid #e5e7eb',
        fontSize: '12px',
        cursor: readonly ? 'default' : 'pointer',
        transition: 'all 0.2s ease'
      },
      onClick: readonly ? null : () => handleAssigneeToggle(personId)
    }, [
      // Avatar
      React.createElement('div', {
        key: 'avatar',
        className: 'person-avatar',
        style: {
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: person.color,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: '600',
          marginRight: '6px',
          flexShrink: 0
        }
      }, person.avatar),
      // Name
      React.createElement('span', {
        key: 'name',
        style: {
          whiteSpace: 'nowrap',
          fontWeight: '500'
        }
      }, person.name),
      // Remove button (only if not readonly and more than one assignee)
      !readonly && assignees.length > 1 ? React.createElement('button', {
        key: 'remove',
        style: {
          marginLeft: '4px',
          background: 'none',
          border: 'none',
          color: '#6b7280',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '0',
          width: '14px',
          height: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%'
        },
        onClick: (e) => {
          e.stopPropagation()
          handleAssigneeToggle(personId)
        }
      }, '×') : null
    ].filter(Boolean))
  }

  // Add person button (only if not readonly)
  const addButton = !readonly ? React.createElement('button', {
    key: 'add',
    className: 'add-person-button',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      backgroundColor: '#e5e7eb',
      border: '1px solid #d1d5db',
      color: '#6b7280',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold',
      margin: '1px',
      transition: 'all 0.2s ease'
    },
    onClick: () => {
      console.log('PersonChipBlock: Add person clicked')
    }
  }, '+') : null

  return React.createElement('div', {
    className: 'person-chip-block',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '2px'
    }
  }, [
    // Render chips for each assignee
    ...assignees.map(personId => renderPersonChip(personId)),
    // Add button
    addButton
  ].filter(Boolean))
}

module.exports = PersonChipBlock