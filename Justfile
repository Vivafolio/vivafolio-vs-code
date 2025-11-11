# Use our nix-env wrapper so all recipes run inside the vivafolio flake's dev shell
set shell := ["./scripts/nix-env.sh", "-c"]

# -----------------------------
# Setup commands
# -----------------------------

# Install all dependencies, build Vivafolio TypeScript extension and all framework packages
build-all:
	@echo "Initializing git submodules..."
	git submodule update --init --recursive

	just install-all

	@echo "Building indexing service package..."
	-cd packages/indexing-service && npm run build && echo "✅ Indexing service built successfully" || echo "❌ Indexing service build failed"
	@echo "Building block resources cache package..."
	-cd packages/block-resources-cache && npm run build && echo "✅ Block resources cache built successfully" || echo "❌ Block resources cache build failed"
	@echo "Building block core package..."
	-cd packages/block-core && npm run build && echo "✅ Block core built successfully" || echo "❌ Block core build failed"
	@echo "Building block loader package..."
	-cd packages/block-loader && npm run build && echo "✅ Block loader built successfully" || echo "❌ Block loader build failed"

	@echo "Building SolidJS framework package..."
	-cd packages/block-frameworks/solidjs && npm run build && echo "✅ SolidJS built successfully" || echo "❌ SolidJS build failed"
	@echo "Building Vue framework package..."
	-cd packages/block-frameworks/vue && npm run build && echo "✅ Vue built successfully" || echo "❌ Vue build failed"
	@echo "Building Svelte framework package..."
	-cd packages/block-frameworks/svelte && npm run build && echo "✅ Svelte built successfully" || echo "❌ Svelte build failed"
	@echo "Building Lit framework package..."
	-cd packages/block-frameworks/lit && npm run build && echo "✅ Lit built successfully" || echo "❌ Lit build failed"
	@echo "Building Angular framework package..."
	-cd packages/block-frameworks/angular && npm run build && echo "✅ Angular built successfully" || echo "❌ Angular build failed"

	@echo "Building blocks package..."
	just build-blocks

	@echo "Building main Vivafolio extension..."
	npm run -s compile | cat

	@echo "Build process completed (check individual results above)"


# -----------------------------
# Install commands (They are meant to be used internally and not by the user directly)
# -----------------------------

# Install dependencies in all relevant directories
install-all:
	@echo "Installing dependencies in root directory..."
	npm install
	@echo "Installing dependencies in Block Protocol POC..."
	cd apps/blockprotocol-poc && npm install
	@echo "Installing dependencies in block-loader package..."
	cd packages/block-loader && npm install
	@echo "Installing dependencies in block-resources-cache package..."
	cd packages/block-resources-cache && npm install
	@echo "Installing dependencies in indexing-service package..."
	cd packages/indexing-service && npm install
	@echo "Installing dependencies in mock language extension..."
	cd mocklang-extension && npm install
	@echo "Installing dependencies in blocks package..."
	cd blocks && npm install
	@echo "Checking framework packages..."
	@echo "Checking Angular framework..."
	@if [ ! -d "packages/block-frameworks/angular/node_modules" ]; then \
		echo "Installing Angular framework dependencies..."; \
		cd packages/block-frameworks/angular && npm install; \
	else \
		echo "Angular framework dependencies already installed"; \
	fi
	@echo "Checking Lit framework..."
	@if [ ! -d "packages/block-frameworks/lit/node_modules" ]; then \
		echo "Installing Lit framework dependencies..."; \
		cd packages/block-frameworks/lit && npm install; \
	else \
		echo "Lit framework dependencies already installed"; \
	fi
	@echo "Checking SolidJS framework..."
	@if [ ! -d "packages/block-frameworks/solidjs/node_modules" ]; then \
		echo "Installing SolidJS framework dependencies..."; \
		cd packages/block-frameworks/solidjs && npm install; \
	else \
		echo "SolidJS framework dependencies already installed"; \
	fi
	@echo "Checking Svelte framework..."
	@if [ ! -d "packages/block-frameworks/svelte/node_modules" ]; then \
		echo "Installing Svelte framework dependencies..."; \
		cd packages/block-frameworks/svelte && npm install; \
	else \
		echo "Svelte framework dependencies already installed"; \
	fi
	@echo "Checking Vue framework..."
	@if [ ! -d "packages/block-frameworks/vue/node_modules" ]; then \
		echo "Installing Vue framework dependencies..."; \
		cd packages/block-frameworks/vue && npm install; \
	else \
		echo "Vue framework dependencies already installed"; \
	fi
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


