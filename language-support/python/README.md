# Vivafolio Python Runtime Library

This package provides helper functions for creating VivafolioBlock notifications that work with the Vivafolio VS Code extension's runtime path.

## Installation

```bash
pip install .
```

Or for development:

```bash
pip install -e .
```

## Usage

### Modern API (Recommended)

```python
from vivafolio import gui_state, color_picker, show_square

# Store GUI state and create interactive blocks
picked_color = color_picker(gui_state("#ff0000"))
show_square(picked_color)
```

### Legacy API (for compatibility)

```python
from vivafolio import vivafolio_picker, vivafolio_square

# Create blocks that read state from comments
vivafolio_picker()  # gui_state: {"properties":{"color":"#ff0000"}}
vivafolio_square()
```

## API Reference

### Core Functions

- `gui_state(value)` - Store GUI state values and return them
- `color_picker(color)` - Create an interactive color picker block
- `show_square(color)` - Display a color square block

### Legacy Functions

- `vivafolio_picker()` - Create color picker (reads state from comments)
- `vivafolio_square()` - Create color square (reads state from comments)

## Integration with VS Code

When used in VS Code with the Vivafolio extension:

1. The functions emit JSON notifications to stdout
2. The extension captures these and creates interactive blocks
3. Users can modify values in the blocks
4. Changes sync back to the source code

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black .

# Lint code
flake8 .
```
