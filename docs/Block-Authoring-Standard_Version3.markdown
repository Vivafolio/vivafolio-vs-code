# Block Authoring Standard (Version 3)

This document outlines the requirements and guidelines for authoring blocks compatible with the Vivafolio platform and the Block Protocol. Blocks are reusable UI components that integrate with Vivafolio’s VS Code WebView environment, leveraging the Block Protocol for data and interaction. This standard ensures blocks are interoperable, secure, and optimized for performance while supporting Vivafolio’s specific needs, such as fast hydration via a minimal block loader.

## 1. Terminology

- **Block**: A reusable UI component adhering to the Block Protocol, typically a Web Component or HTML/JS bundle, rendered in a Vivafolio WebView or other compliant host.
- **Host**: The embedding application (e.g., Vivafolio’s VS Code extension) that loads and manages blocks, providing data and services via the Block Protocol.
- **Block Loader**: A minimal runtime environment provided by the Vivafolio Host within VS Code WebViews. It bootstraps blocks by loading their assets, creating custom elements (for SolidJS or other frameworks), and injecting initial data (e.g., `blockEntitySubgraph`) as properties for fast hydration. Blocks do not need to implement loader-specific logic; this is handled by the Host to keep blocks standard and reusable across other compliant hosts.
- **Custom-Element Flow**: The preferred initialization pattern for Vivafolio blocks, where the block is exposed as a Web Component. Initial data (graph properties) is passed synchronously as element properties by the Host or loader.
- **blockEntitySubgraph**: A JSON structure provided by the Host, containing the block’s root entity, linked entities, edges, and traversal depths, as defined by the Block Protocol’s graph module.
- **Schema**: A JSON Schema (or JSON-LD `@context`) defining the structure of a block’s root entity properties.

## 2. Overview

