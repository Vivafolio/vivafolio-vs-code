# Framework Compilation & Development Tools

This document describes the framework compilation, scaffolding, and development tools available for Vivafolio Block Protocol blocks.

## 🎯 Overview

The Block Protocol POC now supports **hot-reloaded framework compilation** for 5 major web frameworks:

- **SolidJS** - Reactive framework with JSX support
- **Vue.js** - Progressive framework with composition API
- **Svelte** - Compiler-based framework
- **Lit** - Web Components framework
- **Angular** - Enterprise framework with TypeScript

## 🚀 Quick Start

### 1. Enable Framework Watching

```bash
# Start dev server with framework compilation
npm run dev:frameworks

# Or manually enable framework watching
ENABLE_FRAMEWORK_WATCH=true npm run dev
```

### 2. Scaffold a New Block

```bash
# Scaffold a SolidJS block
npm run scaffold -- --framework solidjs --name "My Task Block" --description "A task management block"

# Scaffold an inline Vue block
npm run scaffold -- --framework vue --name "Status Badge" --description "Status display" --type inline

# Scaffold a multi-line Svelte block
npm run scaffold -- --framework svelte --name "Data Table"
```

### 3. View Your Block

Navigate to: `http://localhost:4173/?scenario=framework-compilation-demo`

Your newly scaffolded block should appear alongside the existing framework examples!

## 🛠️ Development Tools

### Framework Compilation

The dev server automatically:
- **Watches** framework source directories for changes
- **Compiles** blocks using framework-appropriate bundlers
- **Serves** compiled assets with content hashing
- **Hot-reloads** blocks when source files change
- **Provides** REST API for bundle metadata

### File Structure

```
packages/block-frameworks/
├── solidjs/
│   ├── examples/
│   │   ├── task-block.tsx
│   │   └── block-metadata.json
│   └── src/
│       └── index.ts (SolidJS helpers)
├── vue/
├── svelte/
├── lit/
├── angular/
└── types/
    └── index.ts (shared TypeScript types)
```

### Compilation Output

Compiled blocks are served from `/frameworks/{framework}/` with hashed filenames:

```
dist/frameworks/
├── solidjs/
│   └── solidjs-task-block-abc123.js
├── vue/
│   └── vue-status-badge-def456.js
└── ...
```

## 📚 Framework APIs

### Shared TypeScript Types

All frameworks share common types from `packages/block-frameworks/types/index.ts`:

```typescript
import {
  Entity,
  GraphService,
  BlockProps,
  BlockMetadata,
  FrameworkAPI
} from '../../../packages/block-frameworks/types'
```

### Framework-Specific Features

#### SolidJS
```typescript
import { createBlock, useEntity, BlockContainer } from '../../../packages/block-frameworks/solidjs/src'

const MyBlock = createBlock((props) => {
  const entity = useEntity(props.graph)
  // Reactive SolidJS component
}, { name: 'my-block', version: '1.0.0' })
```

#### Vue.js
```vue
<script setup lang="ts">
import { useEntity, BlockContainer } from '../../../packages/block-frameworks/vue/src'

const props = defineProps<{ graph: GraphService }>()
const entity = useEntity(props.graph)
</script>

<template>
  <BlockContainer>
    <h3>{{ entity?.properties?.title }}</h3>
  </BlockContainer>
</template>
```

#### Svelte
```svelte
<script lang="ts">
  import { useEntity, BlockContainer } from '../libs/block-frameworks/svelte/src'

  export let graph: GraphService
  $: entity = useEntity(graph)
</script>

<BlockContainer>
  <h3>{entity?.properties?.title}</h3>
</BlockContainer>
```

#### Lit
```typescript
import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { useEntity, BlockContainer } from '../libs/block-frameworks/lit/src'

@customElement('my-block')
export class MyBlock extends LitElement {
  @property() graph: GraphService

  render() {
    const entity = useEntity(this.graph)
    return html`
      <BlockContainer>
        <h3>${entity?.properties?.title}</h3>
      </BlockContainer>
    `
  }
}
```

#### Angular
```typescript
import { Component, Input } from '@angular/core'
import { useEntity, BlockContainer } from '../libs/block-frameworks/angular/src'

@Component({
  selector: 'my-block',
  template: `
    <BlockContainer>
      <h3>{{ entity?.properties?.title }}</h3>
    </BlockContainer>
  `
})
export class MyBlockComponent {
  @Input() graph: GraphService
  entity = useEntity(this.graph)
}
```

## 🧪 Testing

### Framework Compilation Tests

Run the framework compilation test suite:

