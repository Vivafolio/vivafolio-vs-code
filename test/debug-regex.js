// Debug script to test regex pattern for vivafolio_data!() construct

const testText = `vivafolio_data!("test_table", r#"
Name,Age,City
Alice,30,New York
Bob,25,London
"#);`;

console.log('Test text:');
console.log(testText);
console.log('---');

const pattern = /vivafolio_data!\(\s*["']([^"']+)["']\s*,\s*r#"([\s\S]*?)"#\s*\)/;
const match = testText.match(pattern);

console.log('Pattern match result:', match);

if (match) {
  console.log('Entity ID:', match[1]);
  console.log('Table data:');
  console.log(match[2]);
} else {
  console.log('No match found');
}

// Test the updated extractVivafolioBlocks function
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

function extractVivafolioBlocks(text) {
  const blocks = []
  const lines = text.split('\n')

  // First pass: handle single-line constructs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    console.log(`Processing line ${i}: ${line}`)

    // Look for vivafolio_block!(entity_id) pattern
    const match = line.match(/vivafolio_block!\(\s*["']([^"']+)["']\s*\)/)
    if (match) {
      console.log('Found vivafolio_block!() match:', match[1])
      const entityId = match[1]
      const blockId = `block-${entityId}-${i}`
      blocks.push({
        line: i,
        blockId: blockId,
        entityId: entityId
      })
    }
  }

  // Second pass: handle multi-line vivafolio_data!() constructs
  const dataPattern = /vivafolio_data!\(\s*["']([^"']+)["']\s*,\s*r#"([\s\S]*?)"#\s*\)/g
  let dataMatch
  while ((dataMatch = dataPattern.exec(text)) !== null) {
    console.log('Found vivafolio_data!() match at position:', dataMatch.index)
    const entityId = dataMatch[1]
    const tableText = dataMatch[2]
    const blockId = `data-${entityId}-${dataMatch.index}`

    const tableData = parseTableSyntax(tableText)
    console.log('Parsed table data:', tableData)

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
        tableData: tableData
      })
    }
  }

  return blocks
}

console.log('---');
console.log('Testing extractVivafolioBlocks:');
const blocks = extractVivafolioBlocks(testText);
console.log('Extracted blocks:', blocks);