Blocks are self-contained components that render UI based on a data graph provided by the Host. They adhere to the Block Protocol (see [blockprotocol.org/docs/spec](https://blockprotocol.org/docs/spec)) for data exchange, ensuring reusability across compliant hosts. Vivafolio optimizes block rendering using a block loader for fast hydration, particularly for custom-element blocks built with SolidJS, but blocks must remain standard to work in other environments.

## 3. Block Metadata (block-metadata.json) [Required]

The canonical metadata now lives in `package.json` under the `blockprotocol` field. A `block-metadata.json` is generated into each block’s `dist/` at build time via the shared postbuild script (`blocks/utils/postbuild.js`), which normalizes paths to the built assets.

Minimum fields:

```json
{
  "name": "color-picker",
  "description": "an interactive input block that lets users inspect and edit a color value in real time",
  "version": "0.1.0",
  "protocol": "0.3",
  "blockType": {
    "entryPoint": "custom-element",
    "tagName": "vivafolio-color-picker"
  },
  "schema": {
    "type": "object",
    "properties": {
      "value": { "type": "string", "format": "color" }
    },
    "required": ["value"],
    "additionalProperties": false
  },
  "source": "dist/app.js",
  "externals": "solidJS",
  "license": "MIT"
}
```

Notes:
- **blockType**: Use `"entryPoint": "custom-element"` for Vivafolio blocks, especially those built with SolidJS (wrapped in a Web Component). `tagName` is a must for custom element blocks. The Host will instantiate the element and pass `graph` (containing `blockEntitySubgraph`, `readonly`, and graph methods) and `blockId` as properties for synchronous initialization.
- **schema**: Inline JSON schema describing the root entity properties expected by the block; keep strict to ensure compatibility with the Host-provided `blockEntitySubgraph`.
- **source**: Relative path to the bundled entrypoint that defines the custom element (e.g., `dist/app.js`).
- **postbuild generation**: Add `\"postbuild\": \"node ../utils/postbuild.js\"` to each block’s scripts so `npm run build` emits `dist/block-metadata.json` from the `blockprotocol` section and normalizes the entrypoint path.

## 4. Folder Structure [Required]

A typical block structure for custom-element blocks (preferred):

```
blocks/your-block/
├── README.md
├── package.json
├── src/
│   ├── index.ts  // Defines the Web Component, wrapping the SolidJS component
│   ├── Component.tsx  // Main SolidJS component (e.g., Toggle.tsx, ColorPicker.tsx)
│   └── styles.css
└── dist/ (generated)
    ├── index.js  
    ├── styles.css
    └── block-metadata.json
```

Notes:
- **index.ts**: The entry point that defines the custom element (via `customElements.define`) and integrates the SolidJS component from `Component.tsx`. This separates protocol compliance (Web Component) from UI logic (SolidJS) for modularity and reusability.
- **Component.tsx**: The SolidJS component file, named appropriately for your block (e.g., `Toggle.tsx`). A TypeScript file with JSX syntax, containing reactive UI logic, receiving `graph` and `blockId` props from the custom element wrapper.
- **dist/**: Generated by your build tool (e.g., Vite), containing the bundled JS (referenced in `block-metadata.json`).
- **blockprotocol metadata**: Stored in `package.json` under `blockprotocol`; the postbuild step writes `dist/block-metadata.json` from it.

## 5. Authoring Requirements

### 5.1 Entry Mode
- **Custom-Element Blocks (Preferred for Vivafolio)**: Provide an ESM entry (`src/index.ts`) that defines a Web Component (e.g., using SolidJS wrapped in a custom element). The Host’s block loader instantiates the element and sets the following properties synchronously:
  - `graph`: An object containing `blockEntitySubgraph` (the block’s data graph, with roots, vertices, edges, and depths), `readonly` (boolean), and graph module methods (e.g., `updateEntity`, `createEntity`). Access this in `connectedCallback` or the SolidJS component for immediate hydration.
  - `blockId`: A unique string identifier for the block instance, used for update coordination.
  The block must render based on `graph.blockEntitySubgraph` and use `graph` methods for mutations. Use `index.ts` to define the Web Component and import a separate `Component.tsx` for the SolidJS component, separating protocol compliance from UI logic for modularity.
- **HTML-Entry Blocks**: Provide `src/index.html` with script and styles; rely on Host-provided messages (e.g., `blockEntitySubgraph`) for data. Use only if custom-element is not feasible.

### 5.2 Type Safety
- Generate TypeScript types from `schema` using `@blockprotocol/codegen` (or equivalent).
- Use types in your block (especially in `Component.tsx`) to ensure `blockEntitySubgraph` conforms to expectations.

### 5.3 Styling
- Use CSS or CSS-in-JS, bundled into `dist/styles.css`.
- Scope styles to avoid conflicts (e.g., use Shadow DOM for custom elements or CSS modules).
- For Vivafolio, inherit VS Code CSS variables (e.g., `--vscode-foreground`) for theme consistency.

### 5.4 Dependencies
- Declare dependencies in `package.json`.
- Prefer `peerDependencies` for shared libraries (e.g., SolidJS, `@blockprotocol/graph`).
- Minimize bundle size to optimize load time.

### 5.5 Accessibility
- Ensure UI elements have appropriate ARIA attributes and keyboard navigation.
- Test with screen readers (e.g., NVDA, VoiceOver) in a VS Code WebView.

### 5.6 Framework Preference
- Use SolidJS for most blocks to leverage its reactivity and performance. Wrap SolidJS components in a Web Component to conform to the custom-element flow. The component (in `Component.tsx`) should access `props.graph` for data and mutations, ensuring fast hydration and protocol compliance. Example:
  ```javascript
  // src/index.ts
  import { createRoot } from 'solid-js';
  import Toggle from './Toggle.tsx';

  class ToggleBlock extends HTMLElement {
    connectedCallback() {
      createRoot(() => {
        const el = document.createElement('div');
        this.appendChild(el);
        return <Toggle graph={this.graph} blockId={this.blockId} />;
      });
    }
  }
  customElements.define('example-toggle', ToggleBlock);
  ```

## 6. Messaging & Data Contract

Blocks MUST conform to the Block Protocol and Vivafolio Host interfaces:
- **Initial Data**: For custom-element blocks (preferred), the Host sets the `graph` property synchronously during instantiation, containing:
  - `blockEntitySubgraph`: The block’s data graph (roots, vertices, edges, depths).
  - `readonly`: A boolean indicating edit permissions.
  - Graph module methods (e.g., `updateEntity`, `createEntity`) for data operations.
  Access `graph` in the Web Component’s `connectedCallback` or SolidJS component props for immediate hydration. For HTML-entry blocks, expect `blockEntitySubgraph` via postMessage.
- **Mutations**: Use `graph.updateEntity`, `graph.createEntity`, or `graph.deleteEntity` for all data changes. Do not implement direct DOM or file system mutations.
- **Composition and Services**: Use `hook` messages for nested blocks (e.g., embedding an entity) or Host-provided services (e.g., `vivafolio:service:edit-markdown`).
- **Multiple Instances**: Expect the Host to broadcast `blockEntitySubgraph` updates to all instances via the `graph` prop or messages; handle idempotence client-side if needed.
- **Data Loading Restrictions**: All data access and mutations MUST occur exclusively through the Block Protocol’s `graph` prop or messages (e.g., `getEntity`, `queryEntities`). Blocks MUST NOT make AJAX requests, fetch calls, or any external network operations. The Host provides all data, ensuring isolation, security, and compliance with Vivafolio’s sandboxed WebViews.

## 7. Security Requirements

- Use HTTPS for all external resources (if approved by the Host).
- Avoid inline scripts/styles unless bundled and sanitized.
- Prohibit External Data Access: Blocks MUST NOT implement AJAX, fetch, or any network requests to external sources. All data must come via the `graph` prop or Block Protocol messages. This ensures security and compliance with Vivafolio’s sandboxed WebViews.
- Reference assets via relative paths resolved by the Host; do not fetch remote code or data unless explicitly approved by the Host (e.g., via a documented hook service).
- Sanitize user inputs to prevent XSS or injection attacks.

## 8. Testing Requirements

- Test blocks in isolation using `apps/blockprotocol-poc` to simulate Host behavior.
- Write automatic playwright tests under `apps/blockprotocol-poc/tests` for each block
- Verify rendering with sample `blockEntitySubgraph` data matching the schema.
- Test in a VS Code WebView to ensure compatibility with Vivafolio’s environment.
- Validate accessibility and theme integration.

## 9. Build Process

- Use a build tool (e.g., Vite, esbuild) to bundle `src/` into `dist/`.
- Ensure `dist/app.js` exports the custom element (for `custom-element` blocks) or `dist/index.html` includes all assets (for HTML-entry blocks).
- Add a `postbuild` script (`node ../utils/postbuild.js`) to emit `dist/block-metadata.json` from `package.json#blockprotocol`, keeping resource paths in sync with the bundle.
- Minify JS/CSS for performance.

## 10. Documentation [Required]

- Include a `README.md` with:
  - Block purpose and usage.
  - Installation instructions (e.g., `npm install`).
  - Example `blockEntitySubgraph` input.
  - Vivafolio-specific notes (e.g., VS Code theme integration).

## 11. Submission & Review Checklist

### Metadata
- [ ] `block-metadata.json` includes all required fields.
- [ ] `schema` is strict and matches block expectations.
- [ ] `resources` paths are correct and resolve to bundled assets.

### Code
- [ ] Entry point (`index.ts`) is correctly implemented.
- [ ] Uses custom-element flow with `graph` prop for data (SolidJS in `Component.tsx`).
- [ ] No external AJAX/fetch calls; all data via `graph` prop or Block Protocol messages.

### Quality
- [ ] Type-safe with generated types from schema.
- [ ] Accessible (ARIA, keyboard navigation).
- [ ] Theme-compatible with VS Code (uses CSS variables).
- [ ] Tested with MockBlockDock and in VS Code WebView.

## 12. Example Minimal HTML-Entry Block

```
blocks/example-toggle/
├── README.md
├── package.json
├── src/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── dist/ (generated)
```

`block-metadata.json`:
```json
{
  "name": "example-toggle",
  "version": "0.1.0",
  "protocol": "0.3",
  "blockType": { "entryPoint": "html" },
  "schema": {
    "type": "object",
    "properties": { "enabled": { "type": "boolean" } },
    "required": ["enabled"],
    "additionalProperties": false
  },
  "source": "dist/index.html"
}
```

`src/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <label>
    <input type="checkbox" id="toggle" aria-label="Toggle feature">
    <span>Enable</span>
  </label>
  <script type="module" src="app.js"></script>
</body>
</html>
```

`src/app.js`:
```javascript
import { initializeGraphModule } from '@blockprotocol/graph/stdlib';

const toggle = document.getElementById('toggle');
const graphModule = initializeGraphModule();

graphModule.blockEntitySubgraphCallback(({ blockEntitySubgraph }) => {
  const rootEntity = blockEntitySubgraph.roots[0];
  toggle.checked = rootEntity.properties.enabled;
  toggle.disabled = graphModule.readonly;
  toggle.onchange = (e) => {
    graphModule.updateEntity({
      entityId: rootEntity.entityId,
      properties: { enabled: e.target.checked }
    });
  };
});
```

## 12.2 Example Custom-Element Block (SolidJS)

```
blocks/example-toggle/
├── README.md
├── package.json
├── src/
│   ├── index.ts  // Defines Web Component
│   ├── Toggle.tsx  // SolidJS component
│   └── styles.css
└── dist/ (generated)
    ├── index.js  // Bundled custom element
    ├── styles.css
    └── block-metadata.json
```

`block-metadata.json`:
```json
{
  "name": "example-toggle",
  "version": "0.1.0",
  "protocol": "0.3",
  "blockType": {
    "entryPoint": "custom-element",
    "tagName": "example-toggle"
  },
  "schema": {
    "type": "object",
    "properties": { "enabled": { "type": "boolean" } },
    "required": ["enabled"],
    "additionalProperties": false
  },
  "source": "dist/index.js"
}
```

`src/index.ts`:
```javascript
import { createRoot } from 'solid-js';
import Toggle from './Toggle.tsx';

class ToggleBlock extends HTMLElement {
  connectedCallback() {
    createRoot(() => {
      const el = document.createElement('div');
      this.appendChild(el);
      return <Toggle graph={this.graph} blockId={this.blockId} />;
    });
  }
}
customElements.define('example-toggle', ToggleBlock);
```

`src/Toggle.tsx`:
```tsx
import { createSignal } from 'solid-js';
import { getRoots, BlockGraphProperties } from '@blockprotocol/graph/stdlib';

interface ToggleProps {
  graph: BlockGraphProperties;
  blockId: string;
}

export default function Toggle(props: ToggleProps) {
  const [enabled, setEnabled] = createSignal(
    getRoots(props.graph.blockEntitySubgraph)[0]?.properties.enabled || false
  );

  const handleChange = (e: Event) => {
    const newValue = (e.target as HTMLInputElement).checked;
    setEnabled(newValue);
    props.graph.updateEntity({
      entityId: getRoots(props.graph.blockEntitySubgraph)[0].entityId,
      properties: { enabled: newValue }
    });
  };

  return (
    <label style={{ color: 'var(--vscode-foreground, #ccc)' }}>
      <input
        type="checkbox"
        checked={enabled()}
        onChange={handleChange}
        disabled={props.graph.readonly}
        aria-label="Toggle feature"
      />
      <span>Enable</span>
    </label>
  );
}
```

## 13. Vivafolio-Specific Optimizations

- The Vivafolio Host uses a minimal block loader in VS Code WebViews to bootstrap blocks, injecting initial data (e.g., `blockEntitySubgraph`) as props for custom elements. This enables fast hydration without block-side changes. Blocks remain standard and reusable in other hosts—do not add Vivafolio-specific logic. Test reusability with the /vivafolio-vs-code/apps/blockprotocol-poc application. 
