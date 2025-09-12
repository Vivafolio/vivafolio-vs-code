#!/usr/bin/env python3
"""
Vivafolio Python Runtime Path Demo - Two Blocks

This program demonstrates complete bidirectional state synchronization
between a color picker and color square using the Vivafolio runtime path.

Usage:
1. Open this file in VS Code with Vivafolio extension
2. Press Ctrl+Shift+R to execute
3. Interactive blocks will appear inline
4. Changes sync bidirectionally between UI and source code
"""

from vivafolio_helpers import vivafolio_picker, vivafolio_square, gui_state

# Vivafolio two blocks interaction demo
# This file demonstrates complete bidirectional state synchronization
vivafolio_picker()  # gui_state: {"properties":{"color":"#3700ff"}}
vivafolio_square()

# Regular Python code below
if __name__ == "__main__":
    print("Vivafolio blocks above will show interactive editors!")
    print("Edit the gui_state comment above and re-run (Ctrl+Shift+R) to see changes.")
