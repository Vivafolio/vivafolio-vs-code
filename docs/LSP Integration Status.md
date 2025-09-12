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
- **Logging**: Each test session records full protocol traffic to `vivafolio/test/logs/<lang>-connectivity-<timestamp>.log`. On failure, the runner prints the log file path and size to aid debugging without flooding the console.

## Suites and Current Status

### basic-comms
- Runner: `npm run test:scenario:basic-comms`
- Projects:
  - Lean: `vivafolio/test/projects/lean-basic`
  - Nim: `vivafolio/test/projects/nim-basic` (servers: `nimlsp`, `nimlangserver`)
  - D: `vivafolio/test/projects/d-basic`
  - Rust: `vivafolio/test/projects/rust-basic`
  - Zig: `vivafolio/test/projects/zig-basic`
  - Crystal: `vivafolio/test/projects/crystal-basic`

Results:

#### Lean
- Server: lake serve (Lean 4)
- Status: PASS. Minimal project `vivafolio/test/projects/lean-basic`; a tiny `#emit_warn` command logs a warning. Diagnostics observed (message contains "hello from connectivity").
- Notes: Runs with the standard toolchain in the Vivafolio flake shell.
- Next: None.

#### Nim
- Servers: nimlangserver (v1.12.0), nimlsp
- Status: PARTIAL SUCCESS
  - nimlangserver: Still crashes with SIGSEGV when spawning nimsuggest
  - nimlsp: PASS - Now working after project structure fixes and configuration updates
- Latest logs:
  - `nimlangserver`: see the most recent `nim-connectivity-nimlangserver-*.log` (contains SIGSEGV after nimsuggest startup).
  - `nimlsp`: see the most recent `nim-connectivity-nimlsp-*.log` (working with diagnostics published).
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
- Status: PASS - Now working after making diagnostic detection more flexible
- Latest log: most recent `d-connectivity-*.log` shows successful initialization and diagnostics published.
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
- Status: PASS. Minimal project `vivafolio/test/projects/rust-basic`; added `src/main.rs` and a deliberate error in `src/bad.rs`. Diagnostics observed after didOpen/didChange.
- Next: None.

#### Zig
- Server: zls (v0.14.0)
- Status: FAIL (no diagnostics published). zls processes all LSP messages correctly but doesn't publish diagnostics.
- Latest log: most recent `zig-connectivity-*.log` shows proper initialization and document processing, but no `textDocument/publishDiagnostics` messages.
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
- Status: FAIL (no diagnostics published). crystalline responds to LSP messages and creates work progress, but doesn't publish diagnostics.
- Latest log: most recent `crystal-connectivity-*.log` shows proper initialization and document processing, but no `textDocument/publishDiagnostics` messages.
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
- Runner: `npm run test:scenario:callsite-diagnostics`
- Projects (producer module + separate call-site module):
  - Lean: `vivafolio/test/projects/lean-callsite` (`Defs.lean` provides `#emit_warn`; `Call.lean` uses it)
  - Nim: `vivafolio/test/projects/nim-callsite` (`bad_provider.nim` provides `needsInt`; `use_bad.nim` calls with wrong type)
  - D: `vivafolio/test/projects/d-callsite` (`bad_provider.d` + `use_bad.d`)
  - Rust: `vivafolio/test/projects/rust-callsite` (`src/lib.rs` + `src/use_bad.rs`)
  - Zig: `vivafolio/test/projects/zig-callsite` (`bad_provider.zig` + `use_bad.zig`)
  - Crystal: `vivafolio/test/projects/crystal-callsite` (`bad_provider.cr` + `use_bad.cr`)

Results:
- Lean: PASS (diagnostic published at call-site module)
- Nim (nimlsp): Pending – expect type-mismatch diagnostic in `use_bad.nim`.
- Nim (nimlangserver): Pending – known instability (nimsuggest spawn); keep logs for upstream issue.
- D: Pending – expect type diagnostic at `use_bad.d` call-site; ensure serve-d config suppresses DCD requirements.
- Rust: Pending – expect type mismatch in `use_bad.rs`; rust-analyzer may need Cargo target detection (consider minimal `main.rs` plus lib).
- Zig: Pending – zls may not surface diagnostics without a build graph; try direct parse errors in call-site file.
- Crystal: Pending – crystalline may need shard/workspace discovery; ensure `shard.yml` at project root.
- **Lean**: ✅ PASS - Working correctly
- **Nim**: ✅ PARTIAL SUCCESS - nimlsp working, nimlangserver crashes
- **D**: ✅ PASS - Working after diagnostic detection fixes
- **Rust**: ✅ PASS - Working correctly
- **Zig**: ❌ FAIL - zls v0.14.0 doesn't publish diagnostics in test scenario
- **Crystal**: ❌ FAIL - crystalline v0.15.0 doesn't publish diagnostics in test scenario

#### Summary of Progress
- basic-comms: Lean ✅, Nim (nimlsp) ✅, D ✅, Rust ✅, Zig ❌, Crystal ❌, Nim (nimlangserver) ❌
- callsite-diagnostics: Lean ✅, others Pending/Failing as noted

#### Recommended Next Steps (by language)
- **Lean**: Stable. Optionally add tests for Warning vs Error levels and relatedInformation.
- **Nim (nimlsp)**: Verify `workspace/didChangeConfiguration` projectMapping; test Nim 1.6.x and 2.x; add `didSave` after changes; capture server logs.
- **Nim (nimlangserver)**: Reproduce crash with current logs; try disabling nimsuggest; file upstream issue with stack trace; test older/newer versions.
- **D (serve-d)**: Keep responding to `workspace/configuration` to avoid DCD. Validate diagnostics originate in call-site file. Consider bundling DCD in flake if later required.
- **Rust (rust-analyzer)**: Ensure both `src/lib.rs` and a `[[bin]]` or `src/main.rs` exist so cargo metadata resolves; if needed, open the lib file then the bin file to force analysis.
- **Zig (zls)**: Try zls latest/nightly; add `build.zig` with simple exe target to see if diagnostics start flowing; test direct parse errors in `use_bad.zig`; confirm `zig` path via init options.
- **Crystal (crystalline)**: Set workspace root to shard directory; send init options if available; test older crystalline; confirm `crystal tool format`/`build` locally; try opening both producer and call-site files.

#### Multi-Server/Version Matrix
- Nim: nimlangserver needs upstream fix for SIGSEGV crash
- D: Current configuration working, monitor for future DCD issues
- Zig: Requires investigation of zls diagnostic publishing behavior
- Crystal: Requires investigation of crystalline diagnostic publishing behavior

#### Logging
- All tests record per-session protocol logs in `vivafolio/test/logs`. On failure, the test prints the failing log path and byte size.
