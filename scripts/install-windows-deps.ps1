<#!
.SYNOPSIS
  Install Vivafolio development dependencies on Windows without Nix.
.DESCRIPTION
  Supports three tiers:
    minimal  - Node.js + TypeScript toolchain only
    runtime  - minimal + Python, Ruby, Julia, R (runtime path demos)
    full     - runtime + Nim, D, Rust, Zig, Crystal, Lean, ChromeDriver, VS Code Insiders
.PARAMETER Tier
  minimal | runtime | full (default: runtime)
.PARAMETER Force
  Reinstall even if commands already present.
.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File scripts/install-windows-deps.ps1 -Tier full
#>
param(
  [ValidateSet('minimal','runtime','full')][string]$Tier = 'runtime',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Test-Cmd($cmd) {
  $null = Get-Command $cmd -ErrorAction SilentlyContinue
  return $?
}

function Ensure-Step($name, [scriptblock]$install, [string]$checkCmd, [string]$versionArg = '--version') {
  if (-not $Force -and (Test-Cmd $checkCmd)) {
    Write-Host "[SKIP] $name already present: $checkCmd" -ForegroundColor Yellow
    return
  }
  Write-Host "[INSTALL] $name" -ForegroundColor Cyan
  & $install
  if (-not (Test-Cmd $checkCmd)) {
    # Some installers (Ruby, Rust) modify PATH asynchronously. Retry a few times.
    $retries = 5
    for ($i=1; $i -le $retries; $i++) {
      Start-Sleep -Seconds 2
      if (Test-Cmd $checkCmd) { break }
      if ($i -eq $retries) {
        throw "Installation of $name failed (command $checkCmd not found)"
      }
    }
  }
  try { & $checkCmd $versionArg | Select-Object -First 1 } catch { Write-Host "(version check failed, continuing)" -ForegroundColor DarkYellow }
}

function Winget-Install($id) {
  winget install -e --accept-package-agreements --accept-source-agreements $id
}

Write-Host "Vivafolio Windows dependency install (tier: $Tier)" -ForegroundColor Green
Write-Host "Use -Tier minimal | runtime | full" -ForegroundColor DarkGray

# --- Minimal Tier ---
Ensure-Step 'Node.js (LTS/22)' { Winget-Install 'OpenJS.NodeJS.LTS' } 'node'
Ensure-Step 'TypeScript (npm global)' { npm install -g typescript } 'tsc'
Ensure-Step 'vsce (extension packaging)' { npm install -g @vscode/vsce } 'vsce'

if ($Tier -in @('runtime','full')) {
  # Runtime languages
  Ensure-Step 'Python 3' { Winget-Install 'Python.Python.3.12' } 'python'
  if (-not (Test-Cmd 'ruby')) {
    Write-Host '[RUBY] Installing Ruby via winget (will retry PATH detection)...' -ForegroundColor Cyan
    try { Winget-Install 'RubyInstallerTeam.Ruby.3.3' } catch { Write-Host "[WARN] winget Ruby install error: $_" -ForegroundColor Yellow }
    # Search common install locations if still not on PATH
    if (-not (Test-Cmd 'ruby')) {
      $rubyCandidates = @(
        'C:\\Ruby33-x64\\bin',
        'C:\\Ruby32-x64\\bin',
        'C:\\Ruby31-x64\\bin',
        (Join-Path $env:ProgramFiles 'Ruby33-x64\\bin'),
        (Join-Path $env:ProgramFiles 'Ruby32-x64\\bin'),
        (Join-Path $env:ProgramFiles 'Ruby31-x64\\bin')
      ) | Where-Object { Test-Path $_ }
      foreach ($c in $rubyCandidates) {
        if (Test-Path (Join-Path $c 'ruby.exe')) {
          Write-Host "[RUBY] Found ruby.exe at $c; prepending to PATH for this session." -ForegroundColor Cyan
          $env:PATH = "$c;$env:PATH"
          break
        }
      }
    }
    if (Test-Cmd 'ruby') { ruby --version | Select-Object -First 1 } else { Write-Host '[WARN] Ruby not detected; open a NEW shell or add its bin directory to PATH manually (e.g. C:\Ruby33-x64\bin).' -ForegroundColor Yellow }
  }
  Write-Host '[JULIA] Attempting install (non-fatal)...' -ForegroundColor Cyan
  try {
    if (-not (Test-Cmd 'julia')) { Winget-Install 'Julialang.Julia' }
  } catch { Write-Host "[WARN] winget Julia install attempt failed: $_" -ForegroundColor Yellow }
  if (-not (Test-Cmd 'julia')) {
    # Try common local install path fallback
    $juliaDir = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs" -Directory -Filter 'Julia-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($juliaDir) {
      $juliaBin = Join-Path $juliaDir.FullName 'bin'
      if (Test-Path (Join-Path $juliaBin 'julia.exe')) {
        Write-Host "[JULIA] Found julia.exe at $juliaBin; adding to PATH for this session." -ForegroundColor Cyan
        if (-not ($env:PATH -split ';' | Where-Object { $_ -eq $juliaBin })) {
          $env:PATH = "$juliaBin;" + $env:PATH
        }
      }
    }
  }
  if (Test-Cmd 'julia') { julia --version | Select-Object -First 1 } else { Write-Host '[WARN] Julia still not available; continuing without it.' -ForegroundColor Yellow }
  Ensure-Step 'R' { Winget-Install 'RProject.R' } 'R'
}

