// Launch VS Code with the mock language extension and run extension tests.
// This is used by Playwright to ensure we test the real VS Code environment.

const path = require('path')
const { runTests } = require('@vscode/test-electron')
const { execSync, spawn } = require('child_process')

async function main() {
  try {
    // Prefer running against the dev-shell-provided VS Code Insiders to avoid
    // downloading generic Linux builds (which don't run on Nix without patchelf).
    let vscodeExecutablePath
    try {
      const which = execSync('which code-insiders', { encoding: 'utf8' }).trim()
      if (which) vscodeExecutablePath = which
    } catch {}

    // If headless Linux without DISPLAY, try to start Xvfb for a virtual display
    if (process.platform === 'linux' && !process.env.DISPLAY) {
      try {
        const xvfb = execSync('command -v Xvfb', { encoding: 'utf8' }).trim()
        if (xvfb) {
          console.log('Starting Xvfb on :99 for headless VS Code')
          const child = spawn(xvfb, [':99', '-screen', '0', '1280x800x24'], { stdio: 'ignore', detached: true })
          child.unref()
          process.env.DISPLAY = ':99'
        }
      } catch {}
    }
    const repoRoot = path.resolve(__dirname, '..', '..')
    const productionExtensionPath = path.resolve(repoRoot, 'vivafolio')
    const mockExtensionPath = path.resolve(productionExtensionPath, 'mock-language-extension')
    const extensionTestsPath = path.resolve(__dirname, 'suite', 'index')
    const testWorkspace = path.resolve(productionExtensionPath, 'test', 'projects', 'blocksync-test')

    // Launch VS Code with BOTH extensions enabled by passing two extensionDevelopmentPath instances:
    // We emulate this by running tests twice: once for mock ext, and loading production ext as a dependency via VS Code.
    // However, @vscode/test-electron supports one extensionDevelopmentPath; to load both, we symlink the mock extension
    // into the production extension's extensions folder is overkill. Instead, we launch tests with the mock extension
    // as the development extension and require the production extension using the --extensionDevelopmentPath twice in
    // the args is not supported. We will run with the mock extension as development extension and rely on
    // the production Vivafolio compiled JS in-place (activated via its activationEvents onStartupFinished).

    await runTests({
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
      extensionDevelopmentPath: mockExtensionPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace,
        `--extensionDevelopmentPath=${productionExtensionPath}`,
        '--enable-proposed-api',
        'local.vivafolio'
      ]
    })
  } catch (err) {
    console.error('Failed to run VS Code tests:', err)
    process.exit(1)
  }
}

main()