```bash
npm test  # Includes framework-compilation.spec.ts
```

Tests cover:
- Framework API endpoints
- Bundle serving and metadata
- Cross-framework scenarios
- Hot reload functionality

### Scaffolding Tests

Test the scaffolding tool:

```bash
npx playwright test tests/scaffold.spec.ts
```

Tests validate:
- Block file generation
- Framework-specific imports
- Naming conventions
- Metadata generation
- Error handling

## 🔧 Advanced Configuration

### Custom Build Scripts

Use the build script for production bundles:

```bash
npm run build:frameworks
```

This creates optimized bundles in `dist/frameworks/` suitable for production deployment.

### Framework-Specific Options

Each framework supports different configuration options:

```typescript
// SolidJS - Reactive configuration
interface SolidJSBlockConfig {
  reactive?: boolean
  suspense?: boolean
  errorBoundary?: boolean
}

// Vue.js - Lifecycle configuration
interface VueBlockConfig {
  reactive?: boolean
  lifecycle?: 'composition' | 'options'
  typescript?: boolean
}

// Svelte - Compiler options
interface SvelteBlockConfig {
  reactive?: boolean
  typescript?: boolean
  immutable?: boolean
}

// Lit - Web Components options
interface LitBlockConfig {
  reactive?: boolean
  shadowDom?: boolean
  typescript?: boolean
}

// Angular - Change detection
interface AngularBlockConfig {
  reactive?: boolean
  changeDetection?: 'default' | 'onPush'
  typescript?: boolean
}
```

### Hot Reload Configuration

Hot reload is automatically configured for all frameworks. The server:

1. **Watches** source files for changes
2. **Recompiles** affected blocks
3. **Notifies** connected clients via WebSocket
4. **Updates** block resources with new hashes

## 📊 Framework Comparison

| Framework | Hot Reload | TypeScript | JSX | Shadow DOM | Ecosystem | Preferred Bundler |
|-----------|------------|------------|-----|------------|-----------|-------------------|
| SolidJS   | ✅         | ✅         | ✅  | ❌         | Small     | Vite              |
| Vue.js    | ✅         | ✅         | ✅  | ❌         | Large     | Vite              |
| Svelte    | ✅         | ✅         | ❌  | ❌         | Medium    | Vite              |
| Lit       | ✅         | ✅         | ❌  | ✅         | Small     | Rollup            |
| Angular   | ✅         | ✅         | ❌  | ❌         | Large     | esbuild           |

## 🚨 Troubleshooting

### Common Issues

1. **Framework not compiling?**
   - Check that examples directory exists: `libs/block-frameworks/{framework}/examples/`
   - Verify source files have correct extensions (.tsx, .vue, .svelte, etc.)

2. **Hot reload not working?**
   - Ensure `ENABLE_FRAMEWORK_WATCH=true` is set
   - Check server logs for compilation errors
   - Verify WebSocket connection in browser dev tools

3. **Scaffolding errors?**
   - Ensure framework is supported: solidjs, vue, svelte, lit, angular
   - Check that block name doesn't contain invalid characters
   - Verify write permissions to examples directory

### Debug Mode

Enable verbose logging:

```bash
DEBUG=framework* npm run dev:frameworks
```

This provides detailed compilation logs and error traces.

## 🎯 Best Practices

### Block Development
1. **Use TypeScript** - All frameworks support it for better DX
2. **Follow naming conventions** - Use kebab-case for file names
3. **Test across frameworks** - Ensure blocks work in different runtime environments
4. **Handle errors gracefully** - Implement proper error boundaries
5. **Optimize for performance** - Use framework-specific optimization techniques

### Framework Selection
- **SolidJS** - Best for reactive, high-performance applications
- **Vue.js** - Great for teams familiar with Vue ecosystem
- **Svelte** - Ideal for compiler-optimized, smaller bundles
- **Lit** - Perfect for Web Components and design systems
- **Angular** - Suitable for large enterprise applications

## 📝 Contributing

When adding new frameworks:

1. Create framework directory: `libs/block-frameworks/{framework}/`
2. Add examples directory with sample blocks
3. Implement framework-specific helpers in `src/index.ts`
4. Update compilation logic in `src/server.ts`
5. Add framework to scaffolding tool
6. Update tests and documentation

## 🔗 Related Documentation

- [Block Protocol Specification](../docs/spec/BlockProtocol-in-Vivafolio.md)
- [Dev Server API](../../docs/BlockProtocol-in-Vivafolio-Architecture.md)
- [Framework Types](./libs/block-frameworks/types/index.ts)
- [Test Guidelines](../test/AGENTS.md)
