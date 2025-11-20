# Vivafolio VS Code Extension Debugging Guide

This guide outlines how to debug the Vivafolio VS Code extension in the VS Code GUI, including setup, configuration, and troubleshooting.

## Overview

The Vivafolio extension runs in VS Code's Extension Host process and can be debugged using VS Code's built-in debugger. The `just vscode-e2e` command launches VS Code with debugging enabled, and you can attach a debugger to inspect and step through extension code.

## Prerequisites

- VS Code installed (preferably VS Code Insiders for the latest features)
- Node.js and npm
- The Vivafolio extension built (`just build` or `npm run compile`)

## VS Code Instance Setup

The `just vscode-e2e` command is already configured for debugging:

```bash
just vscode-e2e
```

This launches VS Code with the following debugging flags:
- `--inspect-extensions=9229`: Enables extension debugging on port 9229
- `--extensionDevelopmentPath`: Loads both the main extension and mock language extension
- `--enable-proposed-api local.vivafolio`: Enables proposed APIs used by the extension

The launched instance includes:
- Fresh user data directory (temporary, unless `PERSIST_PROFILE=1` is set)
- Fresh extensions directory
- The vivafolioblock test workspace
- The `two_blocks.mocklang` file opened to trigger diagnostics/insets

## Debugger Configuration

### Launch Configurations

The launch configuration is stored in `.vscode/launch.json` and includes:

### Launch Configuration Options

- **Attach to Extension Host**: Connects to a running extension instance (use with `just vscode-e2e`)
- **Debug Extension + LSP (Launch)**: 🚀 **Automated** - Launches VS Code E2E and attaches to both extension host and LSP server
- **Debug Extension (Launch)**: Launches a new VS Code instance with the extension loaded
- **Debug Webview (Attach)**: Alternative configuration for webview debugging
- **Debug Tests (Attach)**: Connect to test processes running with debugging enabled
- **Attach to Mock LSP Server**: Debug the mock LSP server process (port 6009)

## Debugging Workflow

### Method 0: Automated Launch + Debug (Easiest) 🚀

The **"Debug Extension + LSP (Launch)"** configuration provides the most automated experience:

1. **Select the configuration** in Run and Debug panel (Ctrl+Shift+D)
2. **Click the green play button** or press F5
3. **VS Code will automatically:**
   - Launch the E2E environment with `just vscode-e2e`
   - Set debug environment variables (`VIVAFOLIO_DEBUG=1`, `VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1`)
   - Open VS Code with the vivafolioblock test project
   - Attach debuggers to both the extension host (port 9229) and LSP server (port 6009)

4. **You're ready to debug!** Both processes will be paused:
   - **Extension Host**: At extension activation (if breakpoints set)
   - **LSP Server**: At startup (due to `--inspect-brk`)

5. **Set breakpoints** in both processes as needed and continue execution

**Benefits:**
- ✅ Single-click debugging setup
- ✅ No timing windows to miss
- ✅ Both processes debugged simultaneously
- ✅ Environment variables automatically set
- ✅ Test project automatically opened

### Method 1: Attach to Running Instance (Recommended)

1. **Launch VS Code with debugging enabled:**
   ```bash
   just vscode-e2e
   ```
   This opens a new VS Code window with the extension loaded and debugging enabled on port 9229.

2. **In your main VS Code window** (the one with the extension source code), open the Run and Debug panel (Ctrl+Shift+D).

3. **Select "Attach to Extension Host"** from the configuration dropdown.

4. **Click the green play button** or press F5 to attach the debugger.

5. **Set breakpoints** in your extension source code (e.g., `src/extension.ts`).

6. **Trigger extension functionality** in the debugged VS Code window:
   - Open/edit the `two_blocks.mocklang` file
   - Use commands like `Ctrl+Shift+R` (Execute Runtime File)
   - Interact with any webviews or insets that appear

### Method 2: Launch New Instance

1. **Select "Debug Extension (Launch)"** from the configuration dropdown.

2. **Click the green play button** or press F5.

3. This will:
   - Compile the extension
   - Launch a new VS Code window
   - Load the extension in development mode

4. **Set breakpoints** and interact with the extension as needed.

## Debugging Different Components

### Main Extension Code

- **File**: `src/extension.ts`
- **Breakpoints**: Set in activation events, command handlers, LSP client setup
- **Key areas to debug**:
  - Extension activation (`activate` function)
  - Command registration (`vivafolio.executeRuntimeFile`)
  - LSP client initialization
  - Webview creation and message handling

### Webview Components

Webviews run in a separate context but can be debugged:

