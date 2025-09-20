// PersonChipBlock - Property renderer for person/assignee values (Vanilla JS implementation)
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

  // Create the container div
  const container = document.createElement('div')
  container.className = 'person-chip-block'
  container.style.cssText = `
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
  `

  // Render chips for each assignee
  assignees.forEach(personId => {
    const person = mockPeople[personId] || mockPeople.alice

    const chip = document.createElement('div')
    chip.className = 'person-chip'
    chip.style.cssText = `
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      margin: 1px;
      border-radius: 12px;
      background-color: #f3f4f6;
      border: 1px solid #e5e7eb;
      font-size: 12px;
      cursor: ${readonly ? 'default' : 'pointer'};
      transition: all 0.2s ease;
    `

    // Avatar
    const avatar = document.createElement('div')
    avatar.className = 'person-avatar'
    avatar.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: ${person.color};
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      margin-right: 6px;
      flex-shrink: 0;
    `
    avatar.textContent = person.avatar
    chip.appendChild(avatar)

    // Name
    const nameSpan = document.createElement('span')
    nameSpan.textContent = person.name
    nameSpan.style.cssText = `
      white-space: nowrap;
      font-weight: 500;
    `
    chip.appendChild(nameSpan)

    // Remove button (only if not readonly and more than one assignee)
    if (!readonly && assignees.length > 1) {
      const removeBtn = document.createElement('button')
      removeBtn.textContent = '×'
      removeBtn.style.cssText = `
        margin-left: 4px;
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
      `
      chip.appendChild(removeBtn)
    }

    container.appendChild(chip)
  })

  // Add person button (only if not readonly)
  if (!readonly) {
    const addButton = document.createElement('button')
    addButton.className = 'add-person-button'
    addButton.textContent = '+'
    addButton.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: #e5e7eb;
      border: 1px solid #d1d5db;
      color: #6b7280;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      margin: 1px;
      transition: all 0.2s ease;
    `
    container.appendChild(addButton)
  }

  return container
}

module.exports = PersonChipBlock