# Vivafolio Runtime Path Tests

This directory contains test programs demonstrating Vivafolio's runtime path support for languages like Python and Ruby.

## Overview

The runtime path extends Vivafolio beyond compile-time languages (like Lean, Nim, etc.) to support dynamic languages that can execute programs and emit BlockSync notifications via stdout.

## Architecture

1. **Helper Libraries**: `vivafolio_helpers.{py,rb}` provide functions to create BlockSync notifications
2. **Test Programs**: Example programs that demonstrate block creation and state synchronization
3. **Extension Integration**: VS Code extension captures execution output and converts to diagnostics

## Quick Start

### Python
```bash
cd vivafolio
python3 test/runtime-path/python/two_blocks.py
```

### Ruby
```bash
cd vivafolio
ruby test/runtime-path/ruby/two_blocks.rb
```

### VS Code Integration
1. Open a Python or Ruby test file in VS Code
2. Press `Ctrl+Shift+R` to execute and render blocks
3. Interactive webviews will appear inline
4. Changes sync bidirectionally between UI and source code

## Files

### Python
- `vivafolio_helpers.py` - Helper functions for BlockSync emission
- `two_blocks.py` - Two-block synchronization demo
- `single_block.py` - Single block demo

### Ruby
- `vivafolio_helpers.rb` - Helper methods for BlockSync emission
- `two_blocks.rb` - Two-block synchronization demo
- `single_block.rb` - Single block demo

## BlockSync Format

Programs emit JSON Lines to stdout:

```json
{"blockId": "picker-123", "blockType": "color-picker", "initialGraph": {...}}
{"blockId": "square-456", "blockType": "color-square", "initialGraph": {...}}
```

## State Persistence

Block state is stored in source code comments:
- Python: `# gui_state: {"properties":{"color":"#ff0000"}}`
- Ruby: `# gui_state: {"properties":{"color":"#ff0000"}}`

## Development

### Adding New Languages

1. Create helper library with BlockSync emission functions
2. Implement `vivafolio_*` functions/methods
3. Add language support to extension's `executeRuntimeFile` function
4. Test with sample programs

### Extension Integration

The runtime path integrates seamlessly with Vivafolio's existing diagnostic system:
- Runtime execution → BlockSync parsing → Diagnostic creation → Webview rendering
- Same bidirectional synchronization as CTFE languages
- Reuses existing Block Protocol communication
