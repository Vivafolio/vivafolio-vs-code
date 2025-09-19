// Mock LSP server that simulates a custom language implementing Vivafolio spec
// Sends VivafolioBlock notifications as LSP Hint diagnostics for vivafolio_block!() calls

const rpc = require('vscode-jsonrpc/node')

const connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(process.stdin),
  new rpc.StreamMessageWriter(process.stdout)
)

let initialized = false
const uriState = new Map() // uri -> { color: string }

connection.onRequest('initialize', (params) => {
  console.error('LSP initialize: received initialize request')
  console.error('LSP initialize: params =', JSON.stringify(params, null, 2))
  initialized = true
  console.error('LSP initialize: server initialized =', initialized)
  return {
    capabilities: {
      textDocumentSync: 1 // Full sync
    },
    serverInfo: { name: 'vivafolio-mock-language', version: '0.1' }
  }
})

connection.onNotification('initialized', () => {
  try {
    console.error('LSP initialized: received initialized notification')
  } catch {}
})

function createVivafolioBlockPayload(blockId, entityId, options = {}) {
  const { tableData, dslModule, error } = options

  let initialGraph = {
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

    initialGraph = {
      entities: entities,
      links: []
    }
  }

  const payload = {
    blockId: blockId,
    blockType: blockType,
    displayMode: "multi-line",
    entityId: entityId,
    initialGraph: initialGraph,
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

function parseGuiStateFromText(text) {
  try {
    const lines = text.split('\n')
    for (const line of lines) {
      if (/vivafolio_picker!\s*\(\s*\)/.test(line)) {
        const m = /gui_state!\s*r#"\s*(\{[\s\S]*?\})\s*"#/.exec(line)
        if (!m) return { present: false }
        try {
          const obj = JSON.parse(m[1])
          const c = (obj && typeof obj === 'object') ? (obj.color || obj?.properties?.color) : undefined
          if (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) return { present: true, color: c }
          return { present: true, error: 'missing_or_invalid_color' }
        } catch (e) {
          const msg = (e && e.message) ? String(e.message) : 'Invalid JSON'
          return { present: true, error: msg }
        }
      }
    }
    return { present: false }
  } catch { return { present: false } }
}

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
        entityId: entityId
      })
    }

    // Color picker and square markers
    if (/vivafolio_picker!\s*\(\s*\)/.test(line)) {
      blocks.push({ line: i, blockId: `picker-${i}`, entityId: 'color-picker', kind: 'picker' })
    }
    if (/vivafolio_square!\s*\(\s*\)/.test(line)) {
      blocks.push({ line: i, blockId: `square-${i}`, entityId: 'color-square', kind: 'square' })
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

connection.onNotification('textDocument/didOpen', (p) => {
  try {
    console.error('LSP didOpen uri=', p?.textDocument?.uri)
    console.error('LSP didOpen: initialized =', initialized)
  } catch {}

  // LSP requires COMPLETE state semantics - send ALL diagnostics for the document
  if (!initialized) {
    console.error('LSP didOpen: not initialized, skipping')
    return
  }

  try {
    const doc = p?.textDocument
    if (!doc?.uri || !doc.text) {
      console.error('LSP didOpen: missing uri or text')
      return
    }

    console.error('LSP didOpen: processing document with', doc.text.length, 'characters')
    console.error('LSP didOpen: document content preview:', doc.text.substring(0, 200))

    const gs = parseGuiStateFromText(doc.text)
    console.error('LSP didOpen: gui_state parsed =', JSON.stringify(gs))
    if (gs.color) uriState.set(doc.uri, { color: gs.color })

    const blocks = extractVivafolioBlocks(doc.text)
    console.error('LSP didOpen: found', blocks.length, 'blocks:', JSON.stringify(blocks))

    if (blocks.length > 0) {
      const diagnostics = blocks.map(block => {
        let payload
        if (block.kind === 'picker') {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId)
          payload.resources[0].physicalPath = `file://${__dirname}/resources/blocks/color-picker.html`
          const gsHere = parseGuiStateFromText(doc.text)
          if (gsHere.present && gsHere.error) {
            payload.initialGraph = null
            payload.error = { kind: 'gui_state_syntax_error', message: gsHere.error }
            console.error('LSP didOpen: picker block', block.blockId, 'syntax error:', gsHere.error)
          } else {
            // Use parsed color if present; otherwise a benign default for initial display
            const currentColor = gsHere.color || '#ff0000'
            payload.initialGraph.entities[0].properties = { color: currentColor }
            console.error('LSP didOpen: picker block', block.blockId, 'initialized with color', currentColor)
          }
        } else if (block.kind === 'square') {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId)
          payload.resources[0].physicalPath = `file://${__dirname}/resources/blocks/color-square.html`
          const gsHere = parseGuiStateFromText(doc.text)
          if (gsHere.present && gsHere.error) {
            payload.initialGraph = null
            payload.error = { kind: 'gui_state_syntax_error', message: gsHere.error }
            console.error('LSP didOpen: square block', block.blockId, 'syntax error:', gsHere.error)
          } else {
            const currentColor = gsHere.color || '#ff0000'
            payload.initialGraph.entities[0].properties = { color: currentColor }
            console.error('LSP didOpen: square block', block.blockId, 'initialized with color', currentColor)
          }
        } else if (block.kind === 'data_table') {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId, {
            tableData: block.tableData,
            dslModule: block.dslModule,
            error: block.error
          })
        } else {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId)
        }
        return {
          range: {
            start: { line: block.line, character: 0 },
            end: { line: block.line, character: 1 }
          },
          severity: 4, // Hint
          source: 'vivafolio-mock-language',
          message: 'vivafolio: ' + JSON.stringify(payload)
        }
      })

      try {
        console.error('LSP didOpen: publishing', diagnostics.length, 'diagnostics')
        console.error('LSP didOpen: first diagnostic message preview:', diagnostics[0]?.message?.substring(0, 200))
      } catch {}

      const diagnosticParams = {
        uri: doc.uri,
        version: doc.version || 1,
        diagnostics: diagnostics
      }
      console.error('LSP didOpen: sending publishDiagnostics with params:', JSON.stringify(diagnosticParams, null, 2))

      connection.sendNotification('textDocument/publishDiagnostics', diagnosticParams)
    }
  } catch (err) {
    console.error('Mock LSP server error:', err)
  }
})

