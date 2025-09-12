# Printf Debugging for Vivafolio

This guide explains how to capture rich logs from the extension host, webviews, the mock LSP server, VS Code, and WebdriverIO. Default runs remain quiet; enable deep logging only when investigating failures.

## Quick start (happy path)
- Run manual E2E: `just vscode-e2e`
- View extension logs: Output panel → “Vivafolio”
- Optional per-run flags (off by default):
  - `VIVAFOLIO_DEBUG=1` – writes an extension log file under `<globalStorage>/logs/`
  - `VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1` – proxies `console.log/warn/error` from webviews to the extension channel and file

## What gets logged where
- Extension (Vivafolio): Output channel “Vivafolio”; optional file `vivafolio-<ts>.log`
- Webviews (picker/square): forwarded to extension when `VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1`
- Mock LSP server: logs to stderr; captured by test harness
- VS Code internals: `Developer: Open Log File...` → main/renderer/exthost logs
- WebdriverIO: runner logs and artifacts in `test-results`

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

Set these in the shell before `just vscode-e2e` or WDIO env.

## Grep-friendly tags
- `[Vivafolio]` – extension lifecycle/inset events
- `renderInset start` – webview creation
- `Extension received graph:update:` – inbound state
- `[WEBVIEW]` – proxied webview logs
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
1) Happy-path run (no flags)
2) Flake/failure → re-run with `VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1` + VS Code Trace
3) Inspect Output → Vivafolio, and `<globalStorage>/logs/vivafolio-*.log`
4) If still unclear, open VS Code logs (main/renderer/exthost) via “Open Log File...”
5) Merge logs if needed: `cat /path/to/logs/**/*.log | sort > combined.log` (or use a log interleaver)

## WDIO notes
- Prefer extension-side assertions (`findInsetsForDocument`, `hasInsetAt`) to correlate with logs
- Keep actions small and tagged; add brief sleeps only when absolutely necessary
- Store artifacts per-spec for easy triage

## Codebase support (already implemented)
- OutputChannel + optional file logger in extension (env-gated)
- Webview `console.*` proxy to extension when enabled
- Non-destructive syntax-error signaling end-to-end

Keep logging off by default. Turn it on only when investigating issues.
