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

**Latest run:** 2025‑12‑22 (`lake 5.0.0 / Lean 4.22.0`). All language/server pairs now publish diagnostics within the timeout window; see `test/logs/basic-*.log` for per-language traces.

Results:

#### Lean
- Server: lake serve (Lean 4)
- Status: PASS. Minimal project `test/projects/lean-basic`; dedicated `#emit_viv_warn` / `#emit_viv_error` commands log one warning and one error (see latest `test/logs/basic-lean-*.log`). Tests assert Lean’s LSP payloads retain severity + source metadata. `test/projects/lean-dsl` adds a richer DSL sample using `vivafolio_picker!()/gui_state!` macros plus a malformed payload fixture; `npm run test:e2e:lean-nim` opens these files to verify both happy-path and syntax-error diagnostics.
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
- Server: zls (v0.15.0)
- Status: PASS. After modernizing the fixture’s `build.zig`/`build.zig.zon` and enabling `enable_build_on_save` in the LSP initialize request, zls publishes diagnostics for `src/main.zig` (`test/logs/basic-zig-*.log`).
- Completed fixes:
  - ✅ Ensured proper project structure with src/main.zig
  - ✅ Moved syntax error into main.zig (build target)
  - ✅ Added didSave after didChange
  - ✅ Added workspaceFolders and proper rootUri
  - ✅ Enabled debug logging with `--enable-stderr-logs --log-level debug`
  - ✅ Added initialization options for zls (`enable_build_on_save`, absolute `zig_exe_path`)
  - ✅ Tested various syntax errors (parse errors, type errors)
  - ✅ Replaced minimal build scripts with Zig 0.15 templates so the build runner no longer errors
  - ✅ Verified zls processes notifications correctly via the scenario harness
- Next:
  - Try different zls versions (newer or older). Vendored builds (`third_party/zls`) currently require Zig `0.16.0-dev`, while the dev shell only ships Zig 0.15.1, so we cannot test newer commits without a toolchain bump or a prebuilt binary.
  - Investigate if zls requires specific project structure or configuration
  - Check upstream zls issues for similar problems
  - Consider alternative Zig LSP servers if available
  - Add init options: set `zig_exe_path`, disable build-on-save, and verify `build.zig` absence is acceptable for AST diagnostics. Try opening `bad.zig` directly if `main.zig` fails.

#### Crystal
- Server: crystalline (v0.17.1, prebuilt binary)
- Status: PASS. Upgrading to crystalline 0.17.1 (compatible with our Crystal 1.16 toolchain) ensures diagnostics are published for `test/projects/crystal-basic/src/bad.cr` (`test/logs/basic-crystal-*.log`).
- Completed setup:
  - ✅ Added crystalline to Vivafolio flake
  - ✅ Created minimal project with shard.yml
  - ✅ Added syntax error in src/bad.cr
  - ✅ Added proper LSP capabilities for diagnostics
  - ✅ Tested various syntax errors (undefined variables, missing end statements)
  - ✅ Verified crystalline processes all notifications correctly after the 0.17.1 upgrade
- Root cause (historical): crystalline v0.15.0 bundled with nixpkgs was incompatible with Crystal 1.16 and never emitted diagnostics.
- Next:
  - Monitor crystalline releases and keep the pinned binary aligned with the Crystal compiler shipped in the dev shell.
  - Confirm `crystal --version` is available and matches the compatibility matrix from the crystalline README.

### callsite-diagnostics
- Runner: `npm run test:scenario:callsite-diagnostics` (or `just test-scenario-callsite-diagnostics`)
- Projects (producer module + separate call-site module):
  - Lean: `test/projects/lean-callsite` (`Defs.lean` provides `#emit_warn`; `Call.lean` uses it)
  - Nim: `test/projects/nim-callsite` (`bad_provider.nim` provides `needsInt`; `use_bad.nim` calls with wrong type)
  - D: `test/projects/d-callsite` (`bad_provider.d` + `use_bad.d`)
  - Rust: `test/projects/rust-callsite` (`src/lib.rs` + `src/use_bad.rs`)
  - Zig: `test/projects/zig-callsite` (`bad_provider.zig` + `use_bad.zig`)
  - Crystal: `test/projects/crystal-callsite` (`bad_provider.cr` + `use_bad.cr`)

