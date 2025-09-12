# Use our nix-env wrapper so all recipes run inside the vivafolio flake's dev shell
set shell := ["./scripts/nix-env.sh", "-c"]

# Add recipes below, for example:
# test:  # Run E2E connectivity tests
# 	node test/e2e-connectivity.js

# Launch VS Code for manual inspection of E2E setup (loads BOTH extensions)
vscode-e2e:
    # Open the blocksync test project with mock + production extensions (Insiders)
    bash ./scripts/vscode-e2e.sh

# Run VS Code extension test harness
test-vscode:
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 node test/run-vscode-tests.js | cat

# Run cross-language scenarios directly from vivafolio
test-scenario-basic-comms:
	node test/scenarios/basic-comms.js | cat

test-scenario-callsite-diagnostics:
	node test/scenarios/callsite-diagnostics.js | cat

test-e2e-blocksync:
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 npm run -s test:e2e:blocksync | cat

# Runtime Path Testing
test-runtime-python:
	python3 test/runtime-path/python/two_blocks.py

test-runtime-ruby:
	ruby test/runtime-path/ruby/two_blocks.rb

test-runtime-julia:
	julia test/runtime-path/julia/two_blocks.jl

test-runtime-r:
	cd test/runtime-path/r && Rscript two_blocks.R

test-runtime-javascript:
	node test/runtime-path/javascript/two_blocks.js

test-runtime-all: test-runtime-python test-runtime-ruby test-runtime-julia test-runtime-r test-runtime-javascript

# -----------------------------
# Build commands
# -----------------------------

# Build the Vivafolio TypeScript extension
build:
	npm run -s compile | cat

# Watch-build the Vivafolio TypeScript extension (incremental)
watch:
	npm run -s watch | cat

# Package the Vivafolio extension as a .vsix file
package:
	npm run -s package:vsix | cat

# Build extension and run basic compilation check
build-all:
	npm run -s compile | cat
	@echo "Build completed successfully"

# -----------------------------
# Test commands (continued)
# -----------------------------

# Run all test suites
test-all:
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 node test/run-all-tests.js

# -----------------------------
# Vendored language servers
# -----------------------------

# Build nimlangserver from vendored source (third_party/nimlangserver)
build-nimlangserver:
    cd third_party/nimlangserver && nimble build -y -d:debug --stackTrace:on --lineTrace:on --debuginfo --opt:none

# Run basic-comms with the vendored nimlangserver binary
test-nimlangserver-vendored: build-nimlangserver
	VIVAFOLIO_NIMLANGSERVER_BIN="$PWD/third_party/nimlangserver/bin/nimlangserver" node test/scenarios/basic-comms.js | cat

# Build zls from vendored source
build-zls:
	cd third_party/zls && zig build -Doptimize=ReleaseFast

# Run basic-comms with vendored zls
test-zls-vendored: build-zls
	VIVAFOLIO_ZLS_BIN="$PWD/third_party/zls/zig-out/bin/zls" node test/scenarios/basic-comms.js | cat

# Build crystalline from vendored source
build-crystalline:
	cd third_party/crystalline && shards build --release

# Run basic-comms with vendored crystalline
test-crystalline-vendored: build-crystalline
	VIVAFOLIO_CRYSTALLINE_BIN="$PWD/third_party/crystalline/bin/crystalline" node test/scenarios/basic-comms.js | cat

# Repro nimlangserver crash with core dump and backtrace
repro-nimlangserver-core: build-nimlangserver
	set -euo pipefail
	ulimit -c unlimited
	LOGDIR="$PWD/test/logs"; mkdir -p "$LOGDIR"
	VIVAFOLIO_NIMLANGSERVER_BIN="$PWD/third_party/nimlangserver/nimlangserver" node test/repro/nimlangserver-repro.js || true
	CORE="$(ls -t core.* 2>/dev/null | head -n 1 || true)"
	if [ -n "${CORE}" ]; then \
	  echo "Core dump: ${CORE}"; \
	  gdb -q -batch -ex 'set pagination off' -ex 'bt full' -ex 'quit' "$PWD/third_party/nimlangserver/nimlangserver" "${CORE}" > "$LOGDIR/nimlangserver-core-bt-$(date -u +%FT%TZ).log" || true; \
	else \
	  echo "No core file found (core dumps may be disabled)."; \
	fi

# Build nimlangserver using its flake (vendored) and run Basic Communications
build-nimlangserver-flake:
	nix build -L .#nimlangserver-vendored

test-nimlangserver-flake: build-nimlangserver-flake
	VIVAFOLIO_NIMLANGSERVER_BIN="$(readlink -f result/bin/nimlangserver)" node test/scenarios/basic-comms.js | cat

# Enter dev shell overriding the nix-nim-development input to a local checkout
dev-nim-packaging-local:
	@if [ ! -d third_party/nix-nim-development ]; then \
		echo "Missing third_party/nix-nim-development. Add the submodule first."; \
		exit 1; \
	fi
	nix develop . --override-input nix-nim-dev path:third_party/nix-nim-development
