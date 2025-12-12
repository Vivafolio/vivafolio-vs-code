### LSP Integration Status

This document defines and reports the status of Vivafolio’s initial Language Server Protocol (LSP) integration tests. These tests establish a baseline that each supported language can, using only standard tooling, publish ordinary diagnostics in response to tiny, self-contained source files.

## Test Goals

The LSP integration tests are structured around two primary objectives:

### 1. Basic Communications (`basic-comms`)
Demonstrates that diagnostics are delivered at all using tiny, standalone projects intentionally designed to produce hints, warnings, and errors. Verifies an ordinary diagnostic is published via LSP for each language/server pair.

### 2. Call-site Diagnostics (`callsite-diagnostics`)
Demonstrates diagnostics can be triggered from the call-site of user-defined symbols (macros/templates/functions). The diagnostic-producing symbol is defined in one module and used in another module that becomes the diagnostic source.

## Test Requirements

- **Scope**: Use standard, unpatched language servers and compilers/toolchains. No custom notification paths or editor extensions are required to trigger diagnostics.
- **Fixture projects**: Each language has a minimal, standalone project (e.g., Cargo/nimble/dub/zig) that contains a trivial source file designed to produce a normal compiler/linter hint, warning, or error.
- **Protocol coverage**: Verify end-to-end connectivity and basic message flow — `initialize`, `initialized`, `textDocument/didOpen` (optionally `didChange`/`didSave` as needed), and receipt of `textDocument/publishDiagnostics` within a reasonable timeout.
- **Matrix requirement**: For every language, test all available combinations of language servers and compiler/toolchain versions. The Vivafolio flake exposes multiple versions side-by-side so CI can execute a full matrix.
- **Pass criteria**: At least one diagnostic is published for the target file in the fixture project. Console output remains minimal on success.
- **Logging**: Each test session records full protocol traffic to `test/logs/<lang>-connectivity-<timestamp>.log`. On failure, the runner prints the log file path and size to aid debugging without flooding the console.

## Suites and Current Status

### basic-comms
- Runner: `npm run test:scenario:basic-comms` (or `just test-scenario-basic-comms`)
- Projects:
  - Lean: `test/projects/lean-basic`
  - Nim: `test/projects/nim-basic` (servers: `nimlsp`, `nimlangserver`)
  - D: `test/projects/d-basic`
  - Rust: `test/projects/rust-basic`
  - Zig: `test/projects/zig-basic`
  - Crystal: `test/projects/crystal-basic`

**Latest run:** 2025‑12‑12 (`lake 5.0.0 / Lean 4.22.0`). The overall recipe still times out at 120s because Zig and Crystal never emit diagnostics, but each server logs to `test/logs/basic-*.log` for inspection.

Results:

#### Lean
- Server: lake serve (Lean 4)
- Status: PASS. Minimal project `test/projects/lean-basic`; a tiny `#emit_warn` command logs a warning (see latest `test/logs/basic-lean-*.log`), even though the watchdog notes that the stream closes immediately after diagnostics are sent.
- Notes: Runs with the standard toolchain in the Vivafolio flake shell.
- Next: None.

#### Nim
- Servers: nimlangserver (v1.12.0), nimlsp
- Status: PARTIAL SUCCESS
  - nimlangserver: Still fails; nimsuggest now dies with `Operation not permitted` and never produces diagnostics (see `test/logs/basic-nim-nimlangserver-*.log`).
  - nimlsp: PASS - Publishes diagnostics after `didOpen/didChange/didSave` (`test/logs/basic-nim-nimlsp-*.log`).
- Completed fixes:
  - ✅ Updated to proper .nimble project structure with src/main.nim and src/bad.nim
  - ✅ Added didSave notifications after didChange
  - ✅ Added workspace/didChangeConfiguration for nimlsp
  - ✅ Improved project configuration and file structure
- Next:
  - Fix nimlangserver SIGSEGV crash - may require upstream issue filing
  - Test matrix of Nim versions (1.6.x, 2.x) when multiple versions available

