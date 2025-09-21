#!/usr/bin/env bash
set -euo pipefail

# Launch VS Code Insiders with both the mock language extension and the Vivafolio extension
# Opens the vivafolioblock test workspace and the two_blocks.viv file to trigger diagnostics/insets

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
VIV="${SCRIPT_DIR%/scripts}"
WS="$VIV/test/projects/vivafolioblock-test"
EXT1="$VIV/mocklang-extension"
EXT2="$VIV"
FILE="$WS/two_blocks.mocklang"

# Fresh temporary profile by default, override with PERSIST_PROFILE=1
if [[ -n "${PERSIST_PROFILE:-}" ]]; then
  USER_DATA_DIR="$VIV/.vscode-dev/user-data"
  EXTENSIONS_DIR="$VIV/.vscode-dev/extensions"
  mkdir -p "$USER_DATA_DIR" "$EXTENSIONS_DIR"
  echo "Launching VS Code with persistent profile:" >&2
  echo "  user-data-dir: $USER_DATA_DIR" >&2
  echo "  extensions-dir: $EXTENSIONS_DIR" >&2
else
  USER_DATA_DIR="$(mktemp -d -t vivafolio-vscode-user-XXXXXX)"
  EXTENSIONS_DIR="$(mktemp -d -t vivafolio-vscode-ext-XXXXXX)"
  echo "Launching VS Code with fresh profile:" >&2
  echo "  user-data-dir: $USER_DATA_DIR" >&2
  echo "  extensions-dir: $EXTENSIONS_DIR" >&2
fi

echo "Building mock language extension..." >&2
(
  cd "$EXT1"
  if [[ ! -d node_modules ]]; then npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1; fi
  npm run -s compile
) || { echo "Failed to build mock language extension" >&2; exit 1; }

echo "Building Vivafolio extension..." >&2
(
  cd "$EXT2"
  # node_modules for root was already installed during earlier steps, but ensure compile
  npm run -s compile
) || { echo "Failed to build Vivafolio extension" >&2; exit 1; }

# If running headless on Linux, spin up a virtual display so VS Code can render
if [[ "$(uname -s)" == "Linux" && -z "${DISPLAY:-}" && -x "$(command -v Xvfb || true)" ]]; then
  echo "Starting Xvfb on :99 for headless run" >&2
  Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
  export DISPLAY=:99
fi

exec code-insiders "$WS" \
  --extensionDevelopmentPath="$EXT1" \
  --extensionDevelopmentPath="$EXT2" \
  --enable-proposed-api local.vivafolio \
  --disable-workspace-trust \
  --inspect-extensions=9229 \
  --user-data-dir "$USER_DATA_DIR" \
  --extensions-dir "$EXTENSIONS_DIR" \
  --new-window \
  "$FILE" "$@"