1. **Enable webview debugging** in the launched VS Code window:
   - Open Developer Tools (Help > Toggle Developer Tools)
   - In DevTools Console, run: `vscode.postMessage({ command: 'debug', data: 'enable' })`

2. **Use browser DevTools** to debug webview JavaScript:
   - Right-click in webview > Inspect Element
   - Set breakpoints in webview JavaScript
   - Monitor network requests and console logs

### LSP Communication

- **Debug LSP messages** by adding breakpoints in LSP event handlers
- **Monitor LSP protocol** through the extension's logging (see Printf Debugging docs)
- **Check LSP server logs** in `vivafolio/test/logs/`

## Breakpoint Best Practices

### Useful Breakpoints to Set

1. **Extension Activation:**
   ```typescript
   // src/extension.ts - line ~50
   export function activate(context: vscode.ExtensionContext) {
       console.log('[Vivafolio] Extension activated'); // Add breakpoint here
   ```

2. **Command Execution:**
   ```typescript
   // src/extension.ts - command registration
   vscode.commands.registerCommand('vivafolio.executeRuntimeFile', async () => {
       // Add breakpoint here for runtime execution
   ```

3. **Webview Message Handling:**
   ```typescript
   // src/extension.ts - webview message handling
   webview.onDidReceiveMessage(async (message) => {
       // Add breakpoint here for webview communication
   ```

4. **LSP Client Events:**
   ```typescript
   // LSP client setup
   client.onDidChangeState((state) => {
       // Add breakpoint here for LSP state changes
   ```

### Conditional Breakpoints

Use conditional breakpoints for specific scenarios:

```typescript
// Break only when processing a specific file type
if (document.languageId === 'viv') {
    // Breakpoint logic
}
```

### Log Points

Use log points to output information without stopping execution:

```
Extension activated with workspace: {workspaceFolder}
```

## Troubleshooting

### Common Issues

#### 1. "Cannot connect to runtime process" Error

**Problem**: Debugger cannot attach to the extension host.

**Solutions**:
- Ensure the VS Code instance was launched with `--inspect-extensions=9229`
- Check that port 9229 is not already in use
- Try restarting both VS Code instances
- On Linux, ensure Xvfb is running if in headless mode

#### 2. Breakpoints Not Hit

**Problem**: Breakpoints show as unbound or are not triggered.

**Solutions**:
- Ensure source maps are enabled in launch configuration
- Verify `outFiles` path matches your compiled output
- Check that the source file matches the compiled JavaScript
- Try recompiling the extension (`just build`)

#### 3. "Extension host terminated unexpectedly"

**Problem**: The extension host crashes during debugging.

**Solutions**:
- Check the extension host logs in the launched VS Code window
- Look for unhandled exceptions in your code
- Ensure all dependencies are properly installed
- Check for TypeScript compilation errors

#### 4. Webview Debugging Not Working

**Problem**: Cannot debug webview content.

**Solutions**:
- Ensure webview debugging is enabled in DevTools
- Check that webview source maps are generated
- Verify webview content security policy allows debugging
- Use the browser's DevTools for webview-specific debugging

#### 5. Source Maps Not Loading

**Problem**: Source maps don't map back to TypeScript files.

**Solutions**:
- Ensure TypeScript compilation includes source maps (`"sourceMap": true` in tsconfig.json)
- Verify `outFiles` path in launch.json matches your build output
- Check that the `.map` files exist alongside `.js` files

### Debug Logging

Enable additional logging for debugging:

```bash
# Enable extension debug logging
VIVAFOLIO_DEBUG=1 just vscode-e2e

# Enable webview log capture
VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 just vscode-e2e

# Combine both
VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 just vscode-e2e
```

See `docs/Printf-Debugging-Design-Rationale.md` for more details on logging.

### Environment-Specific Issues

#### Linux
- Ensure Xvfb is running for headless debugging:
  ```bash
  Xvfb :99 -screen 0 1280x800x24 &
  export DISPLAY=:99
  ```

#### Windows
- Ensure VS Code Insiders is in your PATH
- Check that antivirus/firewall isn't blocking port 9229

#### macOS
- Ensure VS Code Insiders is properly installed
- Check System Preferences > Security & Privacy for any blocking

## Advanced Debugging Techniques

### Remote Debugging

Debug extensions running on remote machines:

1. **On remote machine**: Launch with `--inspect-extensions=9229 --inspect-brk-extensions=9229`
2. **Local machine**: Configure launch.json with the remote IP/port
3. **Connect**: Use SSH port forwarding if needed