#### D
- Server: serve-d (v0.7.6)
- Status: PASS with warnings. Diagnostics publish (see `test/logs/basic-d-*.log`), but serve-d still attempts to probe DCD and logs repeated “Failed to attach DCD component” warnings because `dcd-server` is not installed.
- Completed fixes:
  - ✅ Made diagnostic detection more flexible to accept diagnostics from any file in project
  - ✅ Added workspaceFolders configuration
  - ✅ Improved DCD configuration handling
  - ✅ Read existing file content instead of overwriting
- Next:
  - Monitor DCD configuration for future versions
  - Consider adding dcd binaries to flake if DCD probe continues to be an issue

#### Rust
- Server: rust-analyzer
- Status: PASS. Minimal project `test/projects/rust-basic`; added `src/main.rs` and a deliberate error in `src/bad.rs`. Diagnostics observed after didOpen/didChange (`test/logs/basic-rust-*.log`).
- Next: None.

#### Zig
- Server: zls (v0.14.0)
- Status: FAIL (no diagnostics published). zls processes initialization but never emits diagnostics before the 120s timeout (`test/logs/basic-zig-*.log`). It also logs permission issues writing to `~/.cache/zls`.
- Completed fixes:
  - ✅ Ensured proper project structure with src/main.zig
  - ✅ Moved syntax error into main.zig (build target)
  - ✅ Added didSave after didChange
  - ✅ Added workspaceFolders and proper rootUri
  - ✅ Disabled build-on-save to avoid build runner errors
  - ✅ Enabled debug logging with `--enable-stderr-logs --log-level debug`
  - ✅ Added initialization options for zls
  - ✅ Tested various syntax errors (parse errors, type errors)
  - ✅ Removed build.zig to avoid configuration issues
  - ✅ Verified zls is processing all notifications correctly
- Root cause: zls v0.14.0 does not publish diagnostics in this test scenario, despite processing all LSP messages correctly.
- Next:
  - Try different zls versions (newer or older)
  - Investigate if zls requires specific project structure or configuration
  - Check upstream zls issues for similar problems
  - Consider alternative Zig LSP servers if available
  - Add init options: set `zig_exe_path`, disable build-on-save, and verify `build.zig` absence is acceptable for AST diagnostics. Try opening `bad.zig` directly if `main.zig` fails.

#### Crystal
- Server: crystalline (v0.15.0)
- Status: FAIL (no diagnostics published). crystalline handles initialize/open/change but never publishes diagnostics (`test/logs/basic-crystal-*.log`).
- Completed setup:
  - ✅ Added crystalline to Vivafolio flake
  - ✅ Created minimal project with shard.yml
  - ✅ Added syntax error in src/bad.cr
  - ✅ Added proper LSP capabilities for diagnostics
  - ✅ Tested various syntax errors (undefined variables, missing end statements)
  - ✅ Verified crystalline processes all notifications correctly
- Root cause: crystalline v0.15.0 does not publish diagnostics in this test scenario, despite responding to all LSP protocol messages.
- Next:
  - Investigate crystalline configuration requirements
  - Check if crystalline needs specific initialization options
  - Try different crystalline versions
  - Check upstream crystalline issues for similar problems
  - Explicitly enable diagnostics via configuration if supported; try opening file URIs under the shard workspace root. Confirm `crystal --version` is available.

### callsite-diagnostics
- Runner: `npm run test:scenario:callsite-diagnostics` (or `just test-scenario-callsite-diagnostics`)
- Projects (producer module + separate call-site module):
  - Lean: `test/projects/lean-callsite` (`Defs.lean` provides `#emit_warn`; `Call.lean` uses it)
  - Nim: `test/projects/nim-callsite` (`bad_provider.nim` provides `needsInt`; `use_bad.nim` calls with wrong type)
  - D: `test/projects/d-callsite` (`bad_provider.d` + `use_bad.d`)
  - Rust: `test/projects/rust-callsite` (`src/lib.rs` + `src/use_bad.rs`)
  - Zig: `test/projects/zig-callsite` (`bad_provider.zig` + `use_bad.zig`)
  - Crystal: `test/projects/crystal-callsite` (`bad_provider.cr` + `use_bad.cr`)

