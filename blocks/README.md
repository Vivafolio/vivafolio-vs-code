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

## Authoring & Compliance

For the canonical guidance on how to write, package, and integrate blocks (metadata, folder structure, entry modes, messaging, security, testing, and build), see:

- Block Authoring Standard v3: `blocks/Block-Authoring-Standard_Version3.markdown`

That document is the single source of truth; this README intentionally avoids duplicating it.

## Quick start (build/dev)

Build all blocks or an individual block:

```bash
# Build all blocks
npm run build

# Build individual block
cd color-picker
npm run build

# Development build with watch mode
npm run dev
```

For Dev Server usage and runtime details, see `docs/BlockProtocol-DevServer.md` and `blocks/src/server.ts`.

## Adding New Blocks

Follow the Block Authoring Standard’s sections on Folder Structure and Metadata. Minimal repo-specific steps:

1. Create `blocks/your-block-name/`
2. Add `block-metadata.json`
3. Implement source (HTML entry or custom-element per the standard)
4. Add `package.json` with build scripts
5. Run `npm run build` to generate output

Tip: `mySolidBlock` shows a SolidJS (no React) example; see `blocks/mySolidBlock/`.

## Further reading

- Block Authoring Standard v3: `blocks/Block-Authoring-Standard_Version3.markdown`
- Dev Server: `docs/BlockProtocol-DevServer.md`
- Block resources cache: `packages/block-resources-cache/README.md`
