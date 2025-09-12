#!/usr/bin/env node

/**
 * Vivafolio JavaScript Runtime Path Demo - Two Blocks
 *
 * This program demonstrates complete bidirectional state synchronization
 * between a color picker and color square using the Vivafolio runtime path.
 *
 * Usage:
 * 1. Open this file in VS Code with Vivafolio extension
 * 2. Press Ctrl+Shift+R to execute
 * 3. Interactive blocks will appear inline
 * 4. Changes sync bidirectionally between UI and source code
 */

require('./vivafolio_helpers.js');

// Vivafolio two blocks interaction demo
// This file demonstrates complete bidirectional state synchronization
vivafolioPicker(); // gui_state: {"properties":{"color":"#3700ff"}}
vivafolioSquare();

// Regular JavaScript code below
console.log('Vivafolio blocks above will show interactive editors!');
console.log('Edit the gui_state comment above and re-run (Ctrl+Shift+R) to see changes.');
