// TableViewBlock - Vanilla JavaScript implementation for displaying tabular data
function TableViewBlock({ graph }) {
  const { blockEntity, readonly } = graph

  // Get entities from the graph - these come from initialGraph
  const entities = graph?.blockGraph?.linkedEntities || []

  // Filter entities that look like table rows (from vivafolio_data! constructs)
  const tableEntities = entities.filter(entity =>
    entity.properties &&
    typeof entity.properties === 'object' &&
    'Task Name' in entity.properties // Simple heuristic for task entities
  )

  // Create the container div
  const container = document.createElement('div')
  container.className = 'table-view-block'
  container.style.cssText = `
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background-color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  if (tableEntities.length === 0) {
    // No data to display
    const emptyMessage = document.createElement('div')
    emptyMessage.textContent = 'No table data available'
    emptyMessage.style.cssText = `
      padding: 40px;
      text-align: center;
      color: #6b7280;
      font-size: 16px;
    `
    container.appendChild(emptyMessage)
    return container
  }

  // Get column headers from the first entity
  const firstEntity = tableEntities[0]
  const headers = Object.keys(firstEntity.properties || {})

  // Create table
  const table = document.createElement('table')
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  `

  // Create table header
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')

  headers.forEach(header => {
    const th = document.createElement('th')
    th.textContent = header
    th.style.cssText = `
      padding: 12px 16px;
      text-align: left;
      background-color: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
      font-weight: 600;
      color: #374151;
      white-space: nowrap;
    `
    headerRow.appendChild(th)
  })

  thead.appendChild(headerRow)
  table.appendChild(thead)

  // Create table body
  const tbody = document.createElement('tbody')

  tableEntities.forEach((entity, index) => {
    const row = document.createElement('tr')
    row.style.cssText = `
      border-bottom: 1px solid #e5e7eb;
      transition: background-color 0.15s ease;
    `

    // Alternate row colors
    if (index % 2 === 1) {
      row.style.backgroundColor = '#f9fafb'
    }

    // Add hover effect if not readonly
    if (!readonly) {
      row.style.cursor = 'pointer'
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = '#f3f4f6'
      })
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = index % 2 === 1 ? '#f9fafb' : 'white'
      })
    }

    headers.forEach(header => {
      const td = document.createElement('td')
      const value = entity.properties?.[header] || ''
      td.textContent = String(value)
      td.style.cssText = `
        padding: 12px 16px;
        color: #374151;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `
      row.appendChild(td)
    })

    tbody.appendChild(row)
  })

  table.appendChild(tbody)

  // Create table wrapper for scrolling
  const tableWrapper = document.createElement('div')
  tableWrapper.style.cssText = `
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  `
  tableWrapper.appendChild(table)

  container.appendChild(tableWrapper)

  // Add footer with summary
  const footer = document.createElement('div')
  footer.style.cssText = `
    padding: 12px 16px;
    background-color: #f9fafb;
    border-top: 1px solid #e5e7eb;
    font-size: 12px;
    color: #6b7280;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `
  footer.innerHTML = `
    <span>Showing ${tableEntities.length} rows</span>
    <span>Framework: Vanilla JavaScript • ${readonly ? 'Read-only' : 'Interactive'}</span>
  `

  container.appendChild(footer)

  return container
}

module.exports = TableViewBlock