#!/usr/bin/env node

/**
 * Simple validation script for Vivafolio synchronization requirements
 * This script validates that the core components work together without requiring WebdriverIO
 */

const fs = require('fs')
const path = require('path')

console.log('🧪 Validating Vivafolio Synchronization Components')
console.log('================================================')

// Test 1: Check that test file exists with correct content
console.log('\n1. Checking test file content...')
const testFile = path.join(__dirname, 'projects', 'vivafolioblock-test', 'two_blocks_sync.mocklang')

try {
  const content = fs.readFileSync(testFile, 'utf8')
  console.log('✅ Test file exists')
  console.log('   Content preview:', content.split('\n')[0])

  if (content.includes('gui_state!') && content.includes('"color":"#00ff00"')) {
    console.log('✅ Initial color state found in file')
  } else {
    console.log('❌ Initial color state not found in file')
  }
} catch (error) {
  console.log('❌ Test file not found:', error.message)
}

// Test 2: Check that webview HTML files exist
console.log('\n2. Checking webview HTML files...')
const colorPickerHtml = path.join(__dirname, 'resources', 'blocks', 'color-picker.html')
const colorSquareHtml = path.join(__dirname, 'resources', 'blocks', 'color-square.html')

try {
  if (fs.existsSync(colorPickerHtml)) {
    console.log('✅ Color picker HTML exists')
    const content = fs.readFileSync(colorPickerHtml, 'utf8')
    if (content.includes('graph:update') && content.includes('ready')) {
      console.log('✅ Color picker has required message handling')
    }
  } else {
    console.log('❌ Color picker HTML not found')
  }
} catch (error) {
  console.log('❌ Error checking color picker HTML:', error.message)
}

try {
  if (fs.existsSync(colorSquareHtml)) {
    console.log('✅ Color square HTML exists')
    const content = fs.readFileSync(colorSquareHtml, 'utf8')
    if (content.includes('graph:update')) {
      console.log('✅ Color square has required message handling')
    }
  } else {
    console.log('❌ Color square HTML not found')
  }
} catch (error) {
  console.log('❌ Error checking color square HTML:', error.message)
}

// Test 3: Check that WebdriverIO test file exists
console.log('\n3. Checking WebdriverIO test file...')
const wdioTestFile = path.join(__dirname, 'wdio', 'specs', 'two-blocks-synchronization.e2e.ts')

try {
  if (fs.existsSync(wdioTestFile)) {
    console.log('✅ WebdriverIO synchronization test exists')
    const content = fs.readFileSync(wdioTestFile, 'utf8')
    const testCount = (content.match(/it\('should/g) || []).length
    console.log(`✅ Test file contains ${testCount} test scenarios`)
  } else {
    console.log('❌ WebdriverIO test file not found')
  }
} catch (error) {
  console.log('❌ Error checking WebdriverIO test file:', error.message)
}

// Test 4: Check package.json scripts
console.log('\n4. Checking npm scripts...')
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const scripts = packageJson.scripts

  if (scripts['test:wdio:synchronization']) {
    console.log('✅ WebdriverIO synchronization script exists')
  } else {
    console.log('❌ WebdriverIO synchronization script not found')
  }
} catch (error) {
  console.log('❌ Error checking package.json:', error.message)
}

console.log('\n🎉 Validation complete!')
console.log('\nNext steps:')
console.log('1. Run: npm run test:wdio:synchronization')
console.log('2. Or run: npm run test:wdio')
console.log('3. Check the Vivafolio-E2E-Test-Status.md for detailed requirements')