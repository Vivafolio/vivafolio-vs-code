# Vivafolio repo structure and new developer guide

This document gives you a fast, practical tour of the repository layout, what each piece does, and how to work locally (build, run, test, and debug).

If you prefer a higher‑level overview first, see `docs/Vivafolio-Overview.md` and the root `README.md`.

## Top‑level map

- `src/` – Main VS Code extension source (TypeScript). Entry: `src/extension.ts` → compiled to `out/`.
- `package.json` – Extension manifest, scripts, commands, and test runners.
- `Justfile` – Primary task runner for dev flows (build, watch, tests, POC servers). All recipes run inside the flake dev shell via `scripts/nix-env.sh`.
- `flake.nix`, `flake.lock` – Nix dev environment definitions (optional but recommended for reproducible setup).
- `docs/` – Architecture notes, designs, testing guides, and how‑tos (this file lives here).
- `apps/` – Application(s) used for validation and demos.
  - `apps/blockprotocol-poc/` – Standalone web app and testbed for Block Protocol integration.
- `blocks/` – Local block sources used during development and tests (plus a dev server and helpers).
- `packages/` – Local packages published via workspace file deps:
  - `packages/block-core/` – Shared, framework-agnostic core: common types, message shapes, and tiny utilities consumed by block frameworks and blocks.
  - `packages/block-loader/` – Loads blocks (remote/local), hooks, and runtime plumbing.
  - `packages/block-resources-cache/` – Cache and resource fetching for blocks.
  - `packages/indexing-service/` – Indexing and querying utilities used by the extension and tests.
  - `packages/block-frameworks/*` – Framework adapters (Angular, Lit, SolidJS, Svelte, Vue) used by the POC and examples.
- `mocklang-extension/` – A test‑only mock VS Code extension + mock LSP used by E2E flows.
- `test/` – E2E tests, runtime‑path tests, mock servers, and helper scripts.
- `third_party/` – Vendored dependencies (Block Protocol, language servers, dev infra).
- `scripts/` – Dev and CI helper scripts (launch VS Code, guarded process runner, etc.).

Other notable files:

- `tsconfig.json` – TypeScript config for the extension.
- `wdio.conf.ts` – WebdriverIO config for VS Code UI tests.
- `playwright.config.js` – Playwright config used by multiple suites.

## How the pieces fit

- The main VS Code extension (in `src/`) renders inline webview “blocks” in response to diagnostics or runtime execution.
- The extension delegates block loading to the local packages (`@vivafolio/block-loader`, `@vivafolio/block-resources-cache`, and `@vivafolio/indexing-service`).
- The Block Protocol POC app (`apps/blockprotocol-poc/`) is a separate Vite/Node app used to validate Block Protocol behavior, framework adapters, and end‑to‑end block scenarios with Playwright.
- The `blocks/` folder contains example blocks and a dev server that supports hot reloading when iterating locally.
- The mock language extension (`mocklang-extension/`) and its mock LSP make it easy to run E2E tests without relying on external LSPs.

## Key development workflows

You can drive almost everything with the `Justfile`. These recipes automatically run inside the Nix dev shell for consistency.

Prereqs (recommended):

1. Enable direnv in the repo root so your shell enters the dev environment automatically.
2. Install dependencies across workspaces.

```bash
# First time in the repo (optional but recommended)
direnv allow

# Install dependencies across packages and apps
just install-all
```

### 1) Work on the main VS Code extension

- Build once: `just build`
- Watch/rebuild on change: `just watch`
- Launch VS Code with the mock extension and this extension loaded:
  - Minimal: `just vscode-dev`
  - With watch tasks for extension + blocks: `just vscode-dev-full`

Notes:

- The `Justfile` uses `code-insiders` in these recipes. Adjust scripts if you only have stable VS Code installed.
- The extension exposes commands in `package.json` (e.g., `Vivafolio: Execute Runtime File` bound to `Ctrl+Shift+R`).

### 2) Develop and hot‑reload blocks

- Start the block dev server (watches and hot reloads):

```bash
just watch-blocks
```

- Build all blocks once: `just build-blocks`
- Clean builds: `just clean-blocks`

Local development settings inside VS Code:

- `vivafolio.localBlockDirs` – Array of directories to treat as authoritative local block sources.
- `vivafolio.enableLocalDevelopment` – Enables watch + live reload integration.

### 3) Run the Block Protocol POC app

Useful while iterating on framework adapters or validating Block Protocol behaviors.

- Dev server (restarts on source changes): `just dev-blockprotocol-poc`
- Dev server with framework watching: `just dev-blockprotocol-poc-frameworks`
- One‑shot dev server run (helpful for tests/CI): `just dev-blockprotocol-poc-once`
- Production run: `just start-blockprotocol-poc`
- Standalone server run: `just start-blockprotocol-poc-standalone`

### 4) Test suites

Global entry points:

- All tests: `just test-all`
- VS Code extension tests: `just test-vscode`
- WebdriverIO VS Code UI tests: `just test-wdio`
- Block Protocol POC tests (headless via Playwright): `just test-blockprotocol-poc`

Targeted POC suites (see `Justfile` for details):

