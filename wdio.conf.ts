import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

function resolveVSCodeInsidersBinary(): string | undefined {
  const fromEnv = process.env.VSCODE_INSIDERS_PATH
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv
  try {
    const whichPath = execSync('command -v code-insiders', { encoding: 'utf8' }).trim()
    if (whichPath) {
      // Resolve symlinks (Nix often symlinks to store paths)
      let resolved = whichPath
      try { resolved = fs.realpathSync(whichPath) } catch {}
      // Nix macOS app bundle path from CLI wrapper
      const nixAppCandidate = resolved.replace(
        /\/bin\/code-insiders$/, '/Applications/Visual Studio Code - Insiders.app'
      )
      if (fs.existsSync(nixAppCandidate)) return nixAppCandidate
      // Directly try to locate Electron inside Nix store
      try {
        const found = execSync('ls -d /nix/store/*-vscode-insiders*/Applications/Visual\\ Studio\\ Code\\ -\\ Insiders.app 2>/dev/null | head -n 1', { encoding: 'utf8' }).trim()
        if (found) return found
      } catch {}
      // Fallback to wrapper if nothing else found
      return whichPath
    }
  } catch {}
  try {
    // macOS Spotlight lookup for the Insiders app, fallback to Electron binary inside the app bundle
    const appPath = execSync('mdfind "kMDItemCFBundleIdentifier == com.microsoft.VSCodeInsiders" | head -n 1', { encoding: 'utf8' }).trim()
    if (appPath) return `${appPath}/Contents/MacOS/Electron`
  } catch {}
  return undefined
}

const vscodeInsidersBinary = resolveVSCodeInsidersBinary()
if (vscodeInsidersBinary) {
  console.log(`Using VS Code Insiders binary: ${vscodeInsidersBinary}`)
} else {
  console.warn('VS Code Insiders binary not found; falling back to download via browserVersion=insiders')
}

