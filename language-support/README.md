# Vivafolio Language Support Libraries

This directory contains runtime libraries for various programming languages that provide helper functions for creating VivafolioBlock notifications. These work with the Vivafolio VS Code extension's runtime path.

## Structure

```
language-support/
├── nim/           # Compile-time macros (uses nimsuggest for detection)
├── python/        # Runtime functions with state management
├── ruby/          # Runtime gem with GUI state registry
├── julia/         # Runtime package with stacktrace-based state
└── javascript/    # Runtime Node.js package with TypeScript support
```

## Common API

All language libraries provide similar APIs:

### Core Functions
- `gui_state(value)` - Store GUI state values and return them
- `color_picker(color)` - Create interactive color picker blocks
- `show_square(color)` - Display color square blocks

### Advanced Functions
- `emit_vivafolio_block_notification()` - Emit block notifications manually
- `create_entity_graph()` - Create entity graph structures
- `create_block_resources()` - Create resource definitions

## Usage Pattern

```python
# Python
from vivafolio import gui_state, color_picker, show_square

picked = color_picker(gui_state("#ff0000"))
show_square(picked)
```

```ruby
# Ruby
require 'vivafolio'

picked = color_picker(gui_state("#ff0000"))
show_square(picked)
```

```javascript
// JavaScript
const { gui_state, color_picker, show_square } = require('vivafolio');

const picked = color_picker(gui_state("#ff0000"));
show_square(picked);
```

## Integration

When used in VS Code with the Vivafolio extension:

1. Functions emit JSON notifications to stdout
2. Extension captures notifications and creates interactive blocks
3. Users interact with blocks in the editor
4. Changes sync back to source code

## Language-Specific Notes

### Nim
- Uses compile-time macros
- Diagnostics detected via `nimsuggest`
- Most reliable for editor integration

### Python/Ruby/JavaScript/Julia
- Use runtime function calls
- Emit JSON to stdout for capture
- Work with existing runtime-path infrastructure

## Installation

Each language has its own package management:

- **Nim**: Compile-time package (already integrated)
- **Python**: `pip install ./language-support/python`
- **Ruby**: `gem install ./language-support/ruby/vivafolio-0.1.0.gem`
- **Julia**: Add to Julia environment
- **JavaScript**: `npm install ./language-support/javascript`

## Development

Each language directory contains:
- Source code in appropriate structure
- Package configuration files
- README with language-specific instructions
- Example usage
