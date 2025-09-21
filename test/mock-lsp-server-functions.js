// Extracted functions from mock-lsp-server.js for direct testing

function parseTableSyntax(tableText) {
  try {
    const lines = tableText.trim().split('\n')
    if (lines.length < 2) return { error: 'Table must have at least header and one data row' }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows = []

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      if (cells.length !== headers.length) {
        return { error: `Row ${i} has ${cells.length} cells, expected ${headers.length}` }
      }
      rows.push(cells)
    }

    return {
      headers: headers,
      rows: rows,
      schema: headers.reduce((acc, header, idx) => {
        acc[header] = { type: 'string', position: idx }
        return acc
      }, {})
    }
  } catch (e) {
    return { error: `Failed to parse table: ${e.message}` }
  }
}

function createTableDSLModule(entityId, tableData) {
  return {
    version: '1.0',
    entityId: entityId,
    operations: {
      updateEntity: {
        handler: 'tableUpdateHandler',
        params: {
          headers: tableData.headers,
          originalRows: tableData.rows.length
        }
      },
      createEntity: {
        handler: 'tableCreateHandler',
        params: {
          headers: tableData.headers
        }
      },
      deleteEntity: {
        handler: 'tableDeleteHandler',
        params: {
          entityId: entityId
        }
      }
    },
    source: {
      type: 'vivafolio_data_construct',
      pattern: `vivafolio_data!("${entityId}", r#"`
    }
  }
}

function extractVivafolioBlocks(text) {
  const blocks = []
  const lines = text.split('\n')

  // First pass: handle single-line constructs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Look for vivafolio_block!(entity_id) pattern
    const match = line.match(/vivafolio_block!\(\s*["']([^"']+)["']\s*\)/)
    if (match) {
      const entityId = match[1]
      const blockId = `block-${entityId}-${i}`
      blocks.push({
        line: i,
        blockId: blockId,
        entityId: entityId,
        kind: 'generic'
      })
    }
    // Look for vivafolio_picker!() pattern
    else if (/vivafolio_picker!\s*\(\s*\)/.test(line)) {
      const blockId = `picker-${i}`
      blocks.push({
        line: i,
        blockId: blockId,
        entityId: 'color-picker',
        kind: 'picker'
      })
    }
    // Look for vivafolio_square!() pattern
    else if (/vivafolio_square!\s*\(\s*\)/.test(line)) {
      const blockId = `square-${i}`
      blocks.push({
        line: i,
        blockId: blockId,
        entityId: 'color-square',
        kind: 'square'
      })
    }
  }

  // Second pass: handle multi-line vivafolio_data!() constructs
  const dataPattern = /vivafolio_data!\(\s*["']([^"']+)["']\s*,\s*r#"([\s\S]*?)"#\s*\)/g
  let dataMatch
  while ((dataMatch = dataPattern.exec(text)) !== null) {
    const entityId = dataMatch[1]
    const tableText = dataMatch[2]
    const blockId = `data-${entityId}-${dataMatch.index}`

    const tableData = parseTableSyntax(tableText)
    if (tableData.error) {
      blocks.push({
        line: text.substring(0, dataMatch.index).split('\n').length - 1,
        blockId: blockId,
        entityId: entityId,
        kind: 'data_table',
        error: tableData.error
      })
    } else {
      blocks.push({
        line: text.substring(0, dataMatch.index).split('\n').length - 1,
        blockId: blockId,
        entityId: entityId,
        kind: 'data_table',
        tableData: tableData,
        dslModule: createTableDSLModule(entityId, tableData)
      })
    }
  }

  return blocks
}

function createVivafolioBlockPayload(blockId, entityId, options = {}) {
  const { tableData, dslModule, error } = options

  let entityGraph = {
    entities: [{
      entityId: entityId,
      properties: {
        testValue: "Hello from Vivafolio E2E test",
        timestamp: new Date().toISOString()
      }
    }],
    links: []
  }

  let blockType = "https://blockprotocol.org/@blockprotocol/types/block-type/test-block/"
  let resources = [{
    logicalName: "index.html",
    physicalPath: `file://${__dirname}/resources/index.html`,
    cachingTag: "test-etag-" + Date.now()
  }]

  // Handle data table blocks
  if (tableData) {
    blockType = "https://blockprotocol.org/@blockprotocol/types/block-type/table-view-block/"
    resources = [{
      logicalName: "table-view.html",
      physicalPath: `file://${__dirname}/resources/blocks/table-view.html`,
      cachingTag: "table-etag-" + Date.now()
    }]

    // Convert table data to entities
    const entities = tableData.rows.map((row, idx) => ({
      entityId: `${entityId}-row-${idx}`,
      properties: tableData.headers.reduce((acc, header, colIdx) => {
        acc[header] = row[colIdx]
        return acc
      }, {})
    }))

    entityGraph = {
      entities: entities,
      links: []
    }
  }

  const payload = {
    blockId: blockId,
    blockType: blockType,
    displayMode: "multi-line",
    entityId: entityId,
    entityGraph: entityGraph,
    supportsHotReload: false,
    initialHeight: tableData ? 300 : 200,
    resources: resources
  }

  // Add DSL module if provided
  if (dslModule) {
    payload.dslModule = dslModule
  }

  // Add error if present
  if (error) {
    payload.error = error
  }

  return payload
}

module.exports = {
  extractVivafolioBlocks,
  createVivafolioBlockPayload,
  parseTableSyntax,
  createTableDSLModule
};
