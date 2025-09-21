#!/usr/bin/env node

/**
 * Vivafolio JavaScript Runtime Path Demo - Realistic API
 *
 * This program demonstrates the new realistic API pattern:
 *   let color = color_picker(gui_state("#ffffff"))
 *   show_square(color)
 *
 * Usage:
 * 1. Open this file in VS Code with Vivafolio extension
 * 2. Press Ctrl+Shift+R to execute
 * 3. Interactive blocks will appear inline
 * 4. Changes sync bidirectionally between UI and source code
 */

require('./vivafolio_helpers.js');

// Vivafolio realistic API demo
// This demonstrates the new gui_state() pattern
let color = color_picker(gui_state("#ffffff"));
show_square(color);

// Regular JavaScript code below
console.log('Vivafolio blocks above will show interactive editors!');
console.log('The color value flows from gui_state() → color_picker() → show_square()');
console.log('Edit the gui_state() call and re-run (Ctrl+Shift+R) to see changes.');
