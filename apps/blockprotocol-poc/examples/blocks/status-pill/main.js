// StatusPillBlock - Property renderer for status values (Vanilla JS implementation)
function StatusPillBlock({ entity, readonly, updateEntity }) {

  // Status configuration with colors and labels
  const statusConfig = {
    'todo': { label: 'To Do', color: '#6b7280', bgColor: '#f3f4f6' },
    'in-progress': { label: 'In Progress', color: '#f59e0b', bgColor: '#fef3c7' },
    'done': { label: 'Done', color: '#10b981', bgColor: '#d1fae5' },
    'blocked': { label: 'Blocked', color: '#ef4444', bgColor: '#fee2e2' },
    'review': { label: 'Review', color: '#8b5cf6', bgColor: '#e9d5ff' }
  }

  const currentStatus = entity?.properties?.status || 'in-progress'
  const config = statusConfig[currentStatus] || statusConfig['in-progress']

  // Create the container div
  const container = document.createElement('div')
  container.className = 'status-pill-block'
  container.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 12px;
    background-color: ${config.bgColor};
    border: 1px solid ${config.color}20;
    font-size: 12px;
    font-weight: 500;
    color: ${config.color};
    cursor: ${readonly ? 'default' : 'pointer'};
    transition: all 0.2s ease;
  `

  // Status indicator dot
  const dot = document.createElement('div')
  dot.style.cssText = `
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: ${config.color};
    margin-right: 6px;
    flex-shrink: 0;
  `
  container.appendChild(dot)

  // Status text
  const textSpan = document.createElement('span')
  textSpan.textContent = config.label
  textSpan.style.whiteSpace = 'nowrap'
  container.appendChild(textSpan)

  // Dropdown arrow (only if not readonly)
  if (!readonly) {
    const arrow = document.createElement('div')
    arrow.textContent = '▼'
    arrow.style.cssText = `
      margin-left: 4px;
      font-size: 10px;
      opacity: 0.6;
    `
    container.appendChild(arrow)
  }

  return container
}

module.exports = StatusPillBlock