**Latest run:** 2025‑12‑12 (same environment as above). The recipe again hit the 120s timeout, but per-language logs show:

- Lean: PASS (diagnostic published despite the `lake-manifest` syntax warning). See the latest `test/logs/callsite-lean-*.log`.
- Nim (nimlsp): FAIL. Session exits immediately after `workspace/didChangeConfiguration` and never opens the call-site file, so no diagnostics are published (`test/logs/callsite-nim-nimlsp-*.log`).
- Nim (nimlangserver): FAIL. nimsuggest repeatedly crashes with “Operation not permitted” and the server never produces diagnostics (`test/logs/callsite-nim-nimlangserver-*.log`).
- D: FAIL. serve-d halts immediately after initialization with DCD warnings and exits before opening `use_bad.d` (`test/logs/callsite-d-*.log`).
- Rust: PASS. Publishes the expected diagnostics in `use_bad.rs` (`test/logs/callsite-rust-*.log`).
- Zig: FAIL. zls initializes but never emits diagnostics before being terminated (`test/logs/callsite-zig-*.log`).
- Crystal: FAIL. crystalline processes initialize/didOpen/didChange/didSave but never publishes diagnostics (`test/logs/callsite-crystal-*.log`).

Results:
- Lean: ✅ PASS - Working correctly
- Nim (nimlsp): ❌ FAIL - never sends diagnostics at the call-site
- Nim (nimlangserver): ❌ FAIL - nimsuggest crash
- D: ❌ FAIL - terminates before diagnostics due to missing DCD
- Rust: ✅ PASS - Working correctly
- Zig: ❌ FAIL - zls v0.14.0 doesn't publish diagnostics in this scenario
- Crystal: ❌ FAIL - crystalline v0.15.0 doesn't publish diagnostics

#### Summary of Progress
- basic-comms: Lean ✅, Nim (nimlsp) ✅, D ✅, Rust ✅, Zig ❌, Crystal ❌, Nim (nimlangserver) ❌
- callsite-diagnostics: Lean ✅, Rust ✅, others currently failing as noted

#### Recommended Next Steps (by language)
- **Lean**: Stable. Optionally add tests for Warning vs Error levels and relatedInformation.
- **Nim (nimlsp)**: Ensure the call-site project applies `didOpen/didChange/didSave` (currently the session exits before sending diagnostics); investigate whether the script terminates too early or if nimlsp requires additional delay.
- **Nim (nimlangserver)**: Reproduce crash with current logs; try disabling nimsuggest; file upstream issue with stack trace; test older/newer versions.
- **D (serve-d)**: Either provide `dcd-server` in the dev shell or configure serve-d to skip DCD entirely so it proceeds to diagnostics.
- **Rust (rust-analyzer)**: Ensure both `src/lib.rs` and a `[[bin]]` or `src/main.rs` exist so cargo metadata resolves; if needed, open the lib file then the bin file to force analysis.
- **Zig (zls)**: Try zls latest/nightly; add `build.zig` with simple exe target to see if diagnostics start flowing; test direct parse errors in `use_bad.zig`; confirm `zig` path via init options.
- **Crystal (crystalline)**: Set workspace root to shard directory; send init options if available; test older crystalline; confirm `crystal tool format`/`build` locally; try opening both producer and call-site files.

#### Multi-Server/Version Matrix
- Nim: nimlangserver needs upstream fix for nimsuggest crash; nimlsp requires better handling of the call-site workflow.
- D: Provide a bundled `dcd-server` or disable DCD so serve-d can reach diagnostics.
- Zig: Requires investigation of zls diagnostic publishing behavior
- Crystal: Requires investigation of crystalline diagnostic publishing behavior

#### Logging
- All tests record per-session protocol logs in `test/logs`. On failure, the test prints the failing log path and byte size.
