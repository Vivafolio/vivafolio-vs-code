// Table View Block - SolidJS implementation
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

// Table View Component - export the component directly for BlockLoader compatibility
const TableViewComponent = (props: BlockProps) => {
  // Get entities from the graph - these come from entityGraph
  const entities = createMemo(() => props.graph?.blockGraph?.linkedEntities || [])

  // Filter entities that look like table rows (from vivafolio_data! constructs)
  const tableEntities = createMemo(() =>
    entities().filter(entity =>
      entity.entityId && entity.entityId.includes('-row-')
    )
  )

  // Extract table data from entities
  const tableData = createMemo(() =>
    tableEntities().map(entity => ({
      id: entity.entityId,
      ...entity.properties
    }))
  )

  // Extract column headers from the first entity
  const columns = createMemo(() => {
    const data = tableData()
    return data.length > 0 ? Object.keys(data[0]).filter(key => key !== 'id') : []
  })

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

  const renderStatusPill = (status: string) => {
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.todo
    return (
      <div
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          padding: '2px 6px',
          'border-radius': '8px',
          'background-color': config.bgColor,
          border: `1px solid ${config.color}30`,
          'font-size': '11px',
          'font-weight': '500',
          color: config.color
        }}
      >
        <div
          style={{
            width: '4px',
            height: '4px',
            'border-radius': '50%',
            'background-color': config.color,
            'margin-right': '4px'
          }}
        />
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
          padding: '1px 4px',
          margin: '1px',
          'border-radius': '8px',
          'background-color': '#f3f4f6',
          border: '1px solid #e5e7eb',
          'font-size': '11px'
        }}
      >
        <div
          class="person-avatar"
          style={{
            width: '14px',
            height: '14px',
            'border-radius': '50%',
            'background-color': person.color,
            color: 'white',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '8px',
            'font-weight': '600',
            'margin-right': '4px',
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

  const renderTableCell = (row: any, column: string) => {
    let cellContent = row[column] || ''

    // Special rendering for status columns
    if (column.toLowerCase().includes('status')) {
      return renderStatusPill(cellContent.toLowerCase().replace(/\s+/g, '-'))
    }

    // Special rendering for assignee/person columns
    if (column.toLowerCase().includes('assignee') || column.toLowerCase().includes('person')) {
      return renderPersonChip(cellContent.toLowerCase())
    }

    // Default text rendering
    return (
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          padding: '8px 12px',
          'min-height': '20px',
          'max-width': '200px',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap'
        }}
      >
        {cellContent}
      </div>
    )
  }

  return (
    <div class="table-view-block" style={{
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
          Data Table View
        </h3>
        <p style={{
          margin: '0',
          'font-size': '14px',
          color: '#6b7280'
        }}>
          Live data from vivafolio_data!() constructs • {tableData().length} rows
        </p>
      </div>

      {/* Table */}
      <div style={{ overflow: 'auto' }}>
        <table style={{
          width: '100%',
          'border-collapse': 'collapse',
          'font-size': '14px'
        }}>
          {/* Table header */}
          <thead style={{
            'background-color': '#f9fafb'
          }}>
            <tr>
              <For each={columns()}>
                {(column) => (
                  <th style={{
                    padding: '12px 8px',
                    'text-align': 'left',
                    'font-weight': '600',
                    color: '#374151',
                    'border-bottom': '2px solid #e5e7eb',
                    'white-space': 'nowrap'
                  }}>
                    {column.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </th>
                )}
              </For>
            </tr>
          </thead>

          {/* Table body */}
          <tbody>
            <For each={tableData()}>
              {(row) => (
                <tr style={{
                  'border-bottom': '1px solid #f3f4f6'
                }}>
                  <For each={columns()}>
                    {(column) => (
                      <td style={{
                        padding: '12px 8px',
                        'border-bottom': '1px solid #f3f4f6'
                      }}>
                        {renderTableCell(row, column)}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>

          {/* Footer */}
          <tfoot>
            <tr>
              <td
                colspan={columns().length}
                style={{
                  padding: '12px 16px',
                  'border-top': '1px solid #e5e7eb',
                  'background-color': '#f9fafb',
                  'font-size': '12px',
                  color: '#6b7280'
                }}
              >
                Showing {tableData().length} rows • {columns().length} columns • Powered by SolidJS
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// Export the component directly for BlockLoader compatibility
export default TableViewComponent
