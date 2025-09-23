#!/usr/bin/env python3
"""
Vivafolio Language Support Examples

Common usage patterns across all supported languages.
This script demonstrates the API without actually importing packages.
"""

print("=== Common API Across Languages ===")
print()
print("# All languages support similar APIs:")
print()
print("Python:")
print("  from vivafolio import gui_state, color_picker, show_square")
print("  picked = color_picker(gui_state('#ff0000'))")
print("  show_square(picked)")
print()
print("Ruby:")
print("  require 'vivafolio'")
print("  picked = color_picker(gui_state('#ff0000'))")
print("  show_square(picked)")
print()
print("JavaScript:")
print("  const { gui_state, color_picker, show_square } = require('vivafolio');")
print("  const picked = color_picker(gui_state('#ff0000'));")
print("  show_square(picked);")
print()
print("Julia:")
print("  using Vivafolio")
print("  picked = color_picker(gui_state('#ff0000'))")
print("  show_square(picked)")
print()
print("Nim (compile-time):")
print("  import vivafolio")
print("  var picked = color_picker(gui_state('#ff0000'))")
print("  show_square(picked)")
print()
print("=== All emit JSON notifications to stdout for VS Code integration ===")
