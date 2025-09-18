import { createBlock, BlockContainer, BlockField, BlockInput, BlockSelect, BlockButton, useEntity } from '../../src/index'

// Example task block using the SolidJS helper
const TaskBlock = createBlock((props) => {
  const entity = useEntity(props.graph)

  const statusOptions = [
    { value: 'todo', label: 'To Do' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'done', label: 'Done' }
  ]

  return (
    <BlockContainer className="task-block">
      <h3>Task Block (SolidJS)</h3>

      <BlockField label="Title">
        <BlockInput
          value={entity()?.properties?.title as string || ''}
          onChange={(value) => {
            // Update entity property
            console.log('Title changed:', value)
          }}
          placeholder="Enter task title..."
        />
      </BlockField>

      <BlockField label="Description">
        <BlockInput
          value={entity()?.properties?.description as string || ''}
          onChange={(value) => {
            console.log('Description changed:', value)
          }}
          placeholder="Enter task description..."
        />
      </BlockField>

      <BlockField label="Status">
        <BlockSelect
          value={entity()?.properties?.status as string || 'todo'}
          onChange={(value) => {
            console.log('Status changed:', value)
          }}
          options={statusOptions}
        />
      </BlockField>

      <BlockButton onClick={() => {
        console.log('Update button clicked')
      }}>
        Update Task
      </BlockButton>

      <div class="task-info">
        <small>Entity ID: {entity()?.entityId}</small>
      </div>
    </BlockContainer>
  )
}, {
  name: 'solidjs-task-block',
  version: '0.1.0',
  description: 'A task management block built with SolidJS'
})

export default TaskBlock
