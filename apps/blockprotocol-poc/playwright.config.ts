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
    command: process.env.TEST_LOCAL_BLOCKS ? 'npm run dev:once-frameworks-local' : 'npm run dev:once-frameworks',
    url: process.env.TEST_LOCAL_BLOCKS ? 'http://localhost:4174' : 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  reporter: [['list']]
})
