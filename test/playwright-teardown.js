// Playwright global teardown for Vivafolio E2E tests

async function globalTeardown(config) {
  console.log('Cleaning up Vivafolio E2E test environment...')

  // Any cleanup logic can go here
  // For now, just log completion

  console.log('✅ Test environment cleanup complete')
}

module.exports = globalTeardown
