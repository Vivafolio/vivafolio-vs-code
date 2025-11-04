// Board View Block - SolidJS implementation
import { createSignal, For, createMemo } from 'solid-js'

// Block Protocol types
interface Entity {
  entityId: string
  entityTypeId: string
  properties: Record<string, unknown>
}

interface BlockGraph {
  depth: number
  linkedEntities: Entity[]
  linkGroups: Array<Record<string, unknown>>
}

interface GraphService {
  blockEntity: Entity
  blockGraph: BlockGraph
  entityTypes: Array<Record<string, unknown>>
  linkedAggregations: Array<Record<string, unknown>>
  readonly: boolean
  updateEntity?(updates: Partial<Entity['properties']>): void
}

interface BlockProps {
  graph: GraphService
}

// SolidJS Block Protocol helper
function createBlockElement(
  component: (props: BlockProps) => any,
  options: {
    name: string
    version?: string
    description?: string
  }
) {
  return {
    component,
    metadata: options
  }
}

// Board View Component - export the component directly for BlockLoader compatibility
const BoardViewComponent = (props: BlockProps) => {
  // Mock data for demonstration - in a real implementation, this would come from the graph
  const [mockTasks, setMockTasks] = createSignal([
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
      description: 'Resolve authentication issue in login flow',
      status: 'done',
      assignees: ['carol'],
      priority: 'high'
    },
    {
      id: 'task-4',
      title: 'Setup CI/CD',
      description: 'Configure automated deployment pipeline',
      status: 'todo',
      assignees: ['alice'],
      priority: 'low'
    },
    {
      id: 'task-5',
      title: 'Database optimization',
      description: 'Improve query performance for large datasets',
      status: 'in-progress',
      assignees: ['bob'],
      priority: 'medium'
    }
  ])

  const statusColumns = {
    'todo': { label: 'To Do', color: '#6b7280' },
    'in-progress': { label: 'In Progress', color: '#f59e0b' },
    'done': { label: 'Done', color: '#10b981' }
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

  const renderPriorityPill = (priority: string) => {
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium
    return (
      <div
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          padding: '1px 4px',
          'border-radius': '4px',
          'background-color': config.bgColor,
          'font-size': '10px',
          'font-weight': '500',
          color: config.color,
          'margin-top': '4px'
        }}
      >
        {config.label}
      </div>
    )
  }

  const renderPersonChip = (personId: string) => {
    const person = mockPeople[personId as keyof typeof mockPeople] || mockPeople.alice
    return (
      <div
        class="person-chip"
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          padding: '1px 3px',
          margin: '1px',
          'border-radius': '6px',
          'background-color': '#f3f4f6',
          border: '1px solid #e5e7eb',
          'font-size': '10px'
        }}
      >
        <div
          class="person-avatar"
          style={{
            width: '12px',
            height: '12px',
            'border-radius': '50%',
            'background-color': person.color,
            color: 'white',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '7px',
            'font-weight': '600',
            'margin-right': '3px',
            'flex-shrink': '0'
          }}
        >
          {person.avatar}
        </div>
        <span style={{ 'white-space': 'nowrap', 'font-weight': '500' }}>
          {person.name}
        </span>
      </div>
    )
  }

  return (
    <div class="board-view-block" style={{
      width: '100%',
      'background-color': 'white',
      border: '1px solid #e5e7eb',
      'border-radius': '8px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        'border-bottom': '1px solid #e5e7eb',
        'background-color': '#f9fafb'
      }}>
        <h3 style={{
          margin: '0 0 8px 0',
          'font-size': '18px',
          'font-weight': '600',
          color: '#111827'
        }}>
          Kanban Board View
        </h3>
        <p style={{
          margin: '0',
          'font-size': '14px',
          color: '#6b7280'
        }}>
          Interactive task management • {mockTasks().length} tasks
        </p>
      </div>

      {/* Kanban Board */}
      <div style={{
        display: 'flex',
        gap: '16px',
        padding: '16px',
        overflow: 'auto',
        'min-height': '400px'
      }}>
        <For each={Object.entries(statusColumns)}>
          {([statusKey, statusInfo]) => {
            const columnTasks = createMemo(() =>
              mockTasks().filter(task => task.status === statusKey)
            )

            return (
              <div class="kanban-column" style={{
                'flex': '1',
                'min-width': '250px',
                'background-color': '#f9fafb',
                'border-radius': '8px',
                'padding': '12px'
              }}>
                {/* Column Header */}
                <div style={{
                  display: 'flex',
                  'align-items': 'center',
                  'margin-bottom': '12px',
                  'padding-bottom': '8px',
                  'border-bottom': `2px solid ${statusInfo.color}`
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    'border-radius': '50%',
                    'background-color': statusInfo.color,
                    'margin-right': '8px'
                  }} />
                  <h4 style={{
                    margin: '0',
                    'font-size': '14px',
                    'font-weight': '600',
                    color: '#374151'
                  }}>
                    {statusInfo.label}
                  </h4>
                  <span style={{
                    margin: '0 0 0 auto',
                    'font-size': '12px',
                    color: '#6b7280',
                    'background-color': 'white',
                    'padding': '2px 6px',
                    'border-radius': '10px',
                    'border': '1px solid #e5e7eb'
                  }}>
                    {columnTasks().length}
                  </span>
                </div>

                {/* Tasks */}
                <For each={columnTasks()}>
                  {(task) => (
                    <div
                      class="kanban-task"
                      style={{
                        'background-color': 'white',
                        border: '1px solid #e5e7eb',
                        'border-radius': '6px',
                        'padding': '12px',
                        'margin-bottom': '8px',
                        'cursor': props.graph?.readonly ? 'default' : 'pointer',
                        transition: 'all 0.2s ease',
                        'box-shadow': '0 1px 3px rgba(0, 0, 0, 0.1)'
                      }}
                      onMouseEnter={(e) => {
                        if (!props.graph?.readonly) {
                          (e.target as HTMLElement).style.transform = 'translateY(-2px)'
                          ;(e.target as HTMLElement).style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!props.graph?.readonly) {
                          (e.target as HTMLElement).style.transform = 'translateY(0)'
                          ;(e.target as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
                        }
                      }}
                    >
                      <div style={{
                        'font-weight': '600',
                        color: '#111827',
                        'margin-bottom': '4px',
                        'font-size': '14px'
                      }}>
                        {task.title}
                      </div>

                      <div style={{
                        'font-size': '12px',
                        color: '#6b7280',
                        'margin-bottom': '8px',
                        'line-height': '1.4'
                      }}>
                        {task.description}
                      </div>

                      {renderPriorityPill(task.priority)}

                      <div style={{
                        display: 'flex',
                        'flex-wrap': 'wrap',
                        'margin-top': '8px'
                      }}>
                        <For each={task.assignees}>
                          {(assignee) => renderPersonChip(assignee)}
                        </For>
                      </div>
                    </div>
                  )}
                </For>

                {/* Add Task Button */}
                {!props.graph?.readonly && (
                  <button
                    style={{
                      width: '100%',
                      padding: '8px',
                      'background-color': 'transparent',
                      border: '2px dashed #d1d5db',
                      'border-radius': '6px',
                      color: '#6b7280',
                      cursor: 'pointer',
                      'font-size': '12px',
                      'font-weight': '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.borderColor = '#9ca3af'
                      ;(e.target as HTMLElement).style.backgroundColor = '#f9fafb'
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.borderColor = '#d1d5db'
                      ;(e.target as HTMLElement).style.backgroundColor = 'transparent'
                    }}
                    onClick={() => {
                      console.log('Add task to column:', statusKey)
                    }}
                  >
                    + Add Task
                  </button>
                )}
              </div>
            )
          }}
        </For>
      </div>

      {/* Footer */}
      <div style={{
        'margin-top': '16px',
        'text-align': 'center',
        'font-size': '14px',
        color: '#6b7280',
        padding: '12px',
        'border-top': '1px solid #e5e7eb',
        'background-color': '#f9fafb'
      }}>
        Total: {mockTasks().length} tasks • Framework: SolidJS • {props.graph?.readonly ? 'Read-only' : 'Click to edit'}
      </div>
    </div>
  )
}

// Export the component directly for BlockLoader compatibility
export default BoardViewComponent
