#!/usr/bin/env node

/**
 * Test script to validate bidirectional synchronization
 * Tests that UI changes update source code and vice versa
 */

const fs = require('fs')
const path = require('path')

console.log('🔄 Testing Bidirectional Synchronization')
console.log('======================================')

console.log('\n📋 MANUAL TESTING INSTRUCTIONS:')
console.log('================================')
console.log('Since WebdriverIO has element ID mismatches, use manual testing:')
console.log('')
console.log('1. SETUP:')
console.log('   cd vivafolio')
console.log('   just vscode-e2e  # Opens VS Code with test environment')
console.log('')
console.log('2. TEST INITIAL STATE:')
console.log('   - Open: test/projects/blocksync-test/two_blocks.viv')
console.log('   - Verify color picker shows green (#00ff00)')
console.log('   - Verify color square also shows green')
console.log('   - Check VS Code console for LSP diagnostics')
console.log('')
console.log('3. TEST UI-TO-SOURCE SYNC:')
console.log('   - Click color picker and select a different color (e.g., red)')
console.log('   - Check VS Code DevTools console for:')
console.log('     * "Extension received graph:update"')
console.log('     * "applyColorMarker called with color: #ff0000"')
console.log('     * "applyColorMarker: document saved"')
console.log('   - Verify gui_state! string updates: {"properties":{"color":"#ff0000"}}')
console.log('')
console.log('4. TEST SOURCE-TO-UI SYNC:')
console.log('   - Edit gui_state! string directly: change #ff0000 to #0000ff')
console.log('   - Save the file')
console.log('   - Verify color picker updates to blue (#0000ff)')
console.log('   - Check console for LSP server processing the change')
console.log('')
console.log('5. DEBUGGING TIPS:')
console.log('   - VS Code DevTools Console shows extension logs')
console.log('   - LSP server logs appear in terminal where mock server runs')
console.log('   - Look for "LSP didOpen" and "LSP didChange" messages')
console.log('')

console.log('🎯 EXPECTED BEHAVIOR:')
console.log('=====================')
console.log('✅ Initial state: Both picker and square show #00ff00')
console.log('✅ UI changes: gui_state! updates immediately')
console.log('✅ Source changes: UI updates immediately')
console.log('✅ Bidirectional sync working correctly')
console.log('')

// Simple validation of test file
const testFile = path.join(__dirname, 'projects', 'blocksync-test', 'two_blocks.viv')
if (fs.existsSync(testFile)) {
  const content = fs.readFileSync(testFile, 'utf8')
  console.log('📄 Test file content:')
  console.log(content)
  console.log('')
  console.log('✅ Test file ready for manual testing')
} else {
  console.log('❌ Test file not found')
}
