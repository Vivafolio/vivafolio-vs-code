// Playwright global setup for Vivafolio E2E tests
// This sets up the VS Code testing environment

const path = require('path')
const fs = require('fs')

async function globalSetup(config) {
  console.log('Setting up Vivafolio E2E test environment...')

  // Verify test files and resources exist
  const testProjectDir = path.join(__dirname, 'projects', 'blocksync-test')
  const mainFile = path.join(testProjectDir, 'main.viv')
  const twoBlocksFile = path.join(testProjectDir, 'two_blocks.viv')

  const requiredFiles = [mainFile, twoBlocksFile]
  const htmlResources = [
    path.join(__dirname, 'resources', 'index.html'),
    path.join(__dirname, 'resources', 'blocks', 'color-picker.html'),
    path.join(__dirname, 'resources', 'blocks', 'color-square.html')
  ]

  // Check test files
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Required test file not found: ${file}`)
    }
  }

  // Check HTML resources
  for (const file of htmlResources) {
    if (!fs.existsSync(file)) {
      throw new Error(`Required HTML resource not found: ${file}`)
    }
  }

  // Validate test file content
  const mainContent = fs.readFileSync(mainFile, 'utf8')
  if (!mainContent.includes('vivafolio_block!')) {
    throw new Error('Main test file does not contain vivafolio_block! calls')
  }

  const twoBlocksContent = fs.readFileSync(twoBlocksFile, 'utf8')
  if (!twoBlocksContent.includes('vivafolio_picker!()') ||
      !twoBlocksContent.includes('vivafolio_square!()') ||
      !twoBlocksContent.includes('gui_state!')) {
    throw new Error('Two blocks test file missing required vivafolio markers')
  }

  console.log('✅ Test environment setup complete')
  console.log('✅ Test files and resources verified')
}

module.exports = globalSetup
