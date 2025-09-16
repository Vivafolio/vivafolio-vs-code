# Vivafolio Windows Setup (No Nix)

This guide helps you reproduce the Nix devShell on a native Windows system (PowerShell) without Nix or direnv.

> NEW: Run `scripts/install-windows-deps.ps1` to automate installs. Example:
> ```powershell
> pwsh -ExecutionPolicy Bypass -File scripts/install-windows-deps.ps1 -Tier runtime
> ```
> Tiers: minimal | runtime | full (see below)

## 1. Summary
The original `flake.nix` provided these toolchains:
- Node.js 22 + TypeScript
- Lean 4 (lake)
- Nim + nimlsp + nimlangserver (overlay variant `metacraft-labs.langserver`)
- D toolchain: ldc2, dub, serve-d
- Rust: rustc, cargo, rust-analyzer
- Zig: zig, zls
- Crystal: crystal, crystalline
- Python 3 + pip
- Ruby + bundler
- Julia
- R (+ devtools)
- ChromeDriver + Selenium standalone (for WebdriverIO / Playwright tests use bundled browsers)
- VS Code Insiders (manual testing only)

You likely only need a subset depending on which tests you run.

## 2. Recommended Approach
Pick one path:
1. Fastest (minimal): Install Node.js 22 LTS (or latest 22.x) + Playwright deps → build + runtime tests for JavaScript-only.
2. Extended Runtime Path: Add Python, Ruby, Julia, R to run `test:runtime:vivafolioblock`.
3. Full LSP Matrix: Also install Nim, D, Rust, Zig, Crystal toolchains + their language servers.
4. Alternative: Use WSL2 Ubuntu and run the original Nix flake there (closest parity).

## 3. Package Managers
Use one package manager consistently to avoid PATH conflicts.
- Winget (built-in) – simplest
- Scoop (nice for dev tools in user space)
- Chocolatey (admin typically required)

Below tables list suggested sources.

## 4. Automated Install Script
Use the helper script (idempotent):
```powershell
# Runtime tier (default)
pwsh -ExecutionPolicy Bypass -File scripts/install-windows-deps.ps1

# Minimal tier
pwsh -ExecutionPolicy Bypass -File scripts/install-windows-deps.ps1 -Tier minimal

# Full matrix (includes Nim, D, Rust, Zig, Crystal, Lean)
pwsh -ExecutionPolicy Bypass -File scripts/install-windows-deps.ps1 -Tier full

# Force reinstallation
pwsh -ExecutionPolicy Bypass -File scripts/install-windows-deps.ps1 -Tier full -Force
```
Manual winget commands remain below for transparency.

## 5. Manual Install Commands (Winget Examples)
Run PowerShell as Administrator for system-wide installs when needed. Each line is independent.

```powershell
# Core
winget install -e OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
npm install -g typescript vsce

# Python / Ruby / Julia / R
winget install -e Python.Python.3.12
winget install -e RubyInstallerTeam.Ruby.3.3
winget install -e JuliaComputing.Julia
winget install -e RProject.R

# Nim (installer) + nimlsp (npm) + nimlangserver (go build optional)
winget install -e nim-lang.nim
npm install -g nimlsp
# nimlangserver: prebuilt may not exist for Windows overlay; skip unless required

# D toolchain (LDC) + serve-d
winget install -e LDC.LDC
npm install -g serve-d

# Rust (rustup)
winget install -e Rustlang.Rustup
rustup toolchain install stable

# Zig
winget install -e Zig.Zig

# Crystal (via scoop recommended; winget lacks official at times)
# scoop install crystal

# zls (Zig Language Server) - prebuilt binary
# Download from https://github.com/zigtools/zls/releases and add folder to PATH

# crystalline (Crystal LSP)
gem install crystalline  # after Ruby installed

# Ruby bundler (normally already)
gem install bundler

# R devtools inside R (run in R console)
# install.packages('devtools')

# ChromeDriver (Playwright usually bundles browsers; chromedriver only if using wdio chromedriver service directly)
winget install -e Chromium.Chromedriver

# VS Code Insiders (optional)
winget install -e Microsoft.VisualStudioCode.Insiders
```

## 6. Environment Variables / PATH Checks
After installation, open a new PowerShell and verify:
```powershell
node -v
ts-node -v  # if you add ts-node (optional)
tsc -v
python --version
ruby -v
julia --version
R --version
nim --version
ldc2 --version
rustc --version
zig version
```

