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
    position: relative;
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
  let dropdown = null
  let isDropdownOpen = false

  if (!readonly) {
    const arrow = document.createElement('div')
    arrow.textContent = '▼'
    arrow.style.cssText = `
      margin-left: 4px;
      font-size: 10px;
      opacity: 0.6;
      transition: transform 0.2s ease;
    `
    container.appendChild(arrow)

    // Create dropdown menu
    dropdown = document.createElement('div')
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      min-width: 120px;
      display: none;
      margin-top: 4px;
    `

    // Add status options to dropdown
    Object.entries(statusConfig).forEach(([statusKey, statusCfg]) => {
      const option = document.createElement('div')
      option.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        transition: background-color 0.15s ease;
      `
      option.onmouseover = () => option.style.backgroundColor = '#f9fafb'
      option.onmouseout = () => option.style.backgroundColor = 'transparent'

      const optionDot = document.createElement('div')
      optionDot.style.cssText = `
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: ${statusCfg.color};
        margin-right: 8px;
        flex-shrink: 0;
      `
      option.appendChild(optionDot)

      const optionText = document.createElement('span')
      optionText.textContent = statusCfg.label
      option.appendChild(optionText)

      option.onclick = () => {
        if (updateEntity) {
          updateEntity({
            entityId: entity.metadata?.recordId?.entityId ?? entity.entityId,
            properties: {
              status: statusKey
            }
          })
        }
        closeDropdown()
      }

      dropdown.appendChild(option)
    })

    // Click handler for container
    container.onclick = (e) => {
      e.stopPropagation()
      if (isDropdownOpen) {
        closeDropdown()
      } else {
        openDropdown()
      }
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        closeDropdown()
      }
    })

    function openDropdown() {
      if (dropdown) {
        dropdown.style.display = 'block'
        arrow.style.transform = 'rotate(180deg)'
        isDropdownOpen = true
      }
    }

    function closeDropdown() {
      if (dropdown) {
        dropdown.style.display = 'none'
        arrow.style.transform = 'rotate(0deg)'
        isDropdownOpen = false
      }
    }

    container.appendChild(dropdown)
  }

  return container
}

module.exports = StatusPillBlock