if ($Tier -eq 'full') {
  # Extended toolchains
  Write-Host '[NIM] Attempting install (primary id nim.nim)...' -ForegroundColor Cyan
  if (-not (Test-Cmd 'nim')) {
    try { Winget-Install 'nim.nim' } catch { Write-Host "[WARN] nim.nim install attempt failed: $_" -ForegroundColor Yellow }
  }
  if (-not (Test-Cmd 'nim')) {
    Write-Host '[NIM] Fallback attempt (legacy id nim-lang.nim)...' -ForegroundColor DarkCyan
    try { Winget-Install 'nim-lang.nim' } catch { Write-Host "[WARN] nim-lang.nim fallback failed: $_" -ForegroundColor Yellow }
  }
  if (Test-Cmd 'nim') { nim --version | Select-Object -First 1 } else { Write-Host '[WARN] Nim not installed; continuing without Nim.' -ForegroundColor Yellow }
  Write-Host '[NIMLSP] Skipped automatic install (package name unresolved). See Windows-Dev-Env-Status.md for manual options.' -ForegroundColor DarkYellow
  Ensure-Step 'LDC (D compiler)' { Winget-Install 'LDC.LDC' } 'ldc2'
  Ensure-Step 'serve-d (D LSP)' { npm install -g serve-d } 'serve-d'
  Ensure-Step 'Rustup' { Winget-Install 'Rustlang.Rustup' } 'rustup'
  if (-not (Test-Cmd 'rustc') -or $Force) { rustup toolchain install stable }
  Ensure-Step 'Zig' { Winget-Install 'Zig.Zig' } 'zig'
  # zls manual step note
  if (-not (Test-Cmd 'zls')) { Write-Host '[INFO] zls not installed: download from https://github.com/zigtools/zls/releases and add to PATH' -ForegroundColor DarkYellow }
  # Crystal (prefer scoop if available)
  if (-not (Test-Cmd 'crystal')) {
    if (Test-Cmd 'scoop') {
      Write-Host '[SCOOP] Installing crystal' -ForegroundColor Cyan
      scoop install crystal
    } else {
      Write-Host '[INFO] Install Crystal manually or via Scoop (https://scoop.sh/) then re-run with -Force if needed.' -ForegroundColor DarkYellow
    }
  }
  if (Test-Cmd 'gem') { if (-not (Test-Cmd 'crystalline') -or $Force) { gem install crystalline }} else { Write-Host '[WARN] Ruby gem not available for crystalline yet' -ForegroundColor DarkYellow }
  # Lean via elan
  if (-not (Test-Cmd 'elan')) {
    Write-Host '[ELAN] Installing Lean toolchain manager' -ForegroundColor Cyan
    $elan = Join-Path $env:TEMP 'elan-init.ps1'
    Invoke-WebRequest https://raw.githubusercontent.com/leanprover/elan/master/elan-init.ps1 -OutFile $elan
    powershell -ExecutionPolicy Bypass -File $elan -y | Out-Null
  }
  if (-not (Test-Cmd 'lean')) { elan toolchain install leanprover/lean4:stable }
  # ChromeDriver (optional for WDIO chromedriver service)
  Ensure-Step 'ChromeDriver' { Winget-Install 'Chromium.ChromeDriver' } 'chromedriver'
  # VS Code Insiders (optional)
  if (-not (Test-Cmd 'code-insiders')) { Winget-Install 'Microsoft.VisualStudioCode.Insiders' }
}

Write-Host '--- SUMMARY ---' -ForegroundColor Green
$summary = @('node','tsc','vsce')
if ($Tier -in @('runtime','full')) { $summary += 'python','ruby','julia','R' }
if ($Tier -eq 'full') { $summary += 'nim','nimlsp','ldc2','serve-d','rustc','zig','crystal','lean' }
$summary | ForEach-Object {
  if (Test-Cmd $_) { Write-Host ("OK  " + $_) -ForegroundColor Green } else { Write-Host ("MISS " + $_) -ForegroundColor Red }
}

Write-Host "Done. Open new shells to ensure PATH updates are applied." -ForegroundColor Green
