#!/usr/bin/env node

/**
 * Test script to validate LSP server sends diagnostics on didOpen
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// Test file content
const testContent = `// Vivafolio test file
vivafolio_picker!() gui_state! r#"{"properties":{"color":"#ff0000"}}"#
vivafolio_square!()`

const testFile = path.join(__dirname, 'projects', 'vivafolioblock-test', 'lsp-test.viv')
const mockLspServer = path.join(__dirname, 'mock-lsp-server.js')

console.log('🧪 Testing LSP Server didOpen Diagnostics')
console.log('=========================================')

// Create test file
fs.writeFileSync(testFile, testContent, 'utf8')
console.log('✅ Created test file:', testFile)

// Create a minimal LSP client to test the server
const testLspClient = () => {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting LSP server...')

    const server = spawn('node', [mockLspServer], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''

    server.stdout.on('data', (data) => {
      output += data.toString()
    })

    server.stderr.on('data', (data) => {
      errorOutput += data.toString()
      console.log('LSP Server:', data.toString().trim())
    })

    server.on('error', (err) => {
      console.error('Server error:', err)
      reject(err)
    })

    // Send initialize request
    setTimeout(() => {
      const initializeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          processId: process.pid,
          rootUri: `file://${__dirname}`,
          capabilities: {}
        }
      }

      console.log('📤 Sending initialize request...')
      const message = JSON.stringify(initializeRequest) + '\r\n'
      console.log('📤 Raw message:', message)
      server.stdin.write(message)

      // Wait for initialize response
      setTimeout(() => {
        // Send initialized notification
        const initializedNotification = {
          jsonrpc: '2.0',
          method: 'initialized',
          params: {}
        }

        console.log('📤 Sending initialized notification...')
        server.stdin.write(JSON.stringify(initializedNotification) + '\r\n')

        // Wait and then send didOpen
        setTimeout(() => {
          const didOpenNotification = {
            jsonrpc: '2.0',
            method: 'textDocument/didOpen',
            params: {
              textDocument: {
                uri: `file://${testFile}`,
                languageId: 'vivafolio-mock',
                version: 1,
                text: testContent
              }
            }
          }

          console.log('📤 Sending didOpen notification...')
          server.stdin.write(JSON.stringify(didOpenNotification) + '\r\n')

          // Wait for response
          setTimeout(() => {
            console.log('\n📋 LSP Server Output Analysis:')
            console.log('================================')

            // Check if we received diagnostics
            const hasDiagnostics = errorOutput.includes('LSP didOpen: publishing') ||
                                   errorOutput.includes('publishDiagnostics')

            const hasBlocksFound = errorOutput.includes('found 2 blocks')

            const hasColorExtraction = errorOutput.includes('extracted color = #ff0000')

            console.log('✅ Initialize received:', errorOutput.includes('LSP initialize: received initialize request'))
            console.log('✅ Initialized notification received:', errorOutput.includes('LSP initialized: received initialized notification'))
            console.log('✅ didOpen received:', errorOutput.includes('LSP didOpen uri='))
            console.log('✅ Color extracted:', hasColorExtraction)
            console.log('✅ Blocks found:', hasBlocksFound)
            console.log('✅ Diagnostics sent:', hasDiagnostics)

            if (hasDiagnostics && hasBlocksFound && hasColorExtraction) {
              console.log('\n🎉 SUCCESS: LSP server is working correctly!')
              console.log('   - Server initializes properly')
              console.log('   - Color is extracted from gui_state')
              console.log('   - Vivafolio blocks are found')
              console.log('   - Diagnostics are sent on didOpen')
            } else {
              console.log('\n❌ ISSUES FOUND:')
              if (!hasColorExtraction) console.log('   - Color extraction failed')
              if (!hasBlocksFound) console.log('   - Block detection failed')
              if (!hasDiagnostics) console.log('   - Diagnostics not sent')
            }

            // Clean up
            server.kill()
            fs.unlinkSync(testFile)
            resolve()
          }, 2000)
        }, 500)
      }, 500)
    }, 500)
  })
}

testLspClient().catch(console.error)
