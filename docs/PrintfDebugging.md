# Printf Debugging for Vivafolio

This guide explains how to capture rich logs from the extension host, webviews, the mock LSP server, VS Code, WebdriverIO, and the block development workflow. Default runs remain quiet; enable deep logging only when investigating failures.

## Quick Start (Block Development)

### Development Workflow Logging

```bash
# Full development environment with logging
just vscode-dev-full

# Or manually:
VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 just vscode-dev &
just watch-blocks &
```

### Check Development Status

```bash
# See what processes are running
just dev-status

# View extension logs in VS Code
# Output Panel → "Vivafolio"

# Check file logs
tail -f ~/Library/Application\ Support/Code\ - Insiders/User/globalStorage/local.vivafolio/logs/vivafolio-*.log
```

## Quick start (happy path)
- Run manual E2E: `just vscode-e2e`
- View extension logs: Output panel → “Vivafolio”
- Optional per-run flags (off by default):
  - `VIVAFOLIO_DEBUG=1` – writes an extension log file under `<globalStorage>/logs/`
  - `VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1` – proxies `console.log/warn/error` from webviews to the extension channel and file

## What gets logged where

### Core Components
- **Extension (Vivafolio)**: Output channel "Vivafolio"; optional file `vivafolio-<ts>.log` in `~/.vscode/extensions/globalStorage/local.vivafolio/logs/`
- **Webviews (blocks)**: forwarded to extension when `VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1`
- **Mock LSP server**: logs to stderr; appears in VS Code Output panel under "Mocklang Language Server" channel
- **VS Code internals**: `Developer: Open Log File...` → main/renderer/exthost logs
- **WebdriverIO**: runner logs and artifacts in `test-results`

### Block Development
- **POC Dev Server**: Framework compilation and Block Protocol scenario logs (`just dev-blockprotocol-poc*`)
- **Production Block Dev Server**: Console output when `just block-dev-server`
- **Block Building**: Build output when `just watch-blocks` or `just build-blocks`
- **File Watching**: Change notifications when blocks are rebuilt
- **Cache Invalidation**: Logs when block resources are updated

## Turn on full trace (when needed)
- VS Code: `Developer: Set Log Level...` → Trace, then Reload Window
- Electron/Chromium flags (via launch.json or CLI): `--enable-logging`, `--log-file=/abs/path/chrome_debug.log`
- LSP transport tracing per language (e.g. `<lang>.trace.server = "verbose"`)

## Interleaving multiple logs

Use the provided tool to merge logs by timestamp into a single stream:

```bash
node test/interleave-logs.js \
  /path/to/vscode/logs/**/main*.log \
  /path/to/vscode/logs/**/renderer*.log \
  /path/to/vscode/logs/**/exthost*.log \
  vivafolio/**/vivafolio-*.log > combined.log
```

Open `combined.log` and search for tags below to follow the full sequence of events.

## Extension env flags
- `VIVAFOLIO_DEBUG=1` or `VIVAFOLIO_LOG_TO_FILE=1` → file logging
- `VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1` → proxy webview `console.*`
- `BLOCK_DEV_SERVER_PORT=3001` → enable block dev server integration

Set these in the shell before `just vscode-e2e` or WDIO env.

## Grep-friendly tags

### Extension & Webview
- `[Vivafolio]` – extension lifecycle/inset events
- `renderInset start` – webview creation
- `Extension received graph:update:` – inbound state
- `Created VivafolioBlock notification:` – LSP diagnostic processed successfully
- `Rendered Block Protocol block:` – block loaded and displayed
- `Received Block Protocol message:` – webview-to-extension communication
- `[WEBVIEW]` – proxied webview logs

### Block Development
- `Block file changed:` – file watcher notifications
- `Building block:` – block rebuild events
- `✅ <block-name> rebuilt` – successful rebuilds
- `❌ <block-name> build failed` – build failures
- `[COLOR-PICKER]` – color picker block logs
- `[COLOR-SQUARE]` – color square block logs
- `LSP didOpen:` / `LSP didChange:` – mock server state
- `gui_state_syntax_error` – syntax error signaling

Examples:
- `grep -F "renderInset start" vivafolio-*.log | tail -n 20`
- `grep -F "graph:update" vivafolio-*.log | tail -n 50`
- `grep -F "gui_state_syntax_error" vivafolio-*.log`

## Tagging conventions

- `[Vivafolio]` – extension lifecycle and inset operations (creation/reuse/disposal)
- `renderInset start/end` – webview lifecycle
- `graph:update` – state messages from/to webviews
- `[WEBVIEW]` – proxied `console.*` from webviews (only when capture enabled)
- `LSP didOpen/didChange` – mock LSP notifications
- `payload blockId=` – which component/webview the message refers to

Prefer `console.log('[Vivafolio] renderInset start ...')`-style tags in extension code and concise one-line JSONs to keep logs grep-friendly.

## Suggested workflow

### General Debugging
1) Happy-path run (no flags)
2) Flake/failure → re-run with `VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1` + VS Code Trace
3) Inspect Output → Vivafolio, and `<globalStorage>/logs/vivafolio-*.log`
4) If still unclear, open VS Code logs (main/renderer/exthost) via "Open Log File..."
5) Merge logs if needed: `cat /path/to/logs/**/*.log | sort > combined.log` (or use a log interleaver)

### Block Development Debugging

1) **Start development environment:**
   ```bash
   just vscode-dev-full  # Includes logging and file watching
   ```

2) **Check development status:**
   ```bash
   just dev-status  # See running processes
   ```

3) **Monitor block changes:**
   - Watch terminal for `Block file changed:` messages
   - Check for `✅ <block-name> rebuilt` confirmations
   - Look for block-specific logs: `[COLOR-PICKER]`, `[COLOR-SQUARE]`

4) **Debug block loading issues:**
   ```bash
   # Check block builds
   just validate-blocks

   # View block dev server logs
   just block-dev-server  # In separate terminal
   ```

5) **Debug cache issues:**
   ```bash
   # Clear all caches
   just clean-all

   # Rebuild everything
   just reset-dev
   ```

## WDIO notes
- Prefer extension-side assertions (`findInsetsForDocument`, `hasInsetAt`) to correlate with logs
- Keep actions small and tagged; add brief sleeps only when absolutely necessary
- Store artifacts per-spec for easy triage

## Codebase support (already implemented)
- OutputChannel + optional file logger in extension (env-gated)
- Webview `console.*` proxy to extension when enabled
- Non-destructive syntax-error signaling end-to-end

Keep logging off by default. Turn it on only when investigating issues.
