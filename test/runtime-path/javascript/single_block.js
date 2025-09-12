#!/usr/bin/env node

/**
 * Vivafolio JavaScript Runtime Path Demo - Single Block
 *
 * This program demonstrates a single color picker block using the Vivafolio runtime path.
 *
 * Usage:
 * 1. Open this file in VS Code with Vivafolio extension
 * 2. Press Ctrl+Shift+R to execute
 * 3. Interactive color picker will appear inline
 */

require('./vivafolio_helpers.js');

// Vivafolio single block demo
vivafolioPicker(); // gui_state: {"properties":{"color":"#ff0000"}}

// Regular JavaScript code below
console.log('Vivafolio color picker above will show interactive editor!');
console.log('Pick a color and see the gui_state comment update automatically.');
