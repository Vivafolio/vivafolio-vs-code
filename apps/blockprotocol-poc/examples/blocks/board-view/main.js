// BoardViewBlock - Vanilla JavaScript implementation for kanban-style task management
function BoardViewBlock({ graph }) {
  const { blockEntity, readonly } = graph

  // Mock data for demonstration - in a real implementation, this would come from the graph
  const mockTasks = [
    {
      id: 'task-1',
      title: 'Design new API',
      status: 'in-progress',
      assignee: 'Alice',
      priority: 'High'
    },
    {
      id: 'task-2',
      title: 'Update documentation',
      status: 'todo',
      assignee: 'Bob',
      priority: 'Medium'
    },
    {
      id: 'task-3',
      title: 'Fix login bug',
      status: 'done',
      assignee: 'Charlie',
      priority: 'Low'
    },
    {
      id: 'task-4',
      title: 'Implement user auth',
      status: 'in-progress',
      assignee: 'Alice',
      priority: 'High'
    },
    {
      id: 'task-5',
      title: 'Code review',
      status: 'review',
      assignee: 'David',
      priority: 'Medium'
    }
  ]

  const statusColumns = {
    'todo': { label: 'To Do', color: '#6b7280' },
    'in-progress': { label: 'In Progress', color: '#f59e0b' },
    'review': { label: 'Review', color: '#8b5cf6' },
    'done': { label: 'Done', color: '#10b981' }
  }

  // Create the container div
  const container = document.createElement('div')
  container.className = 'board-view-block'
  container.style.cssText = `
    width: 100%;
    min-height: 600px;
    background-color: #f9fafb;
    border-radius: 8px;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  // Create header
  const header = document.createElement('div')
  header.style.cssText = `
    margin-bottom: 24px;
    text-align: center;
  `

  const title = document.createElement('h2')
  title.textContent = 'Task Board'
  title.style.cssText = `
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 700;
    color: #111827;
  `

  const subtitle = document.createElement('p')
  subtitle.textContent = 'Kanban-style task management board'
  subtitle.style.cssText = `
    margin: 0;
    font-size: 16px;
    color: #6b7280;
  `

  header.appendChild(title)
  header.appendChild(subtitle)
  container.appendChild(header)

  // Create board container
  const boardContainer = document.createElement('div')
  boardContainer.style.cssText = `
    display: flex;
    gap: 20px;
    overflow-x: auto;
    padding-bottom: 20px;
  `

  // Create columns for each status
  Object.entries(statusColumns).forEach(([statusKey, statusInfo]) => {
    const columnTasks = mockTasks.filter(task => task.status === statusKey)

    // Create column container
    const column = document.createElement('div')
    column.className = 'kanban-column'
    column.style.cssText = `
      min-width: 300px;
      background-color: white;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
      flex-shrink: 0;
    `

    // Column header
    const columnHeader = document.createElement('div')
    columnHeader.style.cssText = `
      padding: 16px;
      background-color: #f9fafb;
      border-bottom: 2px solid ${statusInfo.color}20;
    `

    const columnTitle = document.createElement('h3')
    columnTitle.textContent = statusInfo.label
    columnTitle.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: #374151;
    `

    const taskCount = document.createElement('span')
    taskCount.textContent = `${columnTasks.length} tasks`
    taskCount.style.cssText = `
      font-size: 14px;
      color: #6b7280;
      background-color: white;
      padding: 4px 8px;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
    `

    columnHeader.appendChild(columnTitle)
    columnHeader.appendChild(taskCount)
    column.appendChild(columnHeader)

    // Column content
    const columnContent = document.createElement('div')
    columnContent.style.cssText = `
      padding: 16px;
      min-height: 400px;
    `

    // Add tasks to column
    columnTasks.forEach(task => {
      const taskCard = document.createElement('div')
      taskCard.style.cssText = `
        background-color: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 8px;
        cursor: ${readonly ? 'default' : 'pointer'};
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      `

      // Task title
      const taskTitle = document.createElement('div')
      taskTitle.textContent = task.title
      taskTitle.style.cssText = `
        font-weight: 600;
        color: #111827;
        margin-bottom: 8px;
        font-size: 14px;
        line-height: 1.4;
      `

      // Task metadata
      const taskMeta = document.createElement('div')
      taskMeta.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      `

      const assignee = document.createElement('span')
      assignee.textContent = `👤 ${task.assignee}`
      assignee.style.color = '#6b7280'

      const priority = document.createElement('span')
      const priorityColors = {
        'High': '#ef4444',
        'Medium': '#f59e0b',
        'Low': '#10b981'
      }
      priority.textContent = task.priority
      priority.style.cssText = `
        background-color: ${priorityColors[task.priority]};
        color: white;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 500;
      `

      taskMeta.appendChild(assignee)
      taskMeta.appendChild(priority)

      taskCard.appendChild(taskTitle)
      taskCard.appendChild(taskMeta)

      // Add hover effects if not readonly
          if (!readonly) {
        taskCard.addEventListener('mouseenter', () => {
          taskCard.style.transform = 'translateY(-2px)'
          taskCard.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
        })
        taskCard.addEventListener('mouseleave', () => {
          taskCard.style.transform = 'translateY(0)'
          taskCard.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
        })
      }

      columnContent.appendChild(taskCard)
    })

    // Add empty state if no tasks
    if (columnTasks.length === 0) {
      const emptyState = document.createElement('div')
      emptyState.textContent = 'No tasks'
      emptyState.style.cssText = `
        text-align: center;
        color: #9ca3af;
        font-style: italic;
        padding: 40px 20px;
      `
      columnContent.appendChild(emptyState)
    }

    column.appendChild(columnContent)
    boardContainer.appendChild(column)
  })

  container.appendChild(boardContainer)

  // Add footer
  const footer = document.createElement('div')
  footer.style.cssText = `
    margin-top: 24px;
    text-align: center;
    font-size: 12px;
    color: #6b7280;
  `
  footer.innerHTML = `
    Total: ${mockTasks.length} tasks •
    Framework: Vanilla JavaScript •
    ${readonly ? 'Read-only' : 'Click cards to edit'}
  `

  container.appendChild(footer)

  return container
}

module.exports = BoardViewBlock