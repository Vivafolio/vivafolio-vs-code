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

- Dev shell: `direnv allow` then run project tasks via `just <target>` (recipes automatically enter the flake dev shell).
- Build: `npm install && npm run compile`
- Package: `npx vsce package` (or `npm run package:vsix`)

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
- `just test-stand-alone` - Run all stand-alone tests (LSP + runtime, CommunicationLayer architecture)
- `just test-stand-alone SCENARIO...` - Run specific test scenarios (supports multiple arguments)
- `just test-all` - Run complete test suite
- `just test-blockprotocol-poc` - Run Block Protocol POC tests
- `just test-runtime-all` - Run all runtime path tests
- `just test-vscode` - Run VS Code extension tests
- `just test-scenario-basic-comms` - Run legacy LSP basic communications tests
- `just test-scenario-callsite-diagnostics` - Run legacy LSP call-site diagnostics tests

## Stand-Alone Test Runner

The stand-alone test runner (`test/stand-alone-runner.ts`) is written in TypeScript and consolidates LSP-based tests and runtime tests into a single testing framework using the CommunicationLayer architecture.

### Test Types

**LSP Tests (Compile-time):**
- Use `LspConnection` + `DiagnosticAdapter` for language server integration
- Test compile-time block discovery in languages like Nim, D, Lean, Zig, Crystal
- Examples: basic diagnostics, two-blocks discovery, call-site error detection

**Runtime Tests (Execution-time):**
- Use `LangExecutor` to run scripts and capture stdout JSON blocks
- Test runtime block emission in languages like Python, Ruby, Julia, JavaScript
- Examples: two-blocks runtime execution and block emission

### Command-Line Usage

```bash
# Run all tests (no arguments)
just test-stand-alone

# Run specific scenarios (supports multiple arguments)
just test-stand-alone nim          # All Nim tests
just test-stand-alone two-blocks   # All two-blocks tests
just test-stand-alone lsp          # All LSP-based tests
just test-stand-alone runtime      # All runtime tests
just test-stand-alone python       # Python runtime tests
just test-stand-alone nimlsp       # Nim LSP tests with nimlsp

# Multiple scenarios (space-separated arguments)
just test-stand-alone nim two-blocks
just test-stand-alone python julia runtime
just test-stand-alone lsp nimsuggest
```

### Test Selection Keywords

The stand-alone runner supports filtering by three categories:

- **Languages:** `nim`, `python`, `ruby`, `julia`, `javascript`, `d`, `lean`, `zig`, `crystal`, `rust`
- **Scenarios:** `two-blocks`, `basic-comms`, `callsite`
- **Communication Layers:** `lsp`, `runtime`, `nimsuggest`, `nimlsp`, `nimlangserver`

You can combine multiple filters from any category. For example:
- `just test-stand-alone nim two-blocks` - All Nim two-blocks tests
- `just test-stand-alone python julia runtime` - Python and Julia runtime tests
- `just test-stand-alone lsp nimsuggest` - LSP tests using nimsuggest

### Architecture Benefits

- **Unified Interface:** Single command interface for all test types
- **CommunicationLayer Abstraction:** Consistent block discovery across different mechanisms
- **Extensible:** Easy to add new languages and test types
- **Backward Compatible:** Legacy test runners still available
- **Cross-Language:** Shared logic for scenarios like two-blocks across different languages

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
  - **E2E Tests**: `just test-e2e-vivafolioblock` (headed: `just test-e2e-vivafolioblock-headed`)
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
  - `docs/BlockProtocol-E2E-POC.md` - Block Protocol integration proof-of-concept
  - `docs/BlockProtocol-DevServer.md` - Development server blueprint
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

## Architecture

Vivafolio uses a layered communication architecture to support different language toolchains and execution modes:

### Communication Layer Packages

The core architecture is built around abstract communication layers that can discover Vivafolio blocks through different mechanisms:

#### [`packages/communication-layer`](packages/communication-layer/)
**Purpose:** Abstract interfaces and utilities for block discovery
- `CommunicationLayer` interface - Abstract base for all communication mechanisms
- `CommunicationLayerType` enum - LSP, LangExecutor, HCR
- `BlockParser` - Utilities for parsing VivafolioBlock notifications
- `validateVivafolioBlock()` - JSON schema validation

#### [`packages/lsp-connection`](packages/lsp-connection/)
**Purpose:** LSP client simulation for testing infrastructure
- `LspConnection` - LSP client implementation for stand-alone tests
- `LspConnectionFactory` - Factory for creating language-specific LSP connections
- Integrates with diagnostics adapters for language-specific message cleaning
- **Used by:** Testing infrastructure only (VS Code extension uses built-in LSP client)

#### [`packages/lang-executor`](packages/lang-executor/)
**Purpose:** Runtime script execution for block discovery
- `LangExecutor` - Executes programs and captures VivafolioBlocks from stdout
- `LangExecutorFactory` - Pre-configured executors for different languages
- Used by VS Code extension for runtime block detection

#### [`packages/hcr-lang-executor`](packages/hcr-lang-executor/)
**Purpose:** Hot Code Reload system (future implementation)
- `HcrLangExecutor` - Placeholder for interactive HCR connections
- Supports persistent two-way communication channels
- Enables real-time updates without manual restarts

#### [`packages/diagnostics-adapter`](packages/diagnostics-adapter/)
**Purpose:** Language-specific LSP diagnostics processing
- `DiagnosticAdapter` - Interface for cleaning LSP diagnostic messages
- Language-specific implementations (Nim, D, Lean, Zig, Crystal, Rust)
- Removes artifacts and decorations that languages add to messages
- **Used by:** VS Code extension (processes diagnostics from built-in LSP client) and testing infrastructure

### Language Support Libraries

Vivafolio provides runtime libraries for different programming languages:

#### [`language-support/nim/`](language-support/nim/)
**Purpose:** Compile-time macros for Nim
- Uses LSP diagnostics for block discovery
- Compile-time macro expansion
- Integrated with nimsuggest for testing

#### [`language-support/python/`](language-support/python/)
**Purpose:** Runtime functions for Python
- `gui_state()` and block functions emit JSON to stdout
- Compatible with existing runtime-path infrastructure
- Supports both legacy and modern APIs

#### [`language-support/ruby/`](language-support/ruby/)
**Purpose:** Runtime gem for Ruby
- Ruby gem with module-based API
- Global state registry for GUI persistence
- Convenience functions for direct access

#### [`language-support/julia/`](language-support/julia/)
**Purpose:** Runtime package for Julia
- Julia package with stacktrace-based state tracking
- Full documentation strings
- Project.toml for package management

#### [`language-support/javascript/`](language-support/javascript/)
**Purpose:** Runtime Node.js package
- TypeScript with full type definitions
- ES6 modules and CommonJS support
- Comprehensive interfaces for all data structures

### Integration with VS Code Extension

The VS Code extension uses these packages as follows:

1. **LSP Mode:** Uses VS Code's built-in LSP client for compile-time detection, processes diagnostics through `DiagnosticAdapter`
2. **Runtime Mode:** Uses `LangExecutor` for script execution and stdout capture
3. **HCR Mode:** Will use `HcrLangExecutor` for interactive development (future)

**VS Code Extension Architecture:**
- VS Code provides LSP client infrastructure - the extension receives diagnostic notifications
- `DiagnosticAdapter` processes raw LSP diagnostics to extract clean VivafolioBlock notifications
- Language-specific adapters handle different LSP message formats and artifacts

**Testing Infrastructure:**
- `LspConnection` simulates LSP connections for stand-alone testing
- `DiagnosticAdapter` is used in both VS Code extension and testing
- Tests verify that block discovery works correctly across different LSP servers

All communication layers produce compatible `VivafolioBlock` notifications, ensuring consistent behavior across languages and execution modes.