- Core scenarios: `just test-blockprotocol-core`
- Frameworks: `just test-blockprotocol-frameworks`
- Scaffold: `just test-blockprotocol-scaffold`
- Standalone server: `just test-blockprotocol-standalone`
- Static assets: `just test-blockprotocol-assets`
- Dev server smoke: `just test-blockprotocol-devserver`
- Hooks (via block-loader): `just test-blockprotocol-hooks`
- Build + sanity run: `just test-blockprotocol-standalone-build`

Runtime‑path demos (no VS Code required):

- Python: `just test-runtime-python`
- Ruby: `just test-runtime-ruby`
- Julia: `just test-runtime-julia`
- R: `just test-runtime-r`
- JavaScript: `just test-runtime-javascript`

Playwright HTML report for the POC suite:

```bash
just test-blockprotocol-report
# Output: apps/blockprotocol-poc/playwright-report/index.html
```

### 5) Troubleshooting and housekeeping

- Show dev environment status: `just dev-status`
- Kill background watchers and VS Code instances started by recipes: `just kill-dev`
- Reset blocks (clean → build): `just reset-dev`
- Clean everything (extension, blocks, package dist, test output): `just clean-all`

## Folder deep‑dive

### `src/` (main extension)

- `extension.ts` is the activation entry. It wires up commands, the inline insets feature, and integration with the Block Protocol runtime.
- Build output goes to `out/` via `npm run compile` or `just build`.
- TypeScript config is at repo root (`tsconfig.json`).

### `mocklang-extension/`

- A minimal VS Code extension used in tests and manual dev flows. It provides a mock LSP and deterministic diagnostics so you can exercise insets and block wiring without external toolchains.

### `packages/`

- `block-core/` – Shared, framework-agnostic types (Entity, GraphService, BlockGraph, BlockProps), small helpers (getByPath, setByPath), and curated re-exports from `@blockprotocol/graph` to keep schemas consistent across frameworks.
- `block-loader/` – Hosts the mechanics to resolve, fetch, and instantiate blocks (local override vs remote, hooks, nested blocks, etc.). Has its own build and tests.
- `block-resources-cache/` – Caching/fetching resources to speed up block loading and avoid redundant network trips. Has tests.
- `indexing-service/` – Index and query utilities consumed by the extension and test tooling.
- `block-frameworks/` – One subfolder per supported framework (Angular, Lit, SolidJS, Svelte, Vue). Useful when validating POC scenarios and ensuring parity across frameworks.

Each package is wired in the root `package.json` via `file:` dependencies, so local changes are picked up without publishing.

### `apps/blockprotocol-poc/`

- A Vite‑driven dev/test app used for Playwright suites and manual smoke tests. It can build framework bundles, run a standalone server, and exercise nested blocks and hooks.
- See its local `package.json` for scripts referenced by `Justfile`.

### `blocks/`

- Production blocks WIP (e.g., `color-picker/`, `table-view-tanstack/`, `d3-line-chart/`).
- myBlock is the template of a block provided by the Block Protocol. To be used as a reference
- `dev-server.js` – Hot‑reload dev server for block development.
- `libs/` – Shared utilities for blocks (e.g., d3 wrapper).

### `test/`

- E2E and integration tests spanning:
  - Extension + webviews (`e2e-vivafolioblock.js`, connectivity, etc.)
  - Playwright setup/teardown helpers
  - Mock LSP server (`mock-lsp-server.js`) and direct invocation utils
  - WDIO specs under `test/wdio/`
  - Runtime‑path sample programs under `test/runtime-path/`

### `third_party/`

- Vendored sources for language servers (nimlangserver, zls, crystalline) and Block Protocol resources. The `Justfile` has tasks to build these if needed.

### `scripts/`

- Utilities used by recipes: launch VS Code Insiders, run guarded long‑lived processes, and abstract the Nix dev shell.

## Settings and config that matter

- VS Code settings relevant to local block dev:
  - `vivafolio.localBlockDirs` (string[]) – Directories that override remote block sources.
  - `vivafolio.enableLocalDevelopment` (boolean) – Enable watch + live reload flow.
- Enabled API proposals: the extension uses `editorInsets` (see `package.json.enabledApiProposals`).

## First‑day checklist

1) Enter the dev shell and install deps

```bash
direnv allow
just install-all
```

2) Bring up a productive dev session

```bash
# Option A: everything at once (watchers + VS Code)
just vscode-dev-full

# Option B: manual control
just watch &
just watch-blocks &
just vscode-dev
```

3) Run a quick smoke test

```bash
just test-e2e-vivafolioblock
# or
just test-blockprotocol-core
```

4) Explore blocks and POC

```bash
just dev-blockprotocol-poc-frameworks
```

## Useful references

- Root overview and command index: `README.md`
- Block Protocol E2E POC: `docs/BlockProtocol-E2E-POC.md`
- Dev server blueprint: `docs/BlockProtocol-DevServer.md`
- Runtime path testing: `docs/Vivafolio-E2E-Runtime-Path-Tests.md`
- VS Code extension debugging notes: `docs/Vivafolio-VSCode-Extension-Debugging.md`