# -----------------------------
# Test commands (continued)
# -----------------------------

# Run all test suites
test-all:
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 node test/run-all-tests.js

# Run block-resources-cache package tests
test-block-resources-cache:
	cd packages/block-resources-cache && npm test | cat

# Run block-resources-cache package tests in watch mode
test-block-resources-cache-watch:
	cd packages/block-resources-cache && npm run test:watch

# Run block-loader package tests
test-block-loader:
	cd packages/block-loader && npm test | cat

# Run block-loader package tests with hooks coverage
test-block-loader-hooks:
	cd packages/block-loader && npm test -- --testPathPattern="hooks.test.ts" | cat

# Run indexing-service package tests
test-indexing-service:
	cd packages/indexing-service && npm test | cat

# Run all package tests
test-packages: test-block-resources-cache test-block-loader test-block-loader-hooks test-indexing-service

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

test-e2e-blockprotocol-integration:
	node test/e2e-blockprotocol-integration.js | cat

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
# - test-blockprotocol-hooks: Hook mechanism & nested blocks (block-loader hooks tests)
# - test-blockprotocol-standalone-build: Standalone server build & distribution testing
#
# Use test-blockprotocol-all to run all suites individually
# Use test-blockprotocol-poc to run all tests via npm test
#
# -----------------------------

# Run all Block Protocol POC tests - all tests in apps/blockprotocol-poc/tests (via npm test)
test-blockprotocol-poc:
	# Ensure latest block-loader is built so POC uses correct HTML template handling
	cd packages/block-loader && npm run -s build | cat
	# Clear any stale Vite optimized deps to avoid using outdated loader bundle
	rm -rf apps/blockprotocol-poc/node_modules/.vite || true
	# Run POC frameworks build and tests
	cd apps/blockprotocol-poc && \
	  npm run build:frameworks && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npm test | cat

# Run all Block Protocol POC test suites individually
#11.11.2025 - PASS
test-blockprotocol-all: test-blockprotocol-core test-blockprotocol-frameworks test-blockprotocol-scaffold test-blockprotocol-standalone test-blockprotocol-assets test-blockprotocol-devserver test-blockprotocol-hooks test-blockprotocol-standalone-build

test-blockprotocol-local:
	cd apps/blockprotocol-poc && \
	  npm run build:frameworks && \
	  rm -rf test-blocks && \
	  PORT=4174 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  TEST_LOCAL_BLOCKS=1 npm test -- --grep="local block development workflow" | cat

# Run core Block Protocol integration tests (hello-block scenarios)
# Test fixed and passes on 11.11.2025. Set in production mode to avoid Vite/HMR reloads during tests.
test-blockprotocol-core:
	cd apps/blockprotocol-poc && \
	  TEST_E2E_PROD=1 \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test tests/hello-block.spec.ts | cat

# Run framework compilation tests (hot-reload, bundling, cross-framework scenarios)
# PASS ON 11.11.2025
test-blockprotocol-frameworks:
		cd apps/blockprotocol-poc && \
			PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
			npx playwright test tests/framework-compilation.spec.ts | cat

# Run block scaffolding tests (block generation, naming conventions, error handling)
# PASS ON 11.11.2025
test-blockprotocol-scaffold:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  npx playwright test tests/scaffold.spec.ts | cat

# Run standalone server tests (server startup, framework bundles, CLI, isolation)
#11.11.2025 - PASS
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
#10.11.2025 - PASS
test-blockprotocol-devserver:
	cd apps/blockprotocol-poc && \
	  npm run test:devserver | cat

# Run hook mechanism tests (mini-host, React hooks, nested blocks)
#11.11.2025 - PASS
# Triggers warning though, that makes me think something is not fully right:
#  console.warn
#    useGraphContext: No graph context available. Make sure this component is rendered within a block.

test-blockprotocol-hooks: test-block-loader-hooks


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