// Use a short tmp directory to avoid Unix socket path length issues
const shortTmpDir = '/tmp/wdio-vscode'
// Create a unique storage root per run to avoid user-data-dir lock contention
const uniqueStorageRoot = path.join(shortTmpDir, `run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
try {
  if (!fs.existsSync(shortTmpDir)) fs.mkdirSync(shortTmpDir, { recursive: true })
  if (!fs.existsSync(uniqueStorageRoot)) fs.mkdirSync(uniqueStorageRoot, { recursive: true })
  process.env.TMPDIR = shortTmpDir
  process.env.TEMP = shortTmpDir
  process.env.TMP = shortTmpDir
} catch {}
// Ensure wdio-vscode-service cache directory exists to prevent ENOENT when writing versions.txt
const wdioCacheDir = path.join(process.cwd(), '.wdio-vscode-service')
try {
  if (!fs.existsSync(wdioCacheDir)) fs.mkdirSync(wdioCacheDir, { recursive: true })
} catch (e) {
  console.warn('Could not create wdio cache directory:', e)
}
import type { Options } from '@wdio/types'

// Try to detect a system chromedriver (useful on Nix) and only enable the service when available
let systemChromedriverPath: string | undefined
try {
  const which = execSync('command -v chromedriver', { encoding: 'utf8' }).trim()
  if (which && fs.existsSync(which)) systemChromedriverPath = which
} catch {}

export const config: Options.Testrunner = {
  // ====================
  // Runner Configuration
  // ====================

  // WebdriverIO supports running e2e tests as well as unit and component tests.
  runner: 'local',

  // ==================
  // Specify Test Files
  // ==================
  specs: [
    './test/wdio/**/*.e2e.ts'
  ],

  // ============
  // Capabilities
  // ============
  capabilities: [{
    browserName: 'vscode',
    browserVersion: 'insiders',
    'wdio:enforceWebDriverClassic': true,
    'wdio:vscodeOptions': ({
      ...(vscodeInsidersBinary ? { binary: vscodeInsidersBinary } : {}),
      extensionPath: path.resolve(__dirname),
      workspacePath: path.resolve(__dirname, 'test', 'projects', 'vivafolioblock-test'),
      storagePath: uniqueStorageRoot,
      vscodeProxyOptions: {
        connectionTimeout: 60000,
        commandTimeout: 60000
      },
      verboseLogging: true,
      vscodeArgs: {
        'disable-telemetry': true,
        'disable-extensions': false,
        'enable-proposed-api': 'local.vivafolio'
      }
    } as any)
  } as any],

  // ===================
  // Test Configurations
  // ===================
  logLevel: 'info',

  // If you only want to run your tests until a specific amount of tests have failed use
  bail: 0,

  baseUrl: '',

  // Default timeout for all waitFor* commands.
  waitforTimeout: 10000,

  // Default timeout in milliseconds for request
  connectionRetryTimeout: 120000,

  // Default request retries count
  connectionRetryCount: 3,

  // Test runner services
  // Use vscode service; add chromedriver service only if a system driver is present
  services: [
    'vscode',
    ...(systemChromedriverPath ? ([['chromedriver', { chromedriverCustomPath: systemChromedriverPath, logFileName: 'wdio-chromedriver.log' }]] as any) : [])
  ],

  // Framework you want to run your specs with.
  framework: 'mocha',
  // Run a single worker to avoid starting multiple chromedrivers and hitting port issues
  maxInstances: 1,

  // The number of times to retry the entire specfile when it fails as a whole
  specFileRetries: 0,

  // Delay in seconds between the spec file retry attempts
  specFileRetriesDelay: 0,

  // Whether or not retried spec files should be retried immediately or deferred to the end of the queue
  specFileRetriesDeferred: false,

  // Test reporter for stdout.
  reporters: ['spec'],

  // Options to be passed to Mocha.
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  // =====
  // Hooks
  // =====

  /**
   * Gets executed once before all workers get launched.
   * @param {object} config wdio configuration object
   * @param {Array.<Object>} capabilities list of capabilities details
   */
  onPrepare: function (config, capabilities) {
    console.log('Starting WebdriverIO VS Code Extension Tests...')
    try {
      // Ensure the main extension is compiled so newly added commands are available
      console.log('Compiling Vivafolio extension...')
      execSync('npm run -s compile', { cwd: __dirname, stdio: 'inherit' })
    } catch (e) {
      console.warn('Failed to compile Vivafolio extension:', e)
    }
    try {
      // Pre-install the mock language extension by symlinking it into the extensions dir
      const extensionsDir = path.join(uniqueStorageRoot, 'extensions')
      const mockExtSrc = path.resolve(__dirname, 'mocklang-extension')
      const mockExtDest = path.join(extensionsDir, 'local.mocklang-extension-0.0.1')
      if (!fs.existsSync(extensionsDir)) fs.mkdirSync(extensionsDir, { recursive: true })
      if (!fs.existsSync(mockExtDest)) {
        try { fs.symlinkSync(mockExtSrc, mockExtDest, 'dir') }
        catch {
          // Fallback: copy recursively if symlink fails
          const cp = (src: string, dest: string) => {
            const stat = fs.statSync(src)
            if (stat.isDirectory()) {
              if (!fs.existsSync(dest)) fs.mkdirSync(dest)
              for (const entry of fs.readdirSync(src)) cp(path.join(src, entry), path.join(dest, entry))
            } else {
              fs.copyFileSync(src, dest)
            }
          }
          cp(mockExtSrc, mockExtDest)
        }
        console.log('Mock language extension linked at:', mockExtDest)
      }
    } catch (e) {
      console.warn('Failed to preinstall mock language extension:', e)
    }
  },

  /**
   * Gets executed before a worker process is spawned and can be used to initialize specific service
   * for that worker as well as modify runtime environments in an async fashion.
   * @param  {string} cid      capability id (e.g 0-0)
   * @param  {[type]} caps     object containing capabilities for session that will be spawn in the worker
   * @param  {[type]} specs    specs to be run in the worker process
   * @param  {[type]} args     object that will be merged with the main configuration once worker is initialized
   * @param  {[type]} execArgv arguments which will be passed to the worker process
   */
  onWorkerStart: function (cid, caps, specs, args, execArgv) {
    console.log(`Starting worker ${cid} for VS Code extension testing`)
  },

  /**
   * Gets executed before test execution begins. At this point you can access to all global
   * variables like `browser`.
   * @param {Array.<Object>} capabilities list of capabilities details
   * @param {Array.<String>} specs        List of spec file paths that are to be run
   * @param {object}         browser      instance of created browser/device session
   */
  beforeSession: function (capabilities, specs, browser) {
    console.log('VS Code Extension Test Session Started')
  },

  /**
   * Gets executed before the suite starts.
   * @param {object} suite suite details
   */
  beforeSuite: function (suite) {
    console.log(`Starting test suite: ${suite.title}`)
  },

  /**
   * Gets executed after the suite has ended
   * @param {object} suite suite details
   */
  afterSuite: function (suite) {
    console.log(`Completed test suite: ${suite.title}`)
  },

  /**
   * Gets executed after all workers got shut down and the process is about to exit. An error
   * thrown in the onComplete hook will result in the test run failing.
   * @param {object} exitCode      runner exit code
   * @param {object} config        wdio configuration object
   * @param {Array.<Object>} capabilities list of capabilities details
   * @param {<Object>} results     results object containing test results
   */
  onComplete: function(exitCode, config, capabilities, results) {
    console.log('WebdriverIO VS Code Extension Tests Completed')
    if (exitCode !== 0) {
      try {
        const guide = path.resolve(__dirname, 'docs', 'PrintfDebugging.md')
        console.log('Tests failed. See Printf Debugging guide:', guide)
        // Try to resolve extension log file path via command (best effort)
        console.log('If VS Code stayed running, you can run the following inside the Command Palette to locate logs: Developer: Open Log File...')
        console.log('If VIVAFOLIO_DEBUG=1 was set, Vivafolio file logs are under the extension global storage logs dir.')
        console.log('You can interleave logs with:')
        console.log('  node test/interleave-logs.js /path/to/vscode/logs/**/main*.log /path/to/vscode/logs/**/renderer*.log /path/to/vscode/logs/**/exthost*.log vivafolio/**/vivafolio-*.log')
      } catch {}
    }
  },

  /**
   * Gets executed when a refresh happens.
   * @param {string} oldSessionId session ID of the old session
   * @param {string} newSessionId session ID of the new session
   */
  onReload: function(oldSessionId, newSessionId) {
    console.log('VS Code session reloaded')
  }
}
