import { defineConfig } from '@playwright/test'

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.TEST_LOCAL_BLOCKS ? 'http://localhost:4174' : 'http://localhost:4173',
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: chromiumExecutable,
      headless: true
    }
  },
  webServer: {
    // Support a production e2e mode to avoid Vite/HMR reloads during tests
    // TEST_E2E_PROD=1 will run a full build then start the production server
    // Otherwise, run dev server variants (optionally disabling framework watch)
    command: process.env.TEST_E2E_PROD
      ? 'npm run build && npm run start'
      : process.env.TEST_LOCAL_BLOCKS
        ? 'npm run dev:once-frameworks-local'
        : process.env.TEST_DISABLE_FRAMEWORK_WATCH
          ? 'npm run dev:once'
          : 'npm run dev:once-frameworks',
    url: process.env.TEST_LOCAL_BLOCKS ? 'http://localhost:4174' : 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: process.env.TEST_E2E_PROD ? 180_000 : 60_000
  },
  reporter: [['list']]
})
