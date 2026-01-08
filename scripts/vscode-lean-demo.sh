#!/usr/bin/env bash
set -euo pipefail

# Launch VS Code Insiders with the Vivafolio extension against the Lean DSL sample.
# Opens PickerDemo.lean so Lean diagnostics drive real Vivafolio webviews.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
VIV="${SCRIPT_DIR%/scripts}"
WORKSPACE="$VIV/test/projects/lean-dsl"
EXTENSION="$VIV"
LEAN_FILE="$WORKSPACE/LeanDsl/PickerDemo.lean"

if ! command -v code-insiders >/dev/null 2>&1; then
  echo "code-insiders not found in PATH. Please install VS Code Insiders or expose it inside the dev shell." >&2
  exit 1
fi

echo "[Lean demo] Building Lean DSL sample via lake..." >&2
(
  cd "$WORKSPACE"
  lake build LeanDsl LeanDsl.PickerDemo >/dev/null
) || {
  echo "[Lean demo] Failed to build Lean DSL sample" >&2
  exit 1
}

echo "[Lean demo] Building Vivafolio extension..." >&2
(
  cd "$EXTENSION"
  npm run -s compile
) || {
  echo "[Lean demo] Failed to build Vivafolio extension" >&2
  exit 1
}

# Persistent profile by default so the Lean4 extension stays installed between runs.
if [[ -n "${LEAN_DEMO_FRESH:-}" ]]; then
  USER_DATA_DIR="$(mktemp -d -t vivafolio-lean-user-XXXXXX)"
  EXTENSIONS_DIR="$(mktemp -d -t vivafolio-lean-ext-XXXXXX)"
  echo "[Lean demo] Launching VS Code with fresh profile (LEAN_DEMO_FRESH=1)" >&2
else
  USER_DATA_DIR="$VIV/.vscode-lean-demo/user-data"
  EXTENSIONS_DIR="$VIV/.vscode-lean-demo/extensions"
  mkdir -p "$USER_DATA_DIR" "$EXTENSIONS_DIR"
  echo "[Lean demo] Launching VS Code with persistent profile at $USER_DATA_DIR" >&2
fi

# Start Xvfb automatically when running headless on Linux
if [[ "$(uname -s)" == "Linux" && -z "${DISPLAY:-}" && -x "$(command -v Xvfb || true)" ]]; then
  echo "[Lean demo] Starting Xvfb on :99 for headless run" >&2
  Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
  export DISPLAY=:99
fi

# Ensure Lean 4 VS Code extension is installed in this profile so diagnostics work
echo "[Lean demo] Ensuring Lean4 extension is installed..." >&2
code-insiders --install-extension leanprover.lean4 \
  --user-data-dir "$USER_DATA_DIR" \
  --extensions-dir "$EXTENSIONS_DIR" >/dev/null 2>&1 || true

exec code-insiders "$WORKSPACE" \
  --extensionDevelopmentPath="$EXTENSION" \
  --enable-proposed-api local.vivafolio \
  --disable-workspace-trust \
  --user-data-dir "$USER_DATA_DIR" \
  --extensions-dir "$EXTENSIONS_DIR" \
  --new-window \
  "$LEAN_FILE" "$@"
