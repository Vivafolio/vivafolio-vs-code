# @vivafolio/blockprotocol-dev-server

Standalone Block Protocol development server for framework compilation and testing without Vivafolio integration.

## Installation

```bash
npm install -g @vivafolio/blockprotocol-dev-server
# or
npx @vivafolio/blockprotocol-dev-server
```

## Quick Start

### CLI Usage

```bash
# Start server with default settings
npx @vivafolio/blockprotocol-dev-server

# Start on custom port
npx @vivafolio/blockprotocol-dev-server --port 3000

# Start with specific frameworks
npx @vivafolio/blockprotocol-dev-server --frameworks solidjs,vue

# Disable hot reload
npx @vivafolio/blockprotocol-dev-server --no-hot-reload
```

### Programmatic Usage

```typescript
import { startStandaloneServer } from '@vivafolio/blockprotocol-dev-server'

const server = await startStandaloneServer({
  port: 3000,
  frameworks: ['solidjs', 'vue', 'svelte'],
  enableHotReload: true,
  onReady: (url) => {
    console.log(`Server ready at ${url}`)
  },
  onFrameworkCompiled: (framework, bundle) => {
    console.log(`Compiled ${framework}: ${bundle.entryPoint}`)
  }
})

// Later, stop the server
await server.close()
```

## API Reference

### `startStandaloneServer(options?)`

Starts the standalone Block Protocol development server.

#### Options

```typescript
interface StandaloneServerOptions {
  /** Port to listen on (default: 4173) */
  port?: number
  /** Host to bind to (default: '0.0.0.0') */
  host?: string
  /** Frameworks to enable (default: all supported) */
  frameworks?: ('solidjs' | 'vue' | 'svelte' | 'lit' | 'angular')[]
  /** Enable hot reload (default: true) */
  enableHotReload?: boolean
  /** Enable Vite middleware (default: true in development) */
  enableVite?: boolean
  /** Custom framework source directories */
  frameworkDirs?: Record<string, string>
  /** Custom output directory for compiled assets */
  outputDir?: string
  /** Attach signal handlers for graceful shutdown */
  attachSignalHandlers?: boolean
  /** Custom scenarios to serve */
  scenarios?: Record<string, ScenarioDefinition>
  /** Callback when server is ready */
  onReady?: (url: string) => void
  /** Callback when framework is compiled */
  onFrameworkCompiled?: (framework: string, bundle: FrameworkBundle) => void
}
```

#### Return Value

```typescript
interface ServerInstance {
  url: string
  port: number
  host: string
  close(): Promise<void>
  frameworkWatchers: FrameworkWatcher[]
  scenarios: string[]
}
```

## Endpoints

### Health Check
```
GET /healthz
```
Returns server status and configuration.

### Framework Bundles
```
GET /api/frameworks/bundles
```
Returns all compiled framework bundles.

```
GET /api/frameworks/:framework/bundles
```
Returns bundles for a specific framework.

## Supported Frameworks

- **SolidJS** - Reactive framework with JSX support
- **Vue.js** - Progressive framework with composition API
- **Svelte** - Compiler-based framework
- **Lit** - Web Components framework
- **Angular** - Enterprise framework with TypeScript

## Framework Directory Structure

The server expects frameworks to be organized as:

```
project/
├── packages/
│   └── block-frameworks/
│       ├── solidjs/
│       │   └── examples/
│       │       ├── task-block.tsx
│       │       └── block-metadata.json
│       ├── vue/
│       ├── svelte/
│       ├── lit/
│       └── angular/
└── dist/
    └── frameworks/  # Compiled output
```

## Custom Scenarios

You can define custom scenarios for testing:

