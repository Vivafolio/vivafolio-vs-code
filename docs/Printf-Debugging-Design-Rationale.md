# Printf Debugging – Design Rationale

This note captures why the logging/printf debugging system is designed the way it is, what trade‑offs we made, how to keep happy paths quiet, and how new contributors can quickly get effective signal when something misbehaves.

## Problem framing
- Multiple processes and contexts: VS Code main, renderer(s), extension host, and webviews all have separate consoles and files; tests add another layer (WDIO runner and proxy). There is no single built‑in, unified log.
- Manual vs automated parity: Manual sessions “look fine” while automated runs may flake. We need enough instrumentation to prove equivalence or to localize divergence quickly.
- Developer time is precious: Default runs must stay low‑noise; on failure we want a crisp path to the right evidence with grep‑friendly output.

## Goals
- Low cost in production: By default, logging produces only information that's relevant for the end user. This is done with very low overhead. Debug knobs are env‑gated and pre‑set in test invocations.
- Grep first: Prefer one‑line messages with clear tags and ISO timestamps to make shell tools powerful (grep/sed/awk/sort).
- Whole‑system view on demand: Provide a simple interleave tool to merge logs by timestamp across sources.
- Minimal coupling: Don’t depend on VS Code internals; keep most logic in our extension/webviews and thin test harness glue.

## Key decisions
- Env‑gated logging
  - `VIVAFOLIO_DEBUG=1` / `VIVAFOLIO_LOG_TO_FILE=1` enable a persistent file log in the extension’s global storage. Rationale: stable, user‑writable location; survives window reloads; does not spam Output by itself.
  - `VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1` proxies `console.log/warn/error` from webviews back to the extension. Rationale: webview consoles aren’t captured by default and are essential during early bring‑up; keep off by default to avoid noise/perf overhead.
  - Just recipes for tests export these vars so automated runs always have breadcrumbs without developers memorizing flags.

- OutputChannel + file log
  - Output channel “Vivafolio” is the fastest feedback loop (visible in VS Code). The optional file log is machine‑parsable and survives process restarts.
  - We emit ISO 8601 timestamps in the file log to support stable ordering in multi‑file merges.

- Tagging strategy (grepability)
  - Use compact, unique prefixes:
    - `[Vivafolio]` – extension lifecycle and inset operations.
    - `renderInset start/end` – webview lifecycle milestones.
    - `Extension received graph:update:` – state ingress from webviews.
    - `[WEBVIEW]` – proxied webview logs (enabled only when capturing).
    - `LSP didOpen:` / `LSP didChange:` – mock server document processing.
    - Include `blockId=` or entity identifiers when available to correlate flows.
  - Keep payloads as single‑line JSON where helpful; avoid multi‑line blobs.

- Interleaver tool
  - A tiny Node CLI (`test/interleave-logs.js`) merges many files by parsed timestamp and prints `ISO_TS file | line`.
  - Rationale: VS Code writes separate logs per process/session; we won’t reinvent or replace that—just provide a pragmatic merger when needed.

- Failure UX in WDIO
  - On failures, WDIO prints the path to `docs/PrintfDebugging.md` and an example interleave command. Rationale: new contributors get guided towards the right tools immediately.

- Webview logging capture is opt‑in
  - Rationale: The majority of runs don’t need webview chatter; capturing only when asked keeps noise down and avoids overhead.

- Test file isolation (two_blocks.mocklang)
  - WDIO specs operate on a temporary copy and delete it in teardown. Rationale: avoid polluting manual demo files and keep diffs meaningful.

## Constraints and trade‑offs
- We intentionally do not attempt to funnel all logs into a single file at runtime. VS Code’s structured logs and separation by process are useful; merging is a post‑processing step when necessary.
- We prefer plain text logs with strong conventions over a heavier structured logging framework for now; this keeps cognitive and runtime overhead low.

## Future improvements
- Correlation IDs: propagate a short run/session id across extension ↔ webview ↔ LSP to make joins trivial in merged logs.
- Log levels: add `debug/info/warn/error` filtering knobs to reduce volume in noisy areas.
- Rotating file logs: basic max size/rotation in the extension’s logger to prevent unbounded growth in long sessions.
- Structured (JSON) logs behind a flag if we outgrow grep‑first workflows.

## Onboarding quick recipe
- Run: `just vscode-e2e` (tests set debug env automatically)
- If a test fails, follow WDIO’s failure message:
  - Open `docs/PrintfDebugging.md`.
  - Interleave VS Code logs and `vivafolio-*.log` with the provided command.
  - Grep for tags (`[Vivafolio]`, `graph:update`, `gui_state_syntax_error`, `blockId=`) to follow the flow.

## Security & privacy
- Keep logs free of user content beyond what’s necessary for debugging (e.g., colors, block ids). Do not log full source buffers.
- Debug logging is opt‑in and file logs live under the extension’s storage path.