# Run specific Block Protocol test pattern with browser console captured
test-blockprotocol-grep-console PATTERN:
	cd apps/blockprotocol-poc && \
	  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-$(command -v chromium)}" \
	  DEBUG=pw:browser npx playwright test --grep "{{PATTERN}}" 2>&1 | cat

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
# LSP Server Testing
# -----------------------------

# Test mock LSP server functions directly (no LSP protocol)
#11.11.2025 - PASS
test-lsp-direct:
	node test/direct-test.js

# Test mock LSP server through full LSP protocol
test-lsp-protocol:
	npm run test:e2e:mock-lsp-client

# Test LSP syntax error reporting
test-lsp-syntax-errors:
	npm run test:e2e:lsp-syntax-error

# Run all standalone LSP server tests
#11.11.2025 - PASS
test-lsp-standalone: test-lsp-direct test-lsp-protocol test-lsp-syntax-errors

# -----------------------------
# WDIO VS Code Integration Tests
# -----------------------------

# Run WDIO tests for VS Code integration

test-wdio-all: test-wdio test-wdio-single-block test-wdio-two-blocks test-wdio-synchronization

#FAILS. Commit on 11.11.2025 tried to fix it. Current status is documented in docs/Vivafolio-E2E-Test-Status.md (### NixOS-specific: Chromedriver v138 fails to execute (stub-ld) 🐧)

test-wdio:
	npm run test:wdio

# Test single block creation and interaction
test-wdio-single-block:
	npm run test:wdio:single-block

# Test two blocks interaction
test-wdio-two-blocks:
	npm run test:wdio:two-blocks

# Test two blocks synchronization
test-wdio-synchronization:
	npm run test:wdio:synchronization

# -----------------------------
# Block Development Commands
# -----------------------------

# Build mock language extension if needed
install-mocklang-extension:
	@echo "Building mock language extension..."
	@cd mocklang-extension && npm install >/dev/null 2>&1 && npm run compile >/dev/null 2>&1
	@echo "Mock language extension ready"

# Launch VS Code in development mode with extension
vscode-dev: install-mocklang-extension
	VIVAFOLIO_DEBUG=1 code-insiders \
		--extensionDevelopmentPath="${PWD}/mocklang-extension" \
		--extensionDevelopmentPath="${PWD}" \
		--enable-proposed-api local.vivafolio \
		--disable-workspace-trust \
		--new-window \
		"${PWD}/test/projects/vivafolio-data-examples"

# Launch VS Code with debugging enabled
vscode-debug: install-mocklang-extension
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 code-insiders \
		--extensionDevelopmentPath="${PWD}/mocklang-extension" \
		--extensionDevelopmentPath="${PWD}" \
		--enable-proposed-api local.vivafolio \
		--disable-workspace-trust \
		--inspect-extensions=9229 \
		--new-window \
		"${PWD}/test/projects/vivafolio-data-examples"

# Launch VS Code with clean state (no user data)
vscode-clean: install-mocklang-extension
	VIVAFOLIO_DEBUG=1 code-insiders \
		--extensionDevelopmentPath="${PWD}/mocklang-extension" \
		--extensionDevelopmentPath="${PWD}" \
		--enable-proposed-api local.vivafolio \
		--disable-workspace-trust \
		--user-data-dir /tmp/vscode-clean \
		--extensions-dir /tmp/vscode-clean-ext \
		--new-window \
		"${PWD}/test/projects/vivafolio-data-examples"

# Full development environment: VS Code + extension watching + block watching
vscode-dev-full: install-mocklang-extension
	@echo "Starting full development environment..."
	@echo "1. Starting extension file watcher..."
	@npm run watch > /dev/null 2>&1 &
	@echo "2. Starting block file watcher..."
	@just watch-blocks > /dev/null 2>&1 &
	@sleep 2
	@echo "3. Launching VS Code..."
	@VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 code-insiders \
		--extensionDevelopmentPath="${PWD}/mocklang-extension" \
		--extensionDevelopmentPath="${PWD}" \
		--enable-proposed-api local.vivafolio \
		--disable-workspace-trust \
		--new-window \
		"${PWD}/test/projects/vivafolio-data-examples"

# Launch VS Code with full logging enabled
vscode-dev-logged: install-mocklang-extension
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 VIVAFOLIO_LOG_TO_FILE=1 code-insiders \
		--extensionDevelopmentPath="${PWD}/mocklang-extension" \
		--extensionDevelopmentPath="${PWD}" \
		--enable-proposed-api local.vivafolio \
		--disable-workspace-trust \
		--new-window \
		"${PWD}/test/projects/vivafolio-data-examples"

