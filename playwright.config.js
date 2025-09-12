// Playwright configuration for Vivafolio E2E tests
// This config is designed to work with VS Code extension testing

const { defineConfig } = require('@playwright/test')
const path = require('path')

module.exports = defineConfig({
  testDir: './test',
  testMatch: 'e2e-blocksync.js',

  // Timeout settings for VS Code loading
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // Use VS Code's built-in browser for testing
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Configure for VS Code extension testing
  projects: [
    {
      name: 'vivafolio-e2e',
      testMatch: '**/e2e-blocksync.js',
      use: {
        // VS Code extension testing requires special setup
        // These tests will run against a VS Code instance with the extension loaded
      },
    },
  ],

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-results/playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['line']
  ],

  // Output configuration
  outputDir: 'test-results/',

  // Global setup and teardown if needed
  globalSetup: require.resolve('./test/playwright-setup.js'),
  globalTeardown: require.resolve('./test/playwright-teardown.js'),
})