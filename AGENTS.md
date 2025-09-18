### Agents: How to run Vivafolio tests

## ⚠️ Critical Testing Guidelines

- **ALWAYS WRITE AND RELY ON HEADLESS TESTS**: All tests must be headless and automated. Never run tests that require manual interaction or visual inspection.
- **NEVER START SERVER PROCESSES FROM THE SHELL**: Server processes block the agent loop and prevent parallel execution. Always start servers within automated test scripts that can manage their lifecycle.
- **USE TEST FRAMEWORKS WITH BUILT-IN SERVER MANAGEMENT**: Configure test frameworks (like Playwright) to automatically start/stop servers as part of the test suite.
- **KEEP TESTS FAST AND RELIABLE**: Tests should complete in seconds, not minutes, and be deterministic.

- All Just recipes use `scripts/nix-env.sh` as a shell wrapper via the Justfile:
  - It checks `IN_NIX_SHELL`. If not set, it enters the vivafolio flake dev shell (`nix develop`) before executing the recipe.
  - This ensures tool availability (lean4, nim, nimlsp/nimlangserver, ldc, dub, serve-d) without leaking large logs into the agent console.

- Preferred: run tests via `just` from the repo root so the correct dev environment is guaranteed:
  - `just test-lsp-basic-comms` — runs the Basic Communications suite across all languages
  - `just test-lsp-callsite` — runs the Call-site Diagnostics suite across all languages
  - `just test-lsp-scenarios` — runs both suites in sequence

- Test runner:
  - Suite definitions and implementation paths:
    - Basic Communications: implemented in `vivafolio/test/scenarios/basic-comms.js` (run via `just test-lsp-basic-comms`).
    - Call-site Diagnostics: implemented in `vivafolio/test/scenarios/callsite-diagnostics.js` (run via `just test-lsp-callsite`).
    - Combined Scenarios: aggregator (`just test-lsp-scenarios`) chaining the two scenario suites above.
    - Isolated LSP (inline widget): implemented in `tests/isolated-lsp/inlineWidget.test.js` (run via `just test-lsp-inline`).
    - Isolated LSP (RPC): implemented in `tests/isolated-lsp/widgetGetCode.test.js` and `tests/isolated-lsp/widgetByName.test.js` (run via `just test-lsp-rpc`).
    - Minimal connectivity (optional direct script): implemented in `vivafolio/test/e2e-connectivity.js`.
  - All sessions log LSP protocol to `vivafolio/test/logs/` with per-run timestamps.
  - On success: minimal console output.
  - On failure: prints per-language log file path and size so agents can fetch only what’s needed.

- Environment switches:
  - Nim LSP: set `VIVAFOLIO_NIM_LSP` or `NIM_LSP` to pick a specific server (e.g., `nimlsp` or `nimlangserver`).
  - Using `just` preserves these variables inside the dev shell.
  - Future: we may expose a matrix runner to try multiple Nim versions in CI.

- Rationale:
  - Minimize console output for agents to preserve context; rely on file logs for detailed inspection.

- For test writing/maintenance guidelines, see `vivafolio/test/AGENTS.md`.

- When updating project documentation, reference the implementation artefacts that changed using file paths (e.g., ``apps/blockprotocol-poc/src/server.ts:1``). Align with the formatting already used in status docs so progress notes stay auditable.
- Agents must not launch long-lived dev servers directly. Instead, rely on test scripts or commands that start the server, exercise it, and shut it down automatically.