If a tool is missing, ensure its install directory is in PATH. For scoop installs: `$env:USERPROFILE\scoop\shims`.

## 7. Installing Language Servers
| Language | Server | Install Method |
|----------|--------|----------------|
| Nim | nimlsp | `npm i -g nimlsp` |
| Nim | nimlangserver | Build from source (optional) |
| D | serve-d | `npm i -g serve-d` |
| Rust | rust-analyzer | `rustup component add rust-analyzer` or separate binary |
| Zig | zls | Download release binary |
| Crystal | crystalline | `gem install crystalline` |
| Lean | lake / lean | Install via elan (recommended) |

Lean (elan):
```powershell
# Install elan (Lean version manager)
Invoke-WebRequest https://raw.githubusercontent.com/leanprover/elan/master/elan-init.ps1 -OutFile elan-init.ps1
powershell -ExecutionPolicy Bypass -File .\elan-init.ps1 -y
elan toolchain install leanprover/lean4:stable
```
Add `%USERPROFILE%\.elan\bin` to PATH if not auto-added.

## 8. Optional: WSL2 + Nix (Closest Parity)
1. Enable WSL and install Ubuntu.
2. Inside WSL: install Nix, enable flakes, clone repo, run `nix develop`.
3. Use VS Code Remote - WSL extension.
This avoids per-language Windows installers.

## 9. Optional: Dev Container
Create a `.devcontainer/` with a Dockerfile that mirrors `flake.nix` packages using apt + manual installs. (Not included yet.)

## 10. Replacing `just` + `nix-env.sh`
`Justfile` recipes wrap plain npm/node commands. On Windows you can:
- Run underlying npm scripts directly: `npm run compile`, `node test/run-all-tests.js`.
- Or use `scripts/win-dev.ps1`.

## 11. PowerShell Helper Script
`scripts/win-dev.ps1` (already added) proxies commands:
```powershell
./scripts/win-dev.ps1 build
./scripts/win-dev.ps1 test-runtime-all
./scripts/win-dev.ps1 vscode-e2e
```

## 12. Running Playwright / WDIO Tests
Install deps then:
```powershell
npm install
npx playwright install  # Ensures browsers downloaded
just test-e2e-vivafolioblock
```
For WDIO with chromedriver you may need matching Chrome + chromedriver versions.

## 13. Known Windows Differences
- Line endings: Ensure git checks out with `core.autocrlf=input` to avoid test diffs.
- Some language servers (zls, crystalline) may have different Windows behavior; logs helpful.
- Julia/R might require adding their bin directories explicitly to PATH.
- Nim overlay `metacraft-labs.langserver` is Nix-only; skip if non-essential.

## 14. Minimum Subset (If You Only Need Runtime Path Demo)
```powershell
winget install -e OpenJS.NodeJS.LTS
winget install -e Python.Python.3.12
winget install -e RubyInstallerTeam.Ruby.3.3
winget install -e JuliaComputing.Julia
winget install -e RProject.R
npm install
npm run compile
# Then open a supported file and press Ctrl+Shift+R
```

## 15. Troubleshooting
| Issue | Fix |
|-------|-----|
| `node-gyp` build failures | Install VS Build Tools with C++ workload |
| Playwright browsers missing | `npx playwright install` |
| R package install blocked | Run PowerShell as Admin or set R library path writable |
| Python not found in VS Code | Set `python.defaultInterpreterPath` in settings |
| Lean tooling missing | Install elan; reopen terminal |

## 16. Spack vs Nix on Windows
Spack has limited native Windows support (POSIX assumptions, focuses on HPC compilers). For this project (multiple language ecosystems, editors, language servers), Spack is not a good replacement on Windows. Prefer one of:
- WSL2 + Nix (highest fidelity)
- Devcontainer (Docker) for reproducibility
- Winget/Scoop + lightweight scripts (current approach)
- `mise` (formerly asdf-vm style) for per-tool version management (optional)

## 17. Next Steps (Optional Enhancements)
- Add CI Windows workflow using the `minimal` or `runtime` tier
- Add automated verification script (`--check` mode) to assert versions
- Provide a `.devcontainer` folder for consistency across platforms
- Evaluate adding zls + crystal binary fetch automation

---
This document aims to keep parity with `flake.nix`. Update when tool versions change.
