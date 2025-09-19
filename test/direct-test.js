// Direct test of the mock LSP server functions without LSP protocol

const { extractVivafolioBlocks, createVivafolioBlockPayload } = require('./mock-lsp-server-functions.js');

const testText = `vivafolio_data!("test_table", r#"
Name,Age,City
Alice,30,New York
Bob,25,London
"#);`;

console.log('Testing extractVivafolioBlocks:');
const blocks = extractVivafolioBlocks(testText);
console.log('Blocks found:', blocks.length);
console.log('Blocks:', JSON.stringify(blocks, null, 2));

if (blocks.length > 0 && blocks[0].kind === 'data_table') {
  console.log('✅ Successfully extracted data_table block');

  console.log('\nTesting createVivafolioBlockPayload:');
  const payload = createVivafolioBlockPayload(blocks[0].blockId, blocks[0].entityId, {
    tableData: blocks[0].tableData,
    dslModule: blocks[0].dslModule,
    error: blocks[0].error
  });

  console.log('Payload created:', JSON.stringify(payload, null, 2));

  if (payload.initialGraph && payload.initialGraph.entities) {
    console.log('✅ Payload contains entities from table data');
    console.log('Entities count:', payload.initialGraph.entities.length);
  }

  if (payload.dslModule) {
    console.log('✅ Payload contains DSL module');
  }
} else {
  console.log('❌ Failed to extract data_table block');
}
