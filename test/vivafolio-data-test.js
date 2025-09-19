// Unit test for vivafolio_data!() construct processing
// This test verifies that the mock LSP server correctly parses and processes table data

const { spawn } = require('child_process');
const path = require('path');

function testVivafolioDataParsing() {
    return new Promise((resolve, reject) => {
        const lspServer = spawn('node', [path.join(__dirname, 'mock-lsp-server.js')], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        lspServer.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        lspServer.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Initialize the LSP server
        const initRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                processId: process.pid,
                rootPath: __dirname,
                capabilities: {}
            }
        };

        lspServer.stdin.write(JSON.stringify(initRequest) + '\n');

        // Wait a bit for initialization
        setTimeout(() => {
            // Send a textDocument/didOpen notification with vivafolio_data!() content
            const didOpenNotification = {
                jsonrpc: '2.0',
                method: 'textDocument/didOpen',
                params: {
                    textDocument: {
                        uri: 'file:///test/tasks.rs',
                        languageId: 'rust',
                        version: 1,
                        text: `vivafolio_data!("test_table", r#"
Name,Age,City
Alice,30,New York
Bob,25,London
"#);`
                    }
                }
            };

            lspServer.stdin.write(JSON.stringify(didOpenNotification) + '\n');

            // Wait for processing and check stderr for expected log messages
            setTimeout(() => {
                console.log('LSP Server stderr output:');
                console.log(stderr);

                // Check if the server processed the vivafolio_data!() construct
                const hasProcessedDataBlock = stderr.includes('data_table');
                const hasParsedTable = stderr.includes('tableData');

                if (hasProcessedDataBlock && hasParsedTable) {
                    console.log('✅ Test passed: LSP server correctly processed vivafolio_data!() construct');
                    resolve(true);
                } else {
                    console.log('❌ Test failed: LSP server did not process vivafolio_data!() construct correctly');
                    console.log('Expected to find "data_table" and "tableData" in logs');
                    reject(new Error('LSP processing failed'));
                }

                lspServer.kill();
            }, 1000);
        }, 500);

        lspServer.on('error', reject);
    });
}

// Run the test
if (require.main === module) {
    testVivafolioDataParsing()
        .then(() => {
            console.log('All tests passed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Test failed:', error.message);
            process.exit(1);
        });
}

module.exports = { testVivafolioDataParsing };
