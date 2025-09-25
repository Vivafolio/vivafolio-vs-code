// Playwright configuration for Vivafolio E2E tests
// This config is designed to work with VS Code extension testing

// Minimal CommonJS Playwright config that avoids requiring @playwright/test
// This prevents duplicate require issues when Playwright loads the config.
module.exports = {
  testDir: '.',
  testMatch: '**/*.spec.ts',

  // Timeout settings for VS Code loading
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // Use headless browser for testing
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Configure for VS Code extension testing (kept as project selector)
  projects: [
    {
      name: 'vivafolio-e2e',
      testMatch: ['**/e2e-vivafolioblock.js', '**/*.spec.ts'],
      use: {},
    },
  ],

  // Reporter configuration
  // place HTML report outside the Playwright outputDir to avoid conflicts
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['line']
  ],

  // Output configuration
  outputDir: 'test-results',

  // Global setup and teardown if needed
  globalSetup: require.resolve('./test/playwright-setup.js'),
  globalTeardown: require.resolve('./test/playwright-teardown.js'),
}