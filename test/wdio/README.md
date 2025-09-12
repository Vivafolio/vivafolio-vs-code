# Vivafolio WebdriverIO E2E Tests

This directory contains WebdriverIO-based end-to-end tests for the Vivafolio VS Code extension. These tests provide true E2E automation of webview interactions, overcoming the limitations of Playwright which cannot access VS Code's sandboxed webview iframes.

## Overview

The WebdriverIO tests use the `wdio-vscode-service` to:
- Launch VS Code with the Vivafolio extension loaded
- Automate realistic user interactions within webview insets
- Test the complete flow from UI interaction → LSP message → webview updates
- Verify cross-block communication and state synchronization

## Architecture

### Page Object Model
- `BaseWebviewPage`: Common functionality for all webview interactions
- `ColorPickerPage`: Specific interactions for color picker blocks
- `ColorSquarePage`: Specific interactions for color square blocks

### Test Structure
- `single-block.e2e.ts`: Tests basic inset creation, updates, and removal
- `two-blocks-interaction.e2e.ts`: Tests cross-block communication and real-time updates

## Running Tests

### Prerequisites
1. Ensure VS Code and Chromedriver are available (handled by wdio-vscode-service)
2. Mock LSP server should be available at `test/mock-lsp-server.js`

### Commands

```bash
# Run all WebdriverIO tests
npm run test:wdio

# Run only single block tests
npm run test:wdio:single-block

# Run only two-blocks interaction tests
npm run test:wdio:two-blocks

# Run with specific VS Code version
VSCODE_VERSION=1.80.0 npm run test:wdio

# Run in verbose mode
DEBUG=wdio-vscode-service npm run test:wdio
```

## Test Scenarios

### Single Block Tests
1. **Inset Creation**: Verifies that vivafolio blocks create visible webview insets
2. **Inset Updates**: Tests that changing block properties updates the inset
3. **Inset Removal**: Verifies that removing blocks removes their insets

### Two Blocks Interaction Tests
1. **Initial State**: Both picker and square show the same initial color
2. **Color Changes**: Changing picker color updates square in real-time
3. **Multiple Changes**: Tests sequence of color changes
4. **State Consistency**: Verifies state remains consistent across file modifications
5. **Block Lifecycle**: Tests adding/removing blocks dynamically

## How It Works

### Context Switching
The key innovation is **context switching** between VS Code's main workbench and webview iframes:

```typescript
// Switch to webview to interact with its DOM
await webview.switchToFrame()

// Interact with webview elements
await $('#color-input').setValue('#ff0000')

// Switch back to main workbench
await webview.switchBack()
```

### Message Passing
Tests verify the complete communication loop:

1. User interacts with webview UI
2. Webview sends `postMessage` to extension
3. Extension processes message and updates diagnostics
4. LSP sends updated diagnostics to client
5. Client updates webviews with new state

### Simulated Human Actions
All interactions simulate realistic user behavior:
- Clicking color inputs (when possible)
- Setting values programmatically (for headless testing)
- Waiting for real-time updates
- Verifying visual feedback

## Configuration

The `wdio.conf.ts` file configures:
- VS Code version and extension loading
- Test workspace and file paths
- Timeout and retry settings
- Reporter configuration

## Debugging

### Visual Debugging
```bash
# Run in headed mode for visual debugging
HEADLESS=false npm run test:wdio
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=wdio-vscode-service npm run test:wdio
```

### Interactive Debug
Add `await browser.debug()` in test code to pause execution and inspect the state.

## Limitations and Workarounds

### Native Color Picker
The browser's native color picker cannot be automated in headless mode. Tests use `setValue()` to simulate user input.

### Timing Dependencies
VS Code extension loading and LSP communication require appropriate timeouts. Tests include realistic waits for:
- Extension activation (3-5 seconds)
- LSP diagnostic processing (2-3 seconds)
- Webview rendering (1-2 seconds)

## Integration with CI/CD

For CI environments, ensure:
1. Virtual framebuffer for headless GUI: `xvfb-run npm run test:wdio`
2. Sufficient memory allocation for VS Code
3. Proper cleanup between test runs

## Comparison with Playwright

| Aspect | Playwright | WebdriverIO + wdio-vscode-service |
|--------|------------|-----------------------------------|
| Webview Access | ❌ Cannot access sandboxed iframes | ✅ Full access via context switching |
| VS Code API | ❌ No awareness of vscode object | ✅ Direct API access |
| Setup Complexity | Low | Medium-High |
| Realistic Testing | ❌ Limited to external web content | ✅ True E2E user simulation |
| Cross-block Communication | ❌ Cannot test | ✅ Full LSP message flow testing |

This WebdriverIO setup provides the definitive solution for testing complex VS Code extensions with interactive webviews.