# Launch VS Code with trace logging
vscode-dev-trace: install-mocklang-extension
	VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 code-insiders \
		--extensionDevelopmentPath="${PWD}/mocklang-extension" \
		--extensionDevelopmentPath="${PWD}" \
		--enable-proposed-api local.vivafolio \
		--disable-workspace-trust \
		--log-file /tmp/vscode-trace.log \
		--log vscode \
		--log-extension-host \
		--verbose \
		--new-window \
		"${PWD}/test/projects/vivafolio-data-examples"

# -----------------------------
# Block Development Commands
# -----------------------------

# Build all blocks
build-blocks:
	cd blocks && npm run build

# Watch blocks and rebuild automatically (uses block dev-server with hot reload)
watch-blocks:
	@echo "Starting block development server with file watching and hot reload..."
	@cd blocks && npm run dev-server

# Clean all block builds
clean-blocks:
	cd blocks && npm run clean

# Build blocks for production
build-blocks-production:
	cd blocks && npm run build:all

# Start block development server with hot reload
block-dev-server:
	@echo "Starting block development server with hot reload..."
	@cd blocks && npm run dev-server

# Launch VS Code with block dev server
vscode-with-server: install-mocklang-extension
	@echo "Starting block dev server and VS Code..."
	@just block-dev-server &
	@sleep 3
	@VIVAFOLIO_DEBUG=1 BLOCK_DEV_SERVER_PORT=3001 code-insiders \
		--extensionDevelopmentPath="${PWD}/mocklang-extension" \
		--extensionDevelopmentPath="${PWD}" \
		--enable-proposed-api local.vivafolio \
		--disable-workspace-trust \
		--new-window \
		"${PWD}/test/projects/vivafolio-data-examples"

# Test blocks
test-blocks:
	cd blocks && npm test

# Run block-specific tests
test-block-integration:
	node test/e2e-blockprotocol-integration-complete.js

# Validate block builds
validate-blocks:
	@echo "Validating block builds..."
	@for dir in blocks/*/; do \
		if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then \
			block_name=$(basename "$dir"); \
			if [ -f "$dir/dist/index.html" ]; then \
				echo "✅ $block_name: Build valid"; \
			else \
				echo "❌ $block_name: Missing dist/index.html"; \
			fi; \
		fi; \
	done

# Check development environment status
dev-status:
	@echo "Development Environment Status:"
	@echo "================================"
	@echo "Extension watching: $(pgrep -f "npm run watch" | wc -l) processes"
	@echo "Block watching: $(pgrep -f "watch-blocks" | wc -l) processes"
	@echo "VS Code instances: $(pgrep -f "code-insiders" | wc -l) processes"
	@echo "Block dev server: $(pgrep -f "block-dev-server" | wc -l) processes"

# Kill all development processes
kill-dev:
	@echo "Killing development processes..."
	@pkill -f "npm run watch" || true
	@pkill -f "watch-blocks" || true
	@pkill -f "code-insiders" || true
	@pkill -f "block-dev-server" || true
	@echo "All development processes killed"

# Reset development environment
reset-dev:
	@echo "Resetting development environment..."
	@just kill-dev
	@just clean-blocks
	@just build-blocks
	@echo "Development environment reset"

# Clean everything (extension, blocks, caches)
clean-all:
	@echo "Cleaning all build artifacts and caches..."
	@npm run clean
	@just clean-blocks
	@rm -rf out/
	@rm -rf test-results/
	@rm -rf apps/blockprotocol-poc/dist/
	@rm -rf packages/*/dist/
	@echo "All artifacts cleaned"

# -----------------------------
# Block Protocol POC Demo Commands
# Based on documented scripts in apps/blockprotocol-poc/package.json
# -----------------------------

# Launch Block Protocol POC dev server (basic mode)
dev-blockprotocol-poc:
	@echo "Building all blocks..."
	@just build-blocks
	@echo "Starting Block Protocol POC dev server..."
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
	@echo "Building all blocks..."
	@just build-blocks
	@echo "Starting Block Protocol POC dev server..."
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