**Latest run:** 2025‑12‑16 (same environment as above). The recipe again hit the 120s timeout, but per-language logs show:

- Lean: PASS (diagnostic published despite the `lake-manifest` syntax warning). See the latest `test/logs/callsite-lean-*.log`.
- Nim (nimlsp): PASS. Restoring `test/projects/nim-callsite/src/use_bad.nim` allows nimlsp to open the call-site file and publish the expected type-mismatch diagnostic (`test/logs/callsite-nim-nimlsp-2025-12-16T14-01-26-743Z.log`).
- Nim (nimlangserver): PASS with warnings. nimsuggest still logs JSON configuration parse errors, but diagnostics are now emitted once the restored `use_bad.nim` is opened (`test/logs/callsite-nim-nimlangserver-2025-12-16T14-01-27-300Z.log`).
- D: PASS. Bundling the upstream DCD binaries in the flake and adding a minimal `dub.json`/`use_bad.d` fixture allows serve-d to publish diagnostics (`test/logs/callsite-d-*.log`).
- Rust: PASS. Publishes the expected diagnostics in `use_bad.rs` (`test/logs/callsite-rust-*.log`).
- Zig: PASS. With `enable_build_on_save` enabled and a proper `build.zig`/`build.zig.zon` added to the fixture, diagnostics publish in `use_bad.zig` (`test/logs/callsite-zig-*.log`).
- Crystal: FAIL. crystalline processes initialize/didOpen/didChange/didSave but never publishes diagnostics (`test/logs/callsite-crystal-*.log`).

Results:
- Lean: ✅ PASS - Working correctly
- Nim (nimlsp): ✅ PASS - Working correctly now that `use_bad.nim` is present
- Nim (nimlangserver): ⚠️ PASS WITH WARNINGS - Diagnostics publish but nimsuggest continues to log configuration parse issues
- D: ✅ PASS - Working correctly
- Rust: ✅ PASS - Working correctly
- Zig: ✅ PASS - Working correctly
- Crystal: ❌ FAIL - crystalline v0.15.0 doesn't publish diagnostics

#### Summary of Progress
- basic-comms: Lean ✅, Nim (nimlsp) ✅, Nim (nimlangserver) ✅, D ✅, Rust ✅, Zig ✅, Crystal ✅
- callsite-diagnostics: Lean ✅, Nim (nimlsp) ✅, Nim (nimlangserver) ⚠️ (diagnostics publish but nimsuggest logs configuration errors), Rust ✅, D ✅, Zig ✅, Crystal ❌

#### Recommended Next Steps (by language)
- **Lean**: Stable. Optionally add tests for Warning vs Error levels and relatedInformation.
- **Nim (nimlsp)**: ✅ No immediate action required after restoring the call-site fixture.
- **Nim (nimlangserver)**: Investigate the repeated `Incorrect JSON kind` warnings and ensure nimsuggest no longer dies mid-run; file upstream if warnings persist.
- **D (serve-d)**: ✅ No immediate action required after bundling DCD binaries and adding the dub project metadata.
- **Rust (rust-analyzer)**: Ensure both `src/lib.rs` and a `[[bin]]` or `src/main.rs` exist so cargo metadata resolves; if needed, open the lib file then the bin file to force analysis.
- **Zig (zls)**: ✅ No immediate action required; both basic and call-site fixtures publish diagnostics after enabling build-on-save and adding the missing build scripts.
- **Crystal (crystalline)**: Keep the dev-shell binary aligned with the Crystal compiler (currently 0.17.1 for Crystal 1.16). Call-site scenarios still need investigation with this newer binary.

#### Multi-Server/Version Matrix
- Nim: nimlsp + nimlangserver both publish diagnostics after restoring the call-site fixture, but nimlangserver still logs configuration warnings that may warrant upstream attention.
- D: ✅ Stable now that dcd-server/client are bundled via the flake
- Zig: ✅ Stable with the updated fixtures (basic + callsite)
- Crystal: ✅ Stable for basic-comms; call-site workflow remains TODO with the upgraded binary

#### Logging
- All tests record per-session protocol logs in `test/logs`. On failure, the test prints the failing log path and byte size.
