# Vivafolio (POC)

Standalone VS Code extension providing inline webview insets driven by Hint diagnostics. Supports both compile-time (CTFE) and runtime execution paths for interactive programming across multiple languages.

> Windows (no Nix) setup: see `WINDOWS_SETUP.md` for native PowerShell instructions.

## Features

- **CTFE Path**: Languages with compile-time function evaluation (Lean, Nim, Rust, etc.)
- **Runtime Path**: Dynamic languages (Python, Ruby) with `Ctrl+Shift+R` execution
- **Block Protocol**: Open standard for embeddable, data-centric components
- **Bidirectional Sync**: UI changes update source code, source changes update UI
- **Multi-language**: Extensible architecture for adding new language support

## Quick Start

- Dev shell: `direnv allow`
- To set up everything: `just build-all`. This command not only builds all packages, it also installs all npm dependencies

## Runtime Path Demo

```bash
# Test Python runtime path
just test-runtime-python

# Test Ruby runtime path
just test-runtime-ruby

# In VS Code: Ctrl+Shift+R to execute and render blocks
```

See `docs/Vivafolio-E2E-Runtime-Path-Tests.md` for detailed documentation.

## Quick Command Reference

**Development & Launch:**
- `just vscode-e2e` - Launch VS Code with both extensions for E2E testing
- `just dev-blockprotocol-poc-frameworks` - Launch Block Protocol POC with framework hot-reload
- `just dev-blockprotocol-poc-once` - Launch Block Protocol POC once (with timeout, for testing)
- `just build` - Build the main extension
- `just watch` - Watch-build the extension

**Testing:**
- `just test-all` - Run complete test suite
- `just test-blockprotocol-poc` - Run Block Protocol POC tests
- `just test-runtime-all` - Run all runtime path tests
- `just test-vscode` - Run VS Code extension tests

**Language Servers:**
- `just build-nimlangserver` - Build vendored Nim language server
- `just build-zls` - Build vendored Zig language server
- `just build-crystalline` - Build vendored Crystal language server

## Project Components

This repository contains several interconnected components that work together to provide the Vivafolio extension ecosystem:

### Core Components

- **Main Extension** (`src/`, `package.json`) - The primary VS Code extension providing inline webview insets and Block Protocol integration
  - **Launch**: `just vscode-e2e` (loads both mock and production extensions for E2E testing)
- **Mock Language Extension** (`mock-language-extension/`) - Test-only VS Code extension with mock language server for E2E testing ([README](mock-language-extension/README.md))

### Applications & Tools

- **Block Protocol POC** (`apps/blockprotocol-poc/`) - Standalone web application for validating Block Protocol integration with Playwright tests ([README](apps/blockprotocol-poc/README.md))
  - **Launch**: `just dev-blockprotocol-poc-frameworks` (with framework hot-reload) or `just dev-blockprotocol-poc` (basic)
  - **Launch Once**: `just dev-blockprotocol-poc-once` (basic, with timeout) or `just dev-blockprotocol-poc-frameworks-once` (frameworks, with timeout)
  - **Production**: `just start-blockprotocol-poc`
  - **Standalone**: `just start-blockprotocol-poc-standalone`
- **Scripts** (`scripts/`) - Build, development, and deployment automation scripts
- **Vivafolio Runtime** (`vivafolio/`) - Runtime-specific files and configurations

### Testing & Validation

- **Test Suite** (`test/`) - Comprehensive test suite including E2E tests, runtime path tests, and mock servers
  - **All Tests**: `just test-all` (runs complete test suite)
  - **VS Code Tests**: `just test-vscode` (extension test harness)
  - **E2E Tests**: `just test-wdio` (WebdriverIO tests for extension)
  - **Runtime Path Tests** (`test/runtime-path/`) - Test programs for dynamic language support ([README](test/runtime-path/README.md))
    - **All Runtime Tests**: `just test-runtime-all`
    - **Individual**: `just test-runtime-python`, `just test-runtime-ruby`, etc.
- **WDIO Tests** (`test/wdio/`) - WebDriver-based UI tests ([README](test/wdio/README.md))
- **Block Protocol Tests** - Comprehensive POC test coverage
  - **All POC Tests**: `just test-blockprotocol-poc`
  - **Individual Suites**: `just test-blockprotocol-all` (runs core, frameworks, scaffold, standalone, assets, devserver)
  - **Debug Mode**: `just test-blockprotocol-headed` (with browser UI) or `just test-blockprotocol-debug`
  - **Test Report**: `just test-blockprotocol-report` (generates HTML report)

### Documentation

- **Documentation** (`docs/`) - Comprehensive documentation covering architecture, testing, and development
  - `docs/Repo-Structure.md` - Repo structure and new developer onboarding guide
  - `docs/BlockProtocol-E2E-POC.md` - Block Protocol integration proof-of-concept
  - `docs/BlockProtocol-in-Vivafolio-Architecture.md` - Development server blueprint
  - `docs/Vivafolio-E2E-Runtime-Path-Tests.md` - Runtime path testing guide
  - `docs/Vivafolio-E2E-Test-Status.md` - Test status and coverage
  - `docs/Vivafolio-Overview.md` - High-level architecture overview

### Third-Party Dependencies

- **Third Party** (`third_party/`) - Vendored external dependencies and language servers
  - **Block Protocol** (`third_party/blockprotocol/`) - The Block Protocol specification and reference implementation
  - **Language Servers** - Vendored LSP implementations for supported languages:
    - **Nim Language Server** (`third_party/nimlangserver/`) ([README](third_party/nimlangserver/README.md))
    - **Zig Language Server** (`third_party/zls/`) ([README](third_party/zls/README.md))
    - **Crystal Language Server** (`third_party/crystalline/`) ([README](third_party/crystalline/README.md))
    - **Nix Nim Development** (`third_party/nix-nim-development/`) ([README](third_party/nix-nim-development/README.md))

### Configuration & Setup

- **Nix Flake** (`flake.nix`, `flake.lock`) - Development environment and dependency management
- **VS Code Configuration** (`.vscode/`) - Debug configurations and workspace settings
- **Justfile** (`Justfile`) - Task runner for common development operations
  - **Build**: `just build` (compile extension) or `just watch` (watch mode)
  - **Package**: `just package` (create .vsix file)
  - **Language Servers**: `just build-nimlangserver`, `just build-zls`, `just build-crystalline` (build vendored servers)
