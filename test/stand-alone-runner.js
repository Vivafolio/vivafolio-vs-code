#!/usr/bin/env node
"use strict";
/**
 * Vivafolio Stand-Alone Test Runner
 *
 * Consolidates LSP-based tests and runtime tests into a single testing framework
 * using the CommunicationLayer architecture.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Import communication layer abstractions dynamically
let CommunicationLayer, LangExecutorFactory, LspConnectionFactory, DiagnosticAdapterFactory;
try {
    CommunicationLayer = require('../packages/communication-layer/dist/index.js');
    LangExecutorFactory = require('../packages/lang-executor/dist/index.js').LangExecutorFactory;
    LspConnectionFactory = require('../packages/lsp-connection/dist/index.js').LspConnectionFactory;
    DiagnosticAdapterFactory = require('../packages/diagnostics-adapter/dist/index.js').DiagnosticAdapterFactory;
}
catch (e) {
    console.error('Communication layer packages not available. Please run:');
    console.error('  npm install && npm run build  (in each packages/ directory)');
    process.exit(1);
}
// ---------- Test Definitions ----------
// LSP-based tests (compile-time diagnostics)
const lspTests = [
    // Basic communications tests
    { name: 'Lean (basic-comms)', type: 'lsp', language: 'lean', scenario: 'basic-comms', file: 'test/projects/lean-basic/src/main.lean' },
    { name: 'Nim (basic-comms, nimlsp)', type: 'lsp', language: 'nim', scenario: 'basic-comms', server: 'nimlsp', file: 'test/projects/nim-basic/src/main.nim' },
    { name: 'Nim (basic-comms, nimlangserver)', type: 'lsp', language: 'nim', scenario: 'basic-comms', server: 'nimlangserver', file: 'test/projects/nim-basic/src/main.nim' },
    { name: 'D (basic-comms)', type: 'lsp', language: 'd', scenario: 'basic-comms', file: 'test/projects/d-basic/src/main.d' },
    { name: 'Rust (basic-comms)', type: 'lsp', language: 'rust', scenario: 'basic-comms', file: 'test/projects/rust-basic/src/main.rs' },
    { name: 'Zig (basic-comms)', type: 'lsp', language: 'zig', scenario: 'basic-comms', file: 'test/projects/zig-basic/src/main.zig' },
    { name: 'Crystal (basic-comms)', type: 'lsp', language: 'crystal', scenario: 'basic-comms', file: 'test/projects/crystal-basic/src/main.cr' },
    // Two-blocks tests (Vivafolio blocks)
    { name: 'Nim (two-blocks, nimlsp)', type: 'lsp', language: 'nim', scenario: 'two-blocks', server: 'nimlsp', file: 'packages/vivafolio-nim-testing/examples/two_blocks.nim', expectedBlocks: 2 },
    { name: 'Nim (two-blocks, nimlangserver)', type: 'lsp', language: 'nim', scenario: 'two-blocks', server: 'nimlangserver', file: 'packages/vivafolio-nim-testing/examples/two_blocks.nim', expectedBlocks: 2 },
    { name: 'Nim (two-blocks, nimsuggest)', type: 'lsp', language: 'nim', scenario: 'two-blocks', server: 'nimsuggest', file: 'packages/vivafolio-nim-testing/examples/two_blocks.nim', expectedBlocks: 2 },
    // Call-site diagnostics tests
    { name: 'Nim (callsite, nimlsp)', type: 'lsp', language: 'nim', scenario: 'callsite', server: 'nimlsp', file: 'test/projects/nim-callsite/src/bad_provider.nim', expectedErrors: 1 },
    { name: 'Nim (callsite, nimlangserver)', type: 'lsp', language: 'nim', scenario: 'callsite', server: 'nimlangserver', file: 'test/projects/nim-callsite/src/bad_provider.nim', expectedErrors: 1 },
];
// Runtime tests (script execution)
const runtimeTests = [
    { name: 'Python (two-blocks)', type: 'runtime', language: 'python', scenario: 'two-blocks', file: 'test/runtime-path/python/two_blocks.py', expectedBlocks: 2 },
    { name: 'Ruby (two-blocks)', type: 'runtime', language: 'ruby', scenario: 'two-blocks', file: 'test/runtime-path/ruby/two_blocks.rb', expectedBlocks: 2 },
    { name: 'Julia (two-blocks)', type: 'runtime', language: 'julia', scenario: 'two-blocks', file: 'test/runtime-path/julia/two_blocks.jl', expectedBlocks: 2 },
    { name: 'JavaScript (two-blocks)', type: 'runtime', language: 'javascript', scenario: 'two-blocks', file: 'test/runtime-path/javascript/two_blocks.js', expectedBlocks: 2 },
];
// ---------- Utility Functions ----------
function parseScenarioArgs() {
    const args = process.argv.slice(2);
    return args.map(arg => arg.toLowerCase());
}
function shouldRunScenario(testDef, selectedScenarios) {
    if (!selectedScenarios || selectedScenarios.length === 0)
        return true; // Run all if no filter
    return selectedScenarios.some(selected => {
        const sel = selected.toLowerCase();
        // Match by language
        if (testDef.language && testDef.language.toLowerCase() === sel)
            return true;
        // Match by scenario
        if (testDef.scenario && testDef.scenario.toLowerCase() === sel)
            return true;
        // Match by communication layer type
        if (testDef.type && testDef.type.toLowerCase() === sel)
            return true;
        // Match by server (communication layer variant)
        if (testDef.server && testDef.server.toLowerCase() === sel)
            return true;
        // Special handling for communication layer aliases
        if (sel === 'lsp' && testDef.type === 'lsp')
            return true;
        if (sel === 'runtime' && testDef.type === 'runtime')
            return true;
        // Match by partial name in test name (for backward compatibility)
        if (testDef.name.toLowerCase().includes(sel))
            return true;
        return false;
    });
}
// ---------- LSP Test Implementation ----------
async function runLspTest(testDef, repoRoot) {
    const filePath = path.resolve(repoRoot, testDef.file);
    // Generate log file path following AGENTS.md guidelines
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').replace('Z', '');
    const logFileName = `${testDef.language}-${timestamp}.log`;
    const logPath = path.join(repoRoot, 'test', 'logs', logFileName);
    // Ensure logs directory exists
    const logsDir = path.dirname(logPath);
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        const error = `File not found: ${filePath}`;
        fs.writeFileSync(logPath, `Test: ${testDef.name}\nError: ${error}\n`);
        return { ok: false, logPath, error };
    }
    try {
        let result;
        let logContent = `Test: ${testDef.name}\nFile: ${filePath}\n`;
        if (testDef.server === 'nimsuggest') {
            // Special case: nimsuggest uses a different protocol
            result = await runNimsuggestTest(repoRoot, filePath, testDef.expectedBlocks || 1);
            logContent += `Method: nimsuggest\n`;
        }
        else {
            // Regular LSP connection
            let serverName;
            if (testDef.server && testDef.server !== testDef.language) {
                // Server is different from language (e.g., nimlsp, nimlangserver for nim language)
                if (testDef.language === 'nim') {
                    serverName = `${testDef.language}-${testDef.server}`;
                }
                else {
                    serverName = testDef.language;
                }
            }
            else {
                // Use language as server name (e.g., lean, d, rust)
                serverName = testDef.language;
            }
            const connection = LspConnectionFactory.create(serverName, { language: testDef.language });
            logContent += `LSP Server: ${serverName}\n`;
            // Discover blocks
            result = await connection.discoverBlocks(filePath);
        }
        // Validate results
        if (testDef.expectedBlocks && result.blocks.length !== testDef.expectedBlocks) {
            const error = `Expected ${testDef.expectedBlocks} blocks, found ${result.blocks.length}`;
            logContent += `Result: FAILED\nError: ${error}\n`;
            fs.writeFileSync(logPath, logContent);
            return {
                ok: false,
                logPath,
                error
            };
        }
        if (testDef.expectedErrors && result.blocks.some(block => block.blockType.includes('error'))) {
            // For error tests, we expect error blocks
            logContent += `Result: PASSED (expected errors found)\nBlocks found: ${result.blocks.length}\n`;
            fs.writeFileSync(logPath, logContent);
            return { ok: true, logPath };
        }
        if (result.blocks.length > 0) {
            logContent += `Result: PASSED\nBlocks found: ${result.blocks.length}\n`;
            for (const block of result.blocks) {
                logContent += `- ${block.blockId} (${block.blockType})\n`;
            }
            fs.writeFileSync(logPath, logContent);
            return { ok: true, logPath };
        }
        else {
            const error = 'No vivafolio blocks found';
            logContent += `Result: FAILED\nError: ${error}\n`;
            fs.writeFileSync(logPath, logContent);
            return { ok: false, logPath, error };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const logContent = `Test: ${testDef.name}\nException: ${errorMessage}\n`;
        fs.writeFileSync(logPath, logContent);
        return {
            ok: false,
            logPath,
            error: `LSP test failed: ${errorMessage}`
        };
    }
}
// ---------- Nimsuggest Test Implementation ----------
async function runNimsuggestTest(repoRoot, filePath, expectedBlocks) {
    const fixtureDir = path.dirname(filePath);
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)('nimsuggest', ['--stdin', '--path:' + path.resolve(repoRoot, 'packages/vivafolio-nim-testing/src'), filePath], {
            cwd: fixtureDir,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let output = '';
        let errorOutput = '';
        proc.stdout?.on('data', (data) => {
            output += data.toString();
        });
        proc.stderr?.on('data', (data) => {
            errorOutput += data.toString();
        });
        // Send chk command after a brief delay to let nimsuggest start
        setTimeout(() => {
            proc.stdin?.write('chk ' + path.basename(filePath) + ':1:1\n');
            proc.stdin?.write('quit\n');
        }, 500);
        // Wait for process to finish
        proc.on('close', (code) => {
            const lines = output.split('\n');
            const vivafolioLines = lines.filter(line => line.includes('vivafolio:'));
            console.log(`Found ${vivafolioLines.length} vivafolio lines`);
            if (vivafolioLines.length > 0) {
                console.log('Sample vivafolio lines:', vivafolioLines.slice(0, 2));
            }
            if (vivafolioLines.length >= expectedBlocks) {
                resolve({
                    success: true,
                    blocks: vivafolioLines.map(line => {
                        try {
                            // Parse nimsuggest tab-separated format
                            // Format: chk\t...\t"vivafolio: {json}"\t...
                            const parts = line.split('\t');
                            if (parts.length >= 7) {
                                const message = parts[6]; // The message field
                                if (message && message.includes('vivafolio: ')) {
                                    // Find the last vivafolio: in the message and extract JSON after it
                                    const lastVivafolioIndex = message.lastIndexOf('vivafolio: ');
                                    if (lastVivafolioIndex !== -1) {
                                        const jsonStart = lastVivafolioIndex + 'vivafolio: '.length;
                                        const jsonEnd = message.indexOf('"', jsonStart);
                                        if (jsonEnd !== -1) {
                                            const jsonStr = message.substring(jsonStart, jsonEnd);
                                            try {
                                                return JSON.parse(jsonStr);
                                            }
                                            catch (e) {
                                                console.log('Failed to parse JSON:', jsonStr);
                                            }
                                        }
                                    }
                                }
                            }
                            return null;
                        }
                        catch (e) {
                            console.log('Failed to parse line:', line);
                            return null;
                        }
                    }).filter(block => block !== null)
                });
            }
            else {
                resolve({
                    success: false,
                    blocks: [],
                    error: `Expected ${expectedBlocks} blocks, found ${vivafolioLines.length}`
                });
            }
        });
        // Timeout after 10 seconds
        setTimeout(() => {
            try {
                proc.kill();
            }
            catch { }
            resolve({
                success: false,
                blocks: [],
                error: 'Timeout waiting for nimsuggest'
            });
        }, 10000);
    });
}
// ---------- Runtime Test Implementation ----------
async function runRuntimeTest(testDef, repoRoot) {
    const filePath = path.resolve(repoRoot, testDef.file);
    // Generate log file path following AGENTS.md guidelines
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').replace('Z', '');
    const logFileName = `${testDef.language}-${timestamp}.log`;
    const logPath = path.join(repoRoot, 'test', 'logs', logFileName);
    // Ensure logs directory exists
    const logsDir = path.dirname(logPath);
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        const error = `File not found: ${filePath}`;
        fs.writeFileSync(logPath, `Test: ${testDef.name}\nError: ${error}\n`);
        return { ok: false, logPath, error };
    }
    try {
        // Create language executor with logging enabled
        const executor = LangExecutorFactory.create(testDef.language, {
            expectedBlocks: testDef.expectedBlocks,
            logFile: logPath
        });
        // Discover blocks
        const result = await executor.discoverBlocks(filePath);
        // Validate results
        if (result.success) {
            // On success: minimal output (AGENTS.md guideline)
            return { ok: true, logPath };
        }
        else {
            // On failure: write error to log and return log info (AGENTS.md guideline)
            const logContent = fs.readFileSync(logPath, 'utf8');
            const updatedLog = logContent + `\nTest Result: FAILED\nError: ${result.error || 'Runtime execution failed'}\n`;
            fs.writeFileSync(logPath, updatedLog);
            return {
                ok: false,
                logPath,
                error: result.error || 'Runtime execution failed'
            };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const logContent = `Test: ${testDef.name}\nCommand failed with exception: ${errorMessage}\n`;
        fs.writeFileSync(logPath, logContent);
        return {
            ok: false,
            logPath,
            error: `Runtime test failed: ${errorMessage}`
        };
    }
}
// ---------- Main Runner ----------
async function run() {
    const repoRoot = path.resolve(__dirname, '..');
    const selectedScenarios = parseScenarioArgs();
    if (selectedScenarios.length > 0) {
        console.log('Running stand-alone tests with scenarios:', selectedScenarios.join(', '));
    }
    else {
        console.log('Running all stand-alone tests');
    }
    const allTests = [...lspTests, ...runtimeTests];
    const results = [];
    let selectedCount = 0;
    for (const testDef of allTests) {
        if (!shouldRunScenario(testDef, selectedScenarios)) {
            continue;
        }
        selectedCount++;
        let result;
        if (testDef.type === 'lsp') {
            result = await runLspTest(testDef, repoRoot);
        }
        else if (testDef.type === 'runtime') {
            result = await runRuntimeTest(testDef, repoRoot);
        }
        else {
            result = { ok: false, error: `Unknown test type: ${testDef.type}` };
        }
        results.push({ name: testDef.name, ...result });
    }
    // Print summary following AGENTS.md guidelines
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    const skipped = results.filter(r => r.skipped).length;
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped (out of ${selectedCount} selected)`);
    if (failed > 0) {
        // On failure: show log file paths and sizes (AGENTS.md guideline)
        console.log('\nFailed tests:');
        results.filter(r => !r.ok && !r.skipped && r.logPath).forEach(r => {
            try {
                const stats = fs.statSync(r.logPath);
                console.log(`  ❌ ${r.name}: See log: ${r.logPath} (${stats.size} bytes)`);
            }
            catch (e) {
                console.log(`  ❌ ${r.name}: ${r.error}`);
            }
        });
        process.exit(1);
    }
    else {
        // On success: minimal output (AGENTS.md guideline)
        console.log('✅ All selected tests passed!');
        process.exit(0);
    }
}
// Run if called directly
if (require.main === module) {
    run().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}
