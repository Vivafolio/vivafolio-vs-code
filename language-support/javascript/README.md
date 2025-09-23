# Vivafolio JavaScript Runtime Library

This package provides helper functions for creating VivafolioBlock notifications that work with the Vivafolio VS Code extension's runtime path.

## Installation

```bash
npm install vivafolio
```

Or for development:

```bash
npm install
npm run build
```

## Usage

### Modern API (Recommended)

```javascript
const { gui_state, color_picker, show_square } = require('vivafolio');

// Store GUI state and create interactive blocks
const pickedColor = color_picker(gui_state("#ff0000"));
show_square(pickedColor);
```

### ES6 Modules

```javascript
import { gui_state, color_picker, show_square } from 'vivafolio';

// Store GUI state and create interactive blocks
const pickedColor = color_picker(gui_state("#ff0000"));
show_square(pickedColor);
```

## API Reference

### Functions

- `gui_state(value)` - Store GUI state values and return them
- `color_picker(color)` - Create an interactive color picker block
- `show_square(color)` - Display a color square block
- `emitVivafolioBlockNotification(...)` - Emit block notifications manually
- `createEntityGraph(entityId, properties)` - Create entity graph structures
- `createBlockResources(logicalName, physicalPath, cachingTag)` - Create resource definitions

## Integration with VS Code

When used in VS Code with the Vivafolio extension:

1. The functions emit JSON notifications to stdout
2. The extension captures these and creates interactive blocks
3. Users can modify values in the blocks
4. Changes sync back to the source code

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## TypeScript Support

This package includes full TypeScript definitions. All functions are properly typed with interfaces for:

- `EntityGraph` - Graph structure with entities and links
- `Entity` - Individual entity with ID and properties
- `BlockResource` - Resource definitions for blocks
- `VivafolioBlockNotification` - Complete notification structure

## Publishing

```bash
npm run build
npm publish
```
