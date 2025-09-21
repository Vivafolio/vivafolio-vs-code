You can compile a TypeScript package to support both CommonJS (CJS) and ECMAScript Modules (ESM) by building separate outputs for each format and configuring your package.json to expose them conditionally. This is a common practice for npm packages to ensure compatibility across different environments, such as older Node.js versions that rely on CJS and modern setups that prefer ESM. While the ecosystem has improved with better Node.js interop, dual publishing remains necessary and can still feel messy due to manual configuration needs.

### Build Setup
To achieve this:
- Use TypeScript's compiler (tsc) with separate tsconfig.json files for each format, or a tool like tsup (recommended for simplicity) to handle bundling and outputs.
  - For CJS: Set `"module": "commonjs"` in tsconfig.cjs.json and output to a .cjs file (or directory).
  - For ESM: Set `"module": "node16"` or `"nodenext"` in tsconfig.esm.json and output to a .mjs file (or directory). Enable `"esModuleInterop": true` in both for better compatibility.
- If using tsup, configure it to produce both formats (e.g., via a tsup.config.ts file) with options like `format: ['cjs', 'esm']`, `dts: true` for declarations, and custom extensions (`.cjs` for CJS, `.mjs` for ESM).
- Generate TypeScript declarations (.d.ts files) during the build. For precision, create separate ones: .d.ts for ESM and .d.cts for CJS if your exports differ (e.g., using `export =` in CJS). In many cases, a single .d.ts set works if avoiding problematic default exports.
- Run builds via npm scripts, e.g., `"build": "tsc -p tsconfig.cjs.json && tsc -p tsconfig.esm.json"` or `"build": "tsup"`.

### package.json Configuration
Set your package.json to default to ESM with `"type": "module"`, then use the `"exports"` field to provide conditional paths for CJS and ESM consumers. This ensures Node.js loads the correct format based on `import` vs. `require`. Here's an example for a package with a main entry point at `src/index.ts`:

```json
{
  "name": "your-package",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",  // Fallback for older tools; points to CJS
  "module": "./dist/index.mjs",  // For bundlers like webpack/rollup
  "types": "./dist/index.d.ts",  // Primary types (ESM-style)
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      },
      "default": "./dist/index.mjs"  // Fallback to ESM
    }
  },
  "scripts": {
    "build": "tsup"  // Or your build command
  },
  "devDependencies": {
    "tsup": "^latest",
    "typescript": "^latest"
  }
}
```

- The `"exports"` map is key: It allows ESM users to `import` the .mjs file and CJS users to `require` the .cjs file.
- If your package includes binaries or subpaths, extend `"exports"` accordingly (e.g., for a CLI: add a `"bin"` field pointing to a .cjs file).
- Avoid default exports in your code to prevent interop issues; use named exports instead.

This setup works well in 2025, but test thoroughly in both CJS and ESM contexts (e.g., via `node --require` for CJS). If you encounter issues, tools like "Are the Types Wrong?" can help validate your published package.