connection.onNotification('textDocument/didChange', (p) => {
  try {
    console.error('LSP didChange uri=', p?.textDocument?.uri, 'version=', p?.textDocument?.version)
  } catch {}

  // Re-analyze on changes - LSP requires COMPLETE state semantics (not incremental)
  if (!initialized || !p?.textDocument?.uri) return

  try {
    const doc = p?.contentChanges?.[0]?.text
    if (!doc) {
      console.error('LSP didChange: no content in change notification')
      return
    }

    console.error('LSP didChange: processing document with', doc.length, 'characters')

    const gs = parseGuiStateFromText(doc)
    console.error('LSP didChange: parsed gui_state:', JSON.stringify(gs))
    if (gs.color) {
      uriState.set(p.textDocument.uri, { color: gs.color })
      console.error('LSP didChange: updated uriState for', p.textDocument.uri.toString(), 'with color', gs.color)
    }

    const blocks = extractVivafolioBlocks(doc)
    console.error('LSP didChange: found', blocks.length, 'vivafolio blocks')

    if (blocks.length > 0) {
      const diagnostics = blocks.map(block => {
        console.error('LSP didChange: processing block', block.blockId, 'kind:', block.kind || 'generic')
        let payload
        if (block.kind === 'picker') {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId)
          payload.resources[0].physicalPath = `file://${__dirname}/resources/blocks/color-picker.html`
          const gsHere = parseGuiStateFromText(doc)
          if (gsHere.present && gsHere.error) {
            payload.initialGraph = null
            payload.error = { kind: 'gui_state_syntax_error', message: gsHere.error }
            console.error('LSP didChange: picker block', block.blockId, 'syntax error:', gsHere.error)
          } else {
            const currentColor = gsHere.color || '#ff0000'
            payload.initialGraph.entities[0].properties = { color: currentColor }
            console.error('LSP didChange: picker block', block.blockId, 'updated with color', currentColor)
          }
        } else if (block.kind === 'square') {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId)
          payload.resources[0].physicalPath = `file://${__dirname}/resources/blocks/color-square.html`
          const gsHere = parseGuiStateFromText(doc)
          if (gsHere.present && gsHere.error) {
            payload.initialGraph = null
            payload.error = { kind: 'gui_state_syntax_error', message: gsHere.error }
            console.error('LSP didChange: square block', block.blockId, 'syntax error:', gsHere.error)
          } else {
            const currentColor = gsHere.color || '#ff0000'
            payload.initialGraph.entities[0].properties = { color: currentColor }
            console.error('LSP didChange: square block', block.blockId, 'updated with color', currentColor)
          }
        } else if (block.kind === 'data_table') {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId, {
            tableData: block.tableData,
            dslModule: block.dslModule,
            error: block.error
          })
        } else {
          payload = createVivafolioBlockPayload(block.blockId, block.entityId)
        }
        return {
          range: {
            start: { line: block.line, character: 0 },
            end: { line: block.line, character: 1 }
          },
          severity: 4, // Hint
          source: 'vivafolio-mock-language',
          message: 'vivafolio: ' + JSON.stringify(payload)
        }
      })

      console.error('LSP didChange: publishing', diagnostics.length, 'diagnostics')
      connection.sendNotification('textDocument/publishDiagnostics', {
        uri: p.textDocument.uri,
        version: p.textDocument.version || 1,
        diagnostics: diagnostics
      })
    } else {
      console.error('LSP didChange: no blocks found, clearing diagnostics')
      // Clear diagnostics if no blocks found
      connection.sendNotification('textDocument/publishDiagnostics', {
        uri: p.textDocument.uri,
        version: p.textDocument.version || 1,
        diagnostics: []
      })
    }
  } catch (err) {
    console.error('Mock LSP server error on change:', err)
  }
})

connection.onNotification('textDocument/didSave', (p) => {
  // Re-analyze on save (the test calls doc.save())
  if (!initialized || !p?.textDocument?.uri) return

  try {
    // For didSave, we don't get the text content, so we can't re-analyze
    // The test should trigger a didChange instead
    // For now, just ignore didSave
  } catch (err) {
    console.error('Mock LSP server error on save:', err)
  }
})

connection.listen()
