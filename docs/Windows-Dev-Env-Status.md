# Windows Dev Environment Status (Vivafolio)

(renamed from Windows-Dev-Env.md)

Tracking adaptation of the original Nix/direnv-based environment to native Windows (PowerShell 5.1) without Nix.

> Update (Nim LSP): Automatic `nimlsp` install skipped because the npm package name is not available (`nimlsp` 404). Options: build `nimlangserver` from source or proceed without Nim LSP for core demos.

## 1. Goals
- Reproduce enough of `flake.nix` to build, run tests, and demo runtime blocks.
- Provide tiered installation (minimal, runtime, full matrix).
- Keep steps idempotent and scriptable (winget + npm + gems).
- Document Windows-specific issues (PATH propagation, language server quirks).

## 2. Tiers Overview
| Tier | Purpose | Contents |
|------|---------|----------|
| minimal | Build extension + JS runtime demo | Node.js 22, TypeScript, vsce |
| runtime | Runtime path multi-language demo | minimal + Python, Ruby, Julia, R |
| full | LSP connectivity matrix attempt | runtime + Nim, D, Rust, Zig, Crystal, Lean, ChromeDriver, VS Code Insiders |

## 3. Current Status Summary
| Component | Status | Notes |
|-----------|--------|-------|
| Node.js / TypeScript | ✅ Installed | LTS via winget; `tsc` works |
| vsce | ✅ Installed | Global npm tool |
| Python | ✅ Installed | Recognized on PATH |
| Ruby | ✅ Installed (PATH) | Added bin path manually fallback logic |
| Julia | ⚠ Installed (PATH not yet visible in shell) | Binary at `%LOCALAPPDATA%/Programs/Julia-1.11.6/bin`; PATH refresh or shim pending |
| R | ✅ Installed | `R --version` works (pending verification) |
| Nim | ⏳ Pending (full tier) | Not yet installed in runtime tier |
| nimlsp | ⏳ Pending | Npm global planned in full tier |
| D (LDC/dub) | ⏳ Pending | Full tier only |
| serve-d | ⏳ Pending | Full tier only |
| Rust (rustup) | ⏳ Pending | Full tier only |
| Zig | ⏳ Pending | Full tier only |
| zls | ⏳ Pending | Manual download step |
| Crystal | ⏳ Pending | Scoop/manual; not required for runtime tier |
| crystalline | ⏳ Pending | `gem install crystalline` after Ruby works |
| Lean (elan) | ⏳ Pending | Full tier only |
| ChromeDriver | ⏳ Pending | Only for WDIO chromedriver service |
| VS Code Insiders | ⏳ Optional | For manual dual-extension test |
| Playwright browsers | ⏳ Pending | `npx playwright install` after npm deps |

Legend: ✅ working | ⚠ needs follow-up | ⏳ planned

## 4. PATH / Environment Propagation Issues
- Julia: Winget install placed under `%LOCALAPPDATA%\Programs\Julia-1.11.6\bin`.
- New VS Code integrated terminals sometimes inherit stale PATH; full editor restart or system logoff may be required.
- Workaround: create shim (`julia.cmd`) in a directory already on PATH (e.g. `%APPDATA%\npm`).

### Proposed Shim Contents
```
@echo off
"%LOCALAPPDATA%\Programs\Julia-1.11.6\bin\julia.exe" %*
```

## 5. Scripts Added
| Script | Purpose |
|--------|---------|
| `scripts/install-windows-deps.ps1` | Tiered winget + tool installation |
| `scripts/win-dev.ps1` | Convenience wrapper for build/tests |

## 6. Open Issues / TODO
| ID | Item | Priority | Notes |
|----|------|----------|-------|
| 1 | Julia PATH propagation | High | Add shim creation to installer if not detected |
| 2 | Add `--check` mode to installer | Medium | Verify versions, print summary only |
| 3 | Automate zls binary fetch | Low | Optional for Zig diagnostics |
| 4 | Crystal install reliability | Low | Consider Scoop prerequisite note |
| 5 | Windows CI workflow | Medium | Validate minimal/runtime tiers in GitHub Actions |
| 6 | Devcontainer parity | Medium | Provide Docker alternative for non-WSL users |

## 7. Next Planned Steps
1. Add Julia shim logic to `install-windows-deps.ps1` (if `julia` missing after install).
2. Implement `-Check` switch for dry-run environment validation.
3. Add documentation for restarting VS Code vs. new shell differences.
4. Optionally proceed to "full" tier install to attempt LSP matrices.

## 8. Verification Commands
Run after installation (new shell):
```
node -v
npm -v
tsc -v
python --version
ruby -v
"%LOCALAPPDATA%\Programs\Julia-1.11.6\bin\julia.exe" --version
R --version
```

## 9. Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-09-12 | Use winget tiers instead of Spack | Spack limited on Windows; simpler maintenance |
| 2025-09-12 | Add PowerShell scripts (no `just`) | Reduce dependency on Unix tooling |
| 2025-09-12 | Shim approach for Julia | Immediate usability without restart |

## 10. References
- `WINDOWS_SETUP.md`
- Original `flake.nix`
- `Vivafolio-E2E-Test-Status.md`

---
Update this file as each component transitions to ✅.
