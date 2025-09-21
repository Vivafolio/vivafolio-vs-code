# Block Development Guide

This guide covers the complete workflow for continuously developing Block Protocol blocks while testing them in VS Code without restarting the extension. Use the color picker block as a practical example throughout.

## Overview

The development workflow enables:
- **Live block editing** - Modify block HTML, CSS, and JavaScript
- **Automatic rebuilding** - Changes trigger immediate rebuilds
- **Hot reloading** - Block resources update in running VS Code instances
- **No restarts required** - Test changes instantly without restarting VS Code

## Prerequisites

1. **Nix development environment** set up
2. **VS Code Insiders** installed
3. **Node.js dependencies** installed (`npm install`)
4. **Extension compiled** (`npm run compile` or `npm run watch`)

## Quick Start

### Launch Development Environment

```bash
# Start VS Code with extension in development mode
just vscode-dev

# Alternative: Launch with debugging enabled
just vscode-debug
```

### Open Test File

1. In VS Code, open `test/projects/vivafolio-data-examples/schedule.js`
2. This file contains realistic API usage:
   ```javascript
   let color = color_picker(gui_state("#ff0000"));
   show_square(color);
   ```

### Edit Block Definition

1. Open `blocks/color-picker/src/index.html`
2. Change the background color style:
   ```css
   background: var(--vscode-input-background, #2d2d30);
   ```
3. Save the file - block rebuilds automatically
4. See the color picker background change in VS Code

## Development Workflow

### 1. Environment Setup

#### Option A: Full Development Mode (Recommended)

```bash
# Launches VS Code with extension, enables file watching, and block rebuilding
just vscode-dev-full
```

This command:
- Starts VS Code in development mode
- Enables extension file watching (`npm run watch`)
- Sets up block file watching for automatic rebuilds
- Configures logging for development

#### Option B: Manual Setup

```bash
# Terminal 1: Start extension file watcher
npm run watch

# Terminal 2: Start block development watcher
just watch-blocks

# Terminal 3: Launch VS Code with extension
just vscode-dev
```

### 2. Block Editing

#### File Structure

```
blocks/color-picker/
├── block-metadata.json    # Block Protocol metadata
├── package.json          # Build configuration
├── src/
│   └── index.html        # Main block implementation
└── dist/                 # Built output (auto-generated)
```

#### Editing Guidelines

**HTML Structure (`src/index.html`):**
- Use VS Code theming variables: `var(--vscode-foreground, #cccccc)`
- Include proper ARIA labels and accessibility
- Handle `graph:update` and `graph:error` messages
- Send `ready` message on initialization

**CSS Styling:**
- Use VS Code theme variables for consistency
- Support both light and dark themes
- Include hover and focus states
- Use `rem` units for scalability

**JavaScript Logic:**
- Handle Block Protocol messaging properly
- Implement error handling and recovery
- Log with prefixed messages: `console.log('[COLOR-PICKER] message')`
- Use VS Code API when available: `acquireVsCodeApi()`

#### Example: Adding a Reset Button

```html
<button id="resetBtn" class="reset-button">Reset</button>
```

```javascript
const resetBtn = document.getElementById('resetBtn');
resetBtn.addEventListener('click', () => {
  colorPicker.value = '#ff0000';
  // Trigger change event to send update
  colorPicker.dispatchEvent(new Event('input'));
});
```

### 3. Automatic Rebuilding

#### File Watching

The development environment automatically watches for changes:

- **Block source files** (`blocks/*/src/*`) → Triggers rebuild
- **Extension source** (`src/*`) → Triggers compilation
- **Test files** → Can trigger test runs

#### Manual Rebuild

```bash
# Rebuild all blocks
just build-blocks

# Rebuild specific block
cd blocks/color-picker && npm run build

# Clean and rebuild
just clean-blocks && just build-blocks
```

### 4. Testing Changes

#### In VS Code

1. **Open test file**: `test/projects/vivafolio-data-examples/schedule.js`
2. **Trigger execution**: `Ctrl+Shift+R` (runtime path)
3. **Check results**: Blocks appear inline with your changes

#### With LSP (Source Code Integration)

1. **Open mocklang file**: `test/projects/vivafolio-data-examples/schedule.js`
2. **Edit gui_state value**: Change `gui_state("#ff0000")` to `gui_state("#00ff00")`
3. **Save file**: LSP detects change and sends VivafolioBlock notification
4. **See update**: Block updates with new color value

#### Debugging

```bash
# Enable full logging
VIVAFOLIO_DEBUG=1 VIVAFOLIO_CAPTURE_WEBVIEW_LOGS=1 just vscode-dev

# View logs in VS Code: Output → Vivafolio panel
# Or check files: ~/Library/Application Support/Code - Insiders/User/globalStorage/local.vivafolio/logs/
```

## Launch Configurations

### VS Code launch.json

