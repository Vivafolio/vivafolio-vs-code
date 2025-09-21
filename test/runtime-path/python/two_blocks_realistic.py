#!/usr/bin/env python3

"""
Vivafolio Python Runtime Path Demo - Realistic API

This program demonstrates the new realistic API pattern:
  color = color_picker(gui_state("#ffffff"))
  show_square(color)

Usage:
1. Open this file in VS Code with Vivafolio extension
2. Press Ctrl+Shift+R to execute
3. Interactive blocks will appear inline
4. Changes sync bidirectionally between UI and source code
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from vivafolio_helpers import gui_state, color_picker, show_square

# Vivafolio realistic API demo
# This demonstrates the new gui_state() pattern
color = color_picker(gui_state("#ffffff"))
show_square(color)

# Regular Python code below
print("Vivafolio blocks above will show interactive editors!")
print("The color value flows from gui_state() → color_picker() → show_square()")
print("Edit the gui_state() call and re-run (Ctrl+Shift+R) to see changes.")