```typescript
import { startStandaloneServer, type ScenarioDefinition } from '@vivafolio/blockprotocol-dev-server'

const customScenarios: Record<string, ScenarioDefinition> = {
  'my-scenario': {
    id: 'my-scenario',
    title: 'My Custom Scenario',
    description: 'Test scenario for my blocks',
    createState: () => ({
      graph: {
        entities: [{
          entityId: 'custom-entity',
          entityTypeId: 'https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2',
          properties: {
            'https://blockprotocol.org/@blockprotocol/types/property-type/name/': 'Custom Block'
          }
        }],
        links: []
      }
    }),
    buildNotifications: (state) => [{
      blockId: 'custom-block',
      blockType: 'https://example.com/blocks/custom/v1',
      entityId: state.graph.entities[0]?.entityId || 'custom-entity',
      displayMode: 'multi-line',
      entityGraph: state.graph,
      supportsHotReload: true,
      initialHeight: 200
    }],
    applyUpdate: ({ state, update }) => {
      // Handle entity updates
      const entity = state.graph.entities.find(e => e.entityId === update.entityId)
      if (entity) {
        entity.properties = { ...entity.properties, ...update.properties }
      }
    }
  }
}

await startStandaloneServer({
  scenarios: customScenarios
})
```

## CLI Options

```
Usage: blockprotocol-dev-server [options]

Options:
  -p, --port <port>          Port to listen on (default: 4173)
  -h, --host <host>          Host to bind to (default: 0.0.0.0)
  -f, --frameworks <list>    Frameworks to enable (default: solidjs,vue,svelte,lit,angular)
  --no-hot-reload           Disable hot reload
  --no-vite                 Disable Vite middleware
  --help                    Show help

Examples:
  blockprotocol-dev-server --port 3000
  blockprotocol-dev-server --frameworks solidjs,vue --no-hot-reload
```

## Environment Variables

- `NODE_ENV` - Set to 'production' to disable Vite middleware by default

## Examples

### Basic Usage

```bash
# Start server and open browser
npx @vivafolio/blockprotocol-dev-server

# Visit http://localhost:4173 to see the server status
# Visit http://localhost:4173/api/frameworks/bundles to see compiled bundles
```

### Framework Development

```typescript
// Start server programmatically for framework development
import { startStandaloneServer } from '@vivafolio/blockprotocol-dev-server'

const server = await startStandaloneServer({
  port: 3000,
  frameworks: ['solidjs', 'vue'],
  enableHotReload: true,
  frameworkDirs: {
    solidjs: './my-frameworks/solidjs/examples',
    vue: './my-frameworks/vue/examples'
  },
  onFrameworkCompiled: (framework, bundle) => {
    console.log(`✅ Compiled ${framework}: ${bundle.entryPoint}`)
  }
})

// The server will watch for changes and recompile automatically
```

### Testing Integration

```typescript
// Use in test setup
import { startStandaloneServer } from '@vivafolio/blockprotocol-dev-server'

describe('Block Tests', () => {
  let server: any

  beforeAll(async () => {
    server = await startStandaloneServer({
      port: 3001,
      frameworks: ['solidjs'],
      enableHotReload: false // Disable for consistent tests
    })
  })

  afterAll(async () => {
    await server.close()
  })

  test('block renders correctly', async () => {
    // Test implementation
  })
})
```

## Troubleshooting

### Common Issues

1. **Framework not compiling?**
   - Ensure framework directories exist in the expected structure
   - Check that source files have correct extensions (.tsx, .vue, .svelte, etc.)
   - Verify file permissions

2. **Hot reload not working?**
   - Make sure `enableHotReload` is set to `true`
   - Check that source directories are accessible
   - Verify WebSocket connections in browser dev tools

3. **Vite middleware issues?**
   - Install Vite as a peer dependency: `npm install vite`
   - Or disable Vite: `enableVite: false`

4. **Port already in use?**
   - Specify a different port: `--port 3001`
   - Or let the system choose: omit the port option

### Debug Mode

Enable verbose logging:

```bash
DEBUG=standalone-server* npx @vivafolio/blockprotocol-dev-server
```

## Contributing

When adding new frameworks:

1. Add framework to the `StandaloneServerOptions.frameworks` type
2. Implement compilation logic in `compileFrameworkBlock`
3. Add framework-specific file extensions to the file watcher
4. Update documentation and examples

## License

MIT
