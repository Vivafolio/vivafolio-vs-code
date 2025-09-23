# Two Blocks Test Specification

## Overview

The `two_blocks` test is a language-agnostic integration test that verifies the correct implementation of Vivafolio block emission across all supported languages and communication mechanisms. This test ensures that equivalent VivafolioBlock notifications are produced regardless of whether a language uses LSP server diagnostics or runtime script execution.

## Expected Behavior

### Test Structure

The `two_blocks` test consists of two interactive Vivafolio blocks:

1. **Color Picker Block** - Interactive color selection widget
2. **Color Square Block** - Read-only display that shows the color selected by the picker

### Block Synchronization

The blocks demonstrate **unidirectional state synchronization** from picker to square:

- Changes in the color picker block are reflected in the color square block through the shared color variable
- The color square block displays the color but does not allow color changes (read-only)
- The test verifies that data flow through the color variable works correctly from picker to square
- State is persisted inline using `gui_state` as a function parameter

### Test Structure

The `two_blocks` test follows a clear separation of concerns with three components:

#### 1. Official Vivafolio Package (`language-support/<lang>/src/vivafolio`)

A language-specific package providing the core Vivafolio functionality:

- **`gui_state` function**: Identity function that preserves block state
- **Core block emission**: Functions to emit VivafolioBlock notifications
- **Language-specific helpers**: Macros/templates adapted to the target language

#### 2. Library Module (`language-support/<lang>/examples/example_blocks`)

A reusable library defining block abstractions:

- **`color_picker` function/macro**: Creates an interactive color picker block
- **`color_square` function/macro**: Creates a read-only color display block
- **Imports the official vivafolio package**

#### 3. Application Module (`language-support/<lang>/examples/two_blocks`)

An application that imports the library and produces the two blocks:

- **Imports the library module** (`example_blocks`)
- **Calls `color_picker(gui_state("#aabbcc"))`**: Creates picker with initial state
- **Calls `color_square(color)`**: Creates square that syncs with picker's color
- **Blocks emit diagnostics pointing to these application lines**

### Block Emission Location

For LSP-based languages, VivafolioBlock notifications are emitted as diagnostics that **point to the lines in the application module** where the block functions are called, not the library definitions. This allows developers to see block diagnostics at the point of use in their application code.

### Example Structure (Pseudo-code)

```python
# language-support/python/src/vivafolio/__init__.py
def gui_state(value):
    """Identity function that preserves block state"""
    return value

def emit_block(block_type, entity_id, source_location, properties):
    """Emit VivafolioBlock notification with the specified source location"""
    # Implementation varies by language...
```

```python
# language-support/python/examples/example_blocks.py
from vivafolio import gui_state

def color_picker(initial_color="#aabbcc"):
    """Create an interactive color picker block"""
    # Emits VivafolioBlock notification for color-picker
    # Diagnostic points to caller's line in application code
    pass

def color_square(color):
    """Create a read-only color display block"""
    # Emits VivafolioBlock notification for color-square
    # Uses the color parameter from the picker
    pass
```

```python
# language-support/python/examples/two_blocks.py
from example_blocks import color_picker, color_square

# These calls emit diagnostics pointing to these exact lines
color = color_picker(gui_state("#aabbcc"))  # Line N: picker diagnostic
color_square(color)                         # Line N+1: square diagnostic
```

### Expected Output

The test expects exactly **2 VivafolioBlock notifications** to be emitted. The format shown below follows the LSP server protocol specification (source of truth). Runtime implementations may use slightly different entity IDs and block types but must produce equivalent functional behavior:

