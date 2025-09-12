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

- Dev shell: `direnv allow` then `nix develop` (or open in VS Code with direnv).
- Build: `npm install && npm run compile`
- Package: `npx vsce package` (or `npm run package:vsix`)

## Runtime Path Demo

```bash
# Test Python runtime path
python3 test/runtime-path/python/two_blocks.py

# Test Ruby runtime path
ruby test/runtime-path/ruby/two_blocks.rb

# In VS Code: Ctrl+Shift+R to execute and render blocks
```

See `docs/Vivafolio-E2E-Runtime-Path-Tests.md` for detailed documentation.

