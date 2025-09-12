param([Parameter(Mandatory=$true)][string]$Command)
# Simple Windows helper replacing Justfile recipes that were wrapped by nix-env.sh
# Usage examples:
#   pwsh -File scripts/win-dev.ps1 build
#   ./scripts/win-dev.ps1 test-runtime-all
#   ./scripts/win-dev.ps1 vscode-e2e

$ErrorActionPreference = 'Stop'

function Runtime-All {
  Write-Host 'Running runtime path programs (Python, Ruby, Julia, R, JavaScript)...'
  python test/runtime-path/python/two_blocks.py
  if ($LASTEXITCODE -ne 0) { throw 'Python runtime test failed' }
  ruby test/runtime-path/ruby/two_blocks.rb
  if ($LASTEXITCODE -ne 0) { throw 'Ruby runtime test failed' }
  julia test/runtime-path/julia/two_blocks.jl
  if ($LASTEXITCODE -ne 0) { throw 'Julia runtime test failed' }
  Rscript test/runtime-path/r/two_blocks.R
  if ($LASTEXITCODE -ne 0) { throw 'R runtime test failed' }
  node test/runtime-path/javascript/two_blocks.js
  if ($LASTEXITCODE -ne 0) { throw 'JavaScript runtime test failed' }
  Write-Host 'All runtime language demos executed.' -ForegroundColor Green
}

switch ($Command) {
  'build' { npm run --silent compile; break }
  'watch' { npm run --silent watch; break }
  'package' { npm run --silent package:vsix; break }
  'test-vscode' { 
      $env:VIVAFOLIO_DEBUG='1';
      $env:VIVAFOLIO_CAPTURE_WEBVIEW_LOGS='1';
      node test/run-vscode-tests.js; break }
  'test-runtime-all' { Runtime-All; break }
  'test-runtime-python' { python test/runtime-path/python/two_blocks.py; break }
  'test-runtime-ruby' { ruby test/runtime-path/ruby/two_blocks.rb; break }
  'test-runtime-julia' { julia test/runtime-path/julia/two_blocks.jl; break }
  'test-runtime-r' { Rscript test/runtime-path/r/two_blocks.R; break }
  'test-runtime-javascript' { node test/runtime-path/javascript/two_blocks.js; break }
  'vscode-e2e' {
      # Launch VS Code Insiders with both extensions if available
      $ws = Join-Path $PSScriptRoot '../test/projects/blocksync-test' | Resolve-Path
      $file = Join-Path $ws 'two_blocks.viv'
      code-insiders $ws $file --extensionDevelopmentPath $(Resolve-Path "$PSScriptRoot/../mock-language-extension") --extensionDevelopmentPath $(Resolve-Path "$PSScriptRoot/..") --enable-proposed-api local.vivafolio --disable-workspace-trust --new-window
      break }
  default { Write-Error "Unknown command '$Command'"; exit 1 }
}
