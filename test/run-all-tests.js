#!/usr/bin/env node

/**
 * Run All Tests Script
 * Executes all test suites in the Vivafolio project
 */

const { execSync } = require('child_process')
const path = require('path')

// WebdriverIO and VS Code harnesses can emit large stdout dumps; bump buffer.
const MAX_BUFFER_BYTES = 20 * 1024 * 1024

console.log('🧪 Vivafolio - Running All Tests')
console.log('================================\n')

const tests = [
  {
    name: 'VS Code Extension Tests',
    command: 'just test-vscode',
    description: 'Unit tests for VS Code extension functionality'
  },
  {
    name: 'Mock LSP Client Tests',
    command: 'npm run test:e2e:mock-lsp-client',
    description: 'Integration tests for LSP server behavior'
  },
  {
    name: 'Regex Pattern Validation',
    command: 'node test/validate-regex-patterns.js',
    description: 'Validation of regex patterns for gui_state handling'
  },
  {
    name: 'JSON Structure Validation',
    command: 'node test/validate-json-structure.js',
    description: 'Validation of component state encoding architecture'
  },
  {
    name: 'WebdriverIO E2E Tests',
    command: 'npm run test:wdio',
    description: 'Full E2E tests with VS Code extension host automation'
  }
]

let passed = 0
let failed = 0

for (const test of tests) {
  console.log(`🔍 Running: ${test.name}`)
  console.log(`   ${test.description}`)
  console.log(`   Command: ${test.command}`)

  try {
    const output = execSync(test.command, {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 300000, // 5 minutes timeout
      maxBuffer: MAX_BUFFER_BYTES
    })

    // Show last few lines of output for success
    const lines = output.trim().split('\n').filter(line => line.trim())
    if (lines.length > 0) {
      const lastLines = lines.slice(-3).join('\n')
      console.log(`   ✅ PASSED\n   Output: ${lastLines}\n`)
    } else {
      console.log(`   ✅ PASSED\n`)
    }

    passed++
  } catch (error) {
    console.log(`   ❌ FAILED`)
    console.log(`   Error: ${error.message}`)

    // Show some error output if available
    if (error.stdout) {
      const lines = error.stdout.trim().split('\n').filter(line => line.trim())
      if (lines.length > 0) {
        const lastLines = lines.slice(-3).join('\n')
        console.log(`   Stdout: ${lastLines}`)
      }
    }

    if (error.stderr) {
      const lines = error.stderr.trim().split('\n').filter(line => line.trim())
      if (lines.length > 0) {
        const lastLines = lines.slice(-3).join('\n')
        console.log(`   Stderr: ${lastLines}`)
      }
    }

    console.log('')
    failed++
  }
}

console.log('📊 Test Results Summary')
console.log('=======================')
console.log(`✅ Passed: ${passed}`)
console.log(`❌ Failed: ${failed}`)
console.log(`📈 Total:  ${passed + failed}`)

if (failed === 0) {
  console.log('\n🎉 All tests passed!')
  process.exit(0)
} else {
  console.log(`\n⚠️  ${failed} test(s) failed`)
  process.exit(1)
}
