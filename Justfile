# Use our nix-env wrapper so all recipes run inside the vivafolio flake's dev shell
set shell := ["./scripts/nix-env.sh", "-c"]

# Add recipes below, for example:
# test:  # Run E2E connectivity tests
# 	node test/e2e-connectivity.js

# Launch VS Code for manual inspection of E2E setup (loads BOTH extensions)
vscode-e2e:
    # Open the vivafolioblock test project with mock + production extensions (Insiders)
    bash ./scripts/vscode-e2e.sh

# Run VS Code extension test harness
test-vscode:
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 node test/run-vscode-tests.js | cat

# Run cross-language scenarios directly from vivafolio
test-scenario-basic-comms:
	node test/scenarios/basic-comms.js | cat

test-scenario-callsite-diagnostics:
	node test/scenarios/callsite-diagnostics.js | cat

test-e2e-vivafolioblock:
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 npm run -s test:e2e:vivafolioblock | cat

test-e2e-vivafolioblock-headed:
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 npm run -s test:e2e:vivafolioblock:headed | cat

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

test-runtime-vivafolioblock:
	npm run -s test:runtime:vivafolioblock | cat

# -----------------------------
# Block Protocol POC Tests
# Based on documented test suites in docs/BlockProtocol-E2E-POC.md
# All tests are headless and automated per AGENTS.md guidelines
# -----------------------------
#
# Test Coverage Summary:
# - test-blockprotocol-core: Block Protocol integration scenarios (hello-block.spec.ts)
# - test-blockprotocol-frameworks: Framework compilation & cross-framework (framework-compilation.spec.ts)
# - test-blockprotocol-scaffold: Block scaffolding & generation (scaffold.spec.ts)
# - test-blockprotocol-standalone: Standalone server & CLI (standalone-server.spec.ts)
# - test-blockprotocol-assets: Static asset loading (static-assets.spec.ts)
# - test-blockprotocol-devserver: Dev server smoke tests (tests-node/dev-server-smoke.test.ts)
# - test-blockprotocol-standalone-build: Standalone server build & distribution testing
#
# Use test-blockprotocol-all to run all suites individually
# Use test-blockprotocol-poc to run all tests via npm test
#
# -----------------------------

# Run all Block Protocol POC tests (via npm test)
test-blockprotocol-poc:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npm test | cat

# Run core Block Protocol integration tests (hello-block scenarios)
test-blockprotocol-core:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test tests/hello-block.spec.ts | cat

# Run framework compilation tests (hot-reload, bundling, cross-framework scenarios)
test-blockprotocol-frameworks:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test tests/framework-compilation.spec.ts | cat

# Run block scaffolding tests (block generation, naming conventions, error handling)
test-blockprotocol-scaffold:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test tests/scaffold.spec.ts | cat

# Run standalone server tests (server startup, framework bundles, CLI, isolation)
test-blockprotocol-standalone:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test tests/standalone-server.spec.ts | cat

# Run static assets tests (resource loading parity)
test-blockprotocol-assets:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test tests/static-assets.spec.ts | cat

# Run dev server smoke tests (programmatic server launch validation)
test-blockprotocol-devserver:
	cd apps/blockprotocol-poc && \
	  npm run test:devserver | cat

# Run all Block Protocol POC test suites individually
test-blockprotocol-all: test-blockprotocol-core test-blockprotocol-frameworks test-blockprotocol-scaffold test-blockprotocol-standalone test-blockprotocol-assets test-blockprotocol-devserver test-blockprotocol-standalone-build

# Run Block Protocol tests in headed mode (for debugging)
test-blockprotocol-headed:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test --headed | cat

# Run specific Block Protocol test pattern (e.g., just test-blockprotocol-grep "framework")
test-blockprotocol-grep PATTERN:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test --grep "{{PATTERN}}" | cat

# Run Block Protocol tests with debug output
test-blockprotocol-debug:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  DEBUG=pw:api npx playwright test | cat

# Generate Block Protocol test report
test-blockprotocol-report:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test --reporter=html | cat && \
	  echo "Report generated in apps/blockprotocol-poc/playwright-report/index.html"

# Build and test standalone server distribution
test-blockprotocol-standalone-build:
	cd apps/blockprotocol-poc && \
	  echo "Building standalone server..." && \
	  npm run build:standalone && \
	  echo "Testing standalone server functionality..." && \
	  timeout 10s node dist/standalone-server.js --port 3020 --no-hot-reload & \
	  sleep 3 && \
	  curl -s http://localhost:3020/healthz | jq .ok | grep -q true && \
	  echo "✅ Standalone server build and startup test passed" || echo "❌ Test failed"

# -----------------------------
# Block Protocol POC Demo Commands
# Based on documented scripts in apps/blockprotocol-poc/package.json
# -----------------------------

# Launch Block Protocol POC dev server (basic mode)
dev-blockprotocol-poc:
	cd apps/blockprotocol-poc && \
		node ../../scripts/guarded-run.js \
			--name blockprotocol-poc-dev \
			--pid-file .pids/dev.pid \
			--cwd . \
			--match "apps/blockprotocol-poc/src/server.ts" \
			--match "apps/blockprotocol-poc/dist/server/server.js" \
			-- npm run dev

# Launch Block Protocol POC dev server once (with timeout, for testing)
dev-blockprotocol-poc-once:
	cd apps/blockprotocol-poc && \
		PORT="${PORT:-0}" node ../../scripts/guarded-run.js \
			--name blockprotocol-poc-dev-once \
			--pid-file .pids/dev-once.pid \
			--cwd . \
			--match "apps/blockprotocol-poc/src/server.ts" \
			-- npm run dev:once

# Launch Block Protocol POC dev server with framework watching
dev-blockprotocol-poc-frameworks:
	cd apps/blockprotocol-poc && \
		node ../../scripts/guarded-run.js \
			--name blockprotocol-poc-frameworks \
			--pid-file .pids/dev-frameworks.pid \
			--cwd . \
			--match "ENABLE_FRAMEWORK_WATCH=true" \
			--match "apps/blockprotocol-poc/src/server.ts" \
			-- npm run dev:frameworks

# Launch Block Protocol POC dev server with frameworks once (with timeout)
dev-blockprotocol-poc-frameworks-once:
	cd apps/blockprotocol-poc && \
		PORT="${PORT:-0}" node ../../scripts/guarded-run.js \
			--name blockprotocol-poc-frameworks-once \
			--pid-file .pids/dev-frameworks-once.pid \
			--cwd . \
			--match "apps/blockprotocol-poc/src/server.ts" \
			--match "ENABLE_FRAMEWORK_WATCH=true" \
			-- npm run dev:once-frameworks

# Launch Block Protocol POC production server
start-blockprotocol-poc:
	cd apps/blockprotocol-poc && \
	  npm run start

# Launch Block Protocol POC standalone server
start-blockprotocol-poc-standalone:
	cd apps/blockprotocol-poc && \
	  npm run start:standalone

# -----------------------------
# Install commands
# -----------------------------

# Install dependencies in all relevant directories
install-all:
	@echo "Installing dependencies in root directory..."
	npm install
	@echo "Installing dependencies in Block Protocol POC..."
	cd apps/blockprotocol-poc && npm install
	@echo "Installing dependencies in block-loader package..."
	cd packages/block-loader && npm install && npm run build
	@echo "Installing dependencies in mock language extension..."
	cd mock-language-extension && npm install
	@echo "All dependencies installed and packages built successfully"

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