### Multi-Extension Debugging

Debug multiple extensions simultaneously:

1. Launch VS Code with multiple `--extensionDevelopmentPath` flags
2. Attach debugger to each extension host process
3. Use different ports for each extension

### Debugging the Mock LSP Server

The mock LSP server (used for Vivafolio language features) can also be debugged when started from VS Code:

#### LSP Server Debug Configuration

The mock language extension is configured to start the LSP server with debugging enabled that breaks immediately on startup. When you run `just vscode-e2e`, the LSP server starts with:

- **Debug Port**: 6009
- **Command Line**: `--nolazy --inspect-brk=6009`
- **Transport**: stdio (standard input/output)
- **Behavior**: Breaks immediately on startup, waiting for debugger attachment

#### Attaching to LSP Server

1. **Launch VS Code with debugging:**
   ```bash
   just vscode-e2e
   ```

   ⚠️ **Important**: The LSP server will start and immediately break, waiting for debugger attachment. You have a short window to attach the debugger before it times out.

2. **In your main VS Code window**, open the Run and Debug panel (Ctrl+Shift+D)

3. **Select "Attach to Mock LSP Server"** from the configuration dropdown and click the green play button

   Once attached, you can step through the entire LSP server startup process, including initialization and the first LSP requests.

5. **Set breakpoints** in `test/mock-lsp-server.js`:
   - `connection.onRequest('initialize', ...)` - Server initialization
   - `connection.onNotification('textDocument/didOpen', ...)` - Document opening
   - `connection.onNotification('textDocument/didChange', ...)` - Document changes
   - `extractVivafolioBlocks()` - Block parsing logic

6. **Trigger LSP activity** in the debugged VS Code window:
   - Open or edit a `.mocklang` file (like `two_blocks.mocklang`)
   - The LSP server will process the file and send diagnostics

#### LSP Server Debugging Tips

- **Console Logging**: The LSP server logs to stderr, which appears in VS Code's Output panel under "Log (Window)"
- **Breakpoint Locations**: Focus on the main event handlers and parsing functions
- **Debug Timing**: LSP requests are asynchronous - use the debugger to step through the request/response flow
- **State Inspection**: Check the `uriState` Map for document state and `initialized` flag

#### Break-on-Startup Troubleshooting

If the LSP server fails to start with `--inspect-brk`:

1. **Timeout Issues**: The LSP server waits ~30 seconds for debugger attachment. If you miss this window:
   - Restart the VS Code instance with `just vscode-e2e`
   - Attach the debugger immediately after launch

2. **Port Conflicts**: If port 6009 is already in use:
   - Change the port in both the extension (`extension.ts`) and launch configuration (`launch.json`)
   - Example: `--inspect-brk=6010`

3. **Alternative Approach**: If you prefer attach-after-startup:
   - Temporarily change `--inspect-brk` back to `--inspect` in `mock-language-extension/src/extension.ts`
   - This allows the server to start normally, then attach the debugger when ready

4. **Debugging the Extension Startup**: To debug the mock language extension itself:
   - Use the "Attach to Extension Host" configuration
   - Set breakpoints in `mock-language-extension/src/extension.ts`

### Performance Profiling

Profile extension performance:

1. **CPU Profiling**: Use VS Code's built-in profiler
2. **Memory Analysis**: Monitor heap usage during debugging
3. **Network Monitoring**: Track LSP communication overhead

## Integration with Testing

### Debugging Tests

Debug WDIO tests alongside extension code:

1. **Launch test in debug mode**:
   ```bash
   VIVAFOLIO_DEBUG=1 node --inspect-brk test/scenarios/basic-comms.js
   ```

2. **Attach VS Code debugger** to the test process

3. **Set breakpoints** in both test and extension code

### CI/CD Debugging

Debug issues that only occur in CI:

1. **Capture logs** from CI runs
2. **Reproduce locally** with same environment variables
3. **Use interleaved logs** for multi-process debugging (see Printf Debugging docs)

## Resources

- [VS Code Extension Debugging](https://code.visualstudio.com/api/working-with-extensions/debugging-extensions)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [Webview Debugging](https://code.visualstudio.com/api/extension-guides/webview#debugging-webviews)
- [Printf Debugging Design Rationale](./Printf-Debugging-Design-Rationale.md)
- [VS Code Testing Tools](./VSCode-Testing-Tools.md)

## Contributing

When adding new debugging features:

1. Update this document with new configurations
2. Add relevant breakpoints to the "Useful Breakpoints" section
3. Document any new environment variables or flags
4. Test debugging workflow on all supported platforms