Add these configurations to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Extension Development",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--disable-extensions",
        "${workspaceFolder}/test/projects/vivafolio-data-examples"
      ],
      "env": {
        "VIVAFOLIO_DEBUG": "1",
        "VIVAFOLIO_CAPTURE_WEBVIEW_LOGS": "1"
      },
      "outFiles": ["${workspaceFolder}/out/**/*.js"]
    },
    {
      "name": "Extension + Block Dev Server",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--disable-extensions",
        "${workspaceFolder}/test/projects/vivafolio-data-examples"
      ],
      "env": {
        "VIVAFOLIO_DEBUG": "1",
        "VIVAFOLIO_CAPTURE_WEBVIEW_LOGS": "1",
        "BLOCK_DEV_SERVER_PORT": "3001"
      },
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: watch",
      "postDebugTask": "build-blocks-watch"
    },
    {
      "name": "Block Development Only",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/npm",
      "args": ["run", "watch"],
      "cwd": "${workspaceFolder}/blocks/color-picker",
      "console": "integratedTerminal"
    }
  ]
}
```

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build-blocks-watch",
      "type": "shell",
      "command": "just",
      "args": ["watch-blocks"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "silent",
        "focus": false,
        "panel": "shared"
      },
      "isBackground": true,
      "problemMatcher": []
    },
    {
      "label": "npm: watch",
      "type": "npm",
      "script": "watch",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "silent",
        "focus": false,
        "panel": "shared"
      },
      "isBackground": true,
      "problemMatcher": "$tsc-watch"
    }
  ]
}
```

## Just Commands

### Development Commands

```bash
# Full development environment
just vscode-dev-full          # VS Code + extension watching + block watching

# VS Code launching
just vscode-dev               # Launch VS Code with extension
just vscode-debug             # Launch with debugging enabled
just vscode-clean             # Launch with clean state

# Block development
just build-blocks             # Build all blocks
just watch-blocks             # Watch and rebuild blocks automatically
just clean-blocks             # Clean all block builds

# Testing
just test-blocks              # Run block-specific tests
just test-integration         # Run integration tests
just test-e2e-complete        # Run complete E2E test suite
```

### Advanced Commands

```bash
# With specific logging
just vscode-dev-logged        # Full logging enabled
just vscode-dev-trace         # VS Code trace logging

# Block development with server
just block-dev-server         # Start block development server
just vscode-with-server       # VS Code + block dev server

# Cleanup and reset
just reset-dev-env            # Reset development environment
just clean-all                # Clean extension, blocks, and caches
```

## Block Development Servers

There are two block development servers in the codebase:

### 1. POC Dev Server (`apps/blockprotocol-poc/`)
**Purpose**: Framework development and Block Protocol validation
**Features**:
- Framework compilation (SolidJS, Vue, Svelte, Lit, Angular)
- WebSocket communication for Block Protocol scenarios
- Entity graph management and real-time updates
- Multiple test scenarios and hot-reload

**Usage**:
```bash
# Start POC dev server with frameworks
just dev-blockprotocol-poc-frameworks

# Start POC dev server (basic)
just dev-blockprotocol-poc
```

### 2. Production Block Dev Server (`blocks/`)
**Purpose**: Serving production blocks for VS Code extension
**Features**:
- Simple HTTP server for block resources
- Basic file watching and rebuilds
- Block metadata API endpoints
- Cache-aware resource serving

**Usage**:
```bash
# Start production block dev server
just block-dev-server

# Launch VS Code with server integration
just vscode-with-server
```

### When to Use Each Server

- **Use POC Dev Server** for:
  - Developing new Block Protocol blocks with frameworks
  - Testing Block Protocol scenarios and entity graphs
  - Framework-specific hot reloading and compilation
  - Full Block Protocol workflow validation

- **Use Production Block Dev Server** for:
  - Developing production-ready blocks for VS Code extension
  - Simple HTML/CSS/JS blocks without framework dependencies
  - Quick iteration on extension-integrated blocks
  - Testing block loading in VS Code environment

## Troubleshooting

### Common Issues

#### Changes Not Reflecting
1. Check if file watching is active: `just watch-blocks`
2. Verify build completed: Check `blocks/*/dist/` directories
3. Restart VS Code if cache issues persist

#### Block Not Loading
1. Check console for errors: `VIVAFOLIO_DEBUG=1 just vscode-dev`
2. Verify block metadata: `blocks/*/block-metadata.json`
3. Check resource paths in helpers

#### Performance Issues
1. Disable unnecessary logging: Remove `VIVAFOLIO_DEBUG=1`
2. Use block dev server for faster reloading
3. Clean caches: `just clean-all`

### Debug Commands

```bash
# Check extension status
just check-extension

# Validate block builds
just validate-blocks

# Show active processes
just dev-status

# Kill all dev processes
just kill-dev
```

## Advanced Workflows

### Multi-Block Development

```bash
# Watch all blocks simultaneously
just watch-all-blocks

# Test multiple blocks
just test-multi-blocks
```

### Framework Integration

For blocks using frameworks (React, Vue, etc.):

```bash
# Start framework dev server
just framework-dev

# Build framework blocks
just build-framework-blocks

# Hot reload framework changes
just hot-reload-framework
```

### CI/CD Integration

```bash
# Build blocks for production
just build-blocks-production

# Run comprehensive tests
just test-full-suite

# Deploy blocks
just deploy-blocks
```

## Best Practices

### Code Organization
- Keep block logic modular and testable
- Use consistent naming conventions
- Document block APIs and behaviors

### Performance
- Minimize block bundle sizes
- Use efficient CSS selectors
- Cache expensive operations
- Lazy load non-critical resources

### Testing
- Test blocks in isolation and integration
- Cover error states and edge cases
- Validate accessibility compliance
- Test across different VS Code themes

### Version Control
- Commit block source files, not built outputs
- Use semantic versioning for blocks
- Tag releases appropriately
- Document breaking changes

## Resources

- [Block Protocol Specification](https://blockprotocol.org)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Webview Messaging Guide](https://code.visualstudio.com/api/extension-guides/webview)
- [Block Development Examples](blocks/README.md)
