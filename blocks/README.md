# Vivafolio Blocks

This directory contains shared Block Protocol block definitions used by both the Vivafolio POC demo app and the production Vivafolio VS Code extension.

## Directory Structure

```
blocks/
├── color-picker/          # Color picker block
│   ├── block-metadata.json # Block Protocol metadata
│   ├── package.json       # NPM package configuration
│   ├── src/
│   │   └── index.html     # Block implementation
│   └── dist/              # Built output (generated)
├── color-square/          # Color square block
│   ├── block-metadata.json
│   ├── package.json
│   ├── src/
│   │   └── index.html
│   └── dist/
└── README.md             # This file
```

## Block Structure

Each block follows the standard Block Protocol structure:

### `block-metadata.json`
- Block Protocol compliant metadata
- Defines block properties, examples, and variants
- Includes Vivafolio-specific configuration for build and development

### `src/index.html`
- Main block implementation as an HTML file
- Handles Block Protocol messaging (`graph:update`, `graph:error`, etc.)
- Uses VS Code theming variables for consistent styling
- Implements proper error handling and state management

### `package.json`
- NPM package configuration
- Build scripts for development and production

## Development Workflow

### Building Blocks

```bash
# Build all blocks
npm run build

# Build individual block
cd color-picker
npm run build

# Development build with watch mode
npm run dev
```

### Using Blocks in Development

Blocks are automatically served by the Block Protocol Dev Server during development:

1. **Block Definition Iteration**: Edit `src/index.html` files and rebuild
2. **Hot Reloading**: Changes trigger automatic cache invalidation in VS Code
3. **Resource Serving**: Dev server provides blocks with proper caching and integrity

### Integration with VS Code Extension

The VS Code extension's block resource cache automatically syncs with the dev server:

1. Block files are built and cached with SHA-256 integrity hashes
2. Cache invalidation occurs when block definitions change
3. Webviews automatically reload updated block implementations
4. Full bidirectional sync between source code and block visuals

## Testing

Blocks are tested through comprehensive E2E test suites that verify:

- **Block Definition Edits**: Source changes → rebuild → cache invalidation → webview updates
- **Source Code Edits**: Language file changes → VivafolioBlock notifications → indexing service → webview updates
- **Bidirectional Sync**: Entity changes flow correctly between blocks and source code

## Adding New Blocks

1. Create new directory: `blocks/your-block-name/`
2. Add `block-metadata.json` with Block Protocol metadata
3. Implement `src/index.html` with block logic
4. Add `package.json` with build scripts
5. Update root `package.json` workspaces array
6. Run `npm run build` to generate output

## Block Protocol Compliance

All blocks follow Block Protocol 0.3 specifications:

- Proper message handling for `graph:update`, `graph:create`, `graph:delete`, `graph:query`
- Entity-based state management
- Error handling and recovery
- VS Code extension API integration
- Security and sandboxing considerations