#### Block 1: Color Picker
```json
{
  "blockId": "picker-<line-number>",
  "blockType": "https://blockprotocol.org/@vivafolio/types/block-type/color-picker/",
  "displayMode": "multi-line",
  "sourceUri": "file://<path-to-application-module>",
  "range": {
    "start": {"line": <line-number>, "character": 0},
    "end": {"line": <line-number>, "character": 20}
  },
  "entityId": "color-picker",
  "entityGraph": {
    "entities": [{
      "entityId": "color-picker",
      "properties": {"color": "#<hex-color>"}
    }],
    "links": []
  },
  "supportsHotReload": false,
  "initialHeight": 200,
  "resources": [{
    "logicalName": "app.html",
    "physicalPath": "file://<path-to-color-picker-html>",
    "cachingTag": "color-picker-<timestamp>"
  }]
}
```

#### Block 2: Color Square
```json
{
  "blockId": "square-<line-number>",
  "blockType": "https://blockprotocol.org/@vivafolio/types/block-type/color-square/",
  "displayMode": "multi-line",
  "sourceUri": "file://<path-to-application-module>",
  "range": {
    "start": {"line": <line-number>, "character": 0},
    "end": {"line": <line-number>, "character": 20}
  },
  "entityId": "color-square",
  "entityGraph": {
    "entities": [{
      "entityId": "color-square",
      "properties": {"color": "#<hex-color>"}
    }],
    "links": []
  },
  "supportsHotReload": false,
  "initialHeight": 200,
  "resources": [{
    "logicalName": "app.html",
    "physicalPath": "file://<path-to-color-square-html>",
    "cachingTag": "color-square-<timestamp>"
  }]
}
```

## Communication Mechanisms

### LSP Server (Languages like Nim)

For languages that use LSP servers (Language Server Protocol), VivafolioBlock notifications are emitted as diagnostic messages during compilation/parsing:

- **Nim** (nimlsp, nimlangserver, nimsuggest): Blocks emitted via compile-time macros
- Diagnostics are collected by the LSP client and forwarded to the Vivafolio extension

### Runtime Execution (Languages like Python, Ruby, JavaScript, Julia)

For languages that use runtime execution, scripts are executed and emit VivafolioBlock notifications to stdout:

- **Python**: `python3 two_blocks.py`
- **Ruby**: `ruby two_blocks.rb`
- **JavaScript**: `node two_blocks.js`
- **Julia**: `julia two_blocks.jl`

The LangExecutor captures stdout and parses JSON lines into VivafolioBlock notifications.

### Hot Code Reload (Future)

The HcrLangExecutor will provide real-time block discovery during interactive development sessions.

## Verification

The stand-alone test runner (`test/stand-alone-runner.js`) verifies equivalent behavior across all communication mechanisms:

- **Success**: Exactly 2 valid VivafolioBlock notifications found
- **Failure**: Different number of blocks or invalid block format
- **Logging**: Full command output and stderr saved to timestamped log files
- **Cross-Language Consistency**: Same block structure regardless of language or mechanism

## Implementation Notes

### State Persistence

Block state is persisted in source code using a function-like construct called `gui_state`:

```nim
var color = vivafolio_color_picker gui_state"#aabbcc"
```

### Resource Loading

Blocks reference HTML resources for their UI implementation:

- Color picker: `blocks/color-picker/dist/index.html`
- Color square: `blocks/color-square/dist/index.html`

### Error Handling

Invalid block configurations should emit appropriate error diagnostics (tested separately in callsite tests).

## Testing Commands

Run specific two_blocks tests:

```bash
# Test all two_blocks scenarios
just test-stand-alone two-blocks

# Test specific language
just test-stand-alone python
just test-stand-alone nim

# Test specific scenario and language
just test-stand-alone nim two-blocks
```

## Purpose

The `two_blocks` test ensures that:

1. **Language Agnostic**: Vivafolio works consistently across all supported languages
2. **Mechanism Agnostic**: Equivalent results from LSP, runtime, and future HCR mechanisms
3. **Block Protocol Compliance**: Correct VivafolioBlock notification format
4. **Data Flow**: Variable-based data flow from picker to square works correctly
5. **Resource Integration**: Proper loading of HTML block implementations
