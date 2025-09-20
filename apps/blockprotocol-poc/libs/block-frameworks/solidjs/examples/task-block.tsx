import { createBlockElement } from '../../src/index'

// Example task block using the SolidJS helper
const TaskBlock = createBlockElement((props) => {
  // This component won't actually be used directly since we're using createBlockElement
  return null
}, {
  name: 'solidjs-task-block',
  version: '0.1.0',
  description: 'A task management block built with SolidJS'
})

export default TaskBlock
