#!/usr/bin/env node

// Test file for complete Block Protocol integration
// This file demonstrates the realistic gui_state() API pattern

require('./vivafolio_helpers.js');

// Create color picker and square blocks
let selectedColor = color_picker(gui_state("#ff0000"));
show_square(selectedColor);

// Regular code continues...
console.log("Block Protocol integration test - color workflow");
console.log("Selected color:", selectedColor);
