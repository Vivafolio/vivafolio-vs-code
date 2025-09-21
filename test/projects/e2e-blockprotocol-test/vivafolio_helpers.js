#!/usr/bin/env node

/**
 * Vivafolio Runtime Path Helpers for JavaScript/Node.js
 *
 * This module provides helper functions for creating VivafolioBlock notifications
 * that work with the Vivafolio VS Code extension's runtime path.
 *
 * New realistic API (as requested):
 *   let color = color_picker(gui_state("#ffffff"))
 *   show_square(color)
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract gui_state from source code comments for the given block type
 *
 * @param {string[]} sourceLines - Array of source code lines
 * @param {string} blockType - Type of block ("picker" or "square")
 * @returns {object} Extracted state or default state
 */
function extractGuiStateFromSource(sourceLines, blockType) {
  for (const line of sourceLines) {
    // Look for gui_state comments like: // gui_state: {"color": "#ff0000"}
    const match = line.match(/\/\/ gui_state:\s*(\{.*\})/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e) {
        // Continue to next line if parsing fails
      }
    }
  }

  // Default states
  if (blockType === 'picker') {
    return { properties: { color: '#3700ff' } }; // Default blue
  } else if (blockType === 'square') {
    return { properties: { color: '#3700ff' } }; // Match picker default
  } else {
    return { properties: {} };
  }
}

/**
 * Emit a VivafolioBlock notification to stdout for the Vivafolio extension
 *
 * @param {string} blockId - Unique identifier for this block instance
 * @param {string} blockType - Type of block (e.g., "color-picker", "color-square")
 * @param {string} entityId - Entity identifier
 * @param {object} entityGraph - Initial graph data with entities and links
 * @param {object[]} [resources] - Optional array of resources (HTML files, etc.)
 */
function emitVivafolioBlockNotification(blockId, blockType, entityId, entityGraph, resources = null) {
  const notification = {
    blockId,
    blockType: `https://blockprotocol.org/@blockprotocol/types/block-type/${blockType}/`,
    displayMode: 'multi-line',
    entityId,
    entityGraph,
    supportsHotReload: false,
    initialHeight: 200
  };

  if (resources) {
    notification.resources = resources;
  }

  // Emit as JSON line to stdout
  console.log(JSON.stringify(notification));
}

/**
 * Create a color picker block
 *
 * @param {string} [blockId="picker-123"] - Unique identifier for this picker instance
 */
function vivafolioPicker(blockId = 'picker-123') {
  // Get the caller's source code to extract gui_state
  const stack = new Error().stack;
  let color = '#3700ff'; // default

  if (stack) {
    // Try to extract source file from stack trace
    const stackLines = stack.split('\n');
    for (const line of stackLines) {
      const match = line.match(/at.*\((.*):\d+:\d+\)/) || line.match(/at (.*):\d+:\d+/);
      if (match && match[1] && fs.existsSync(match[1])) {
        try {
          const sourceLines = fs.readFileSync(match[1], 'utf8').split('\n');
          const currentState = extractGuiStateFromSource(sourceLines, 'picker');
          color = currentState.properties?.color || '#3700ff';
          break;
        } catch (e) {
          // Continue with default color
        }
      }
    }
  }

  const entityId = `entity-${blockId}`;

  const entityGraph = {
    entities: [{
      entityId,
      properties: { color }
    }],
    links: []
  };

  // Find HTML resource file
  const htmlPath = path.join(__dirname, '../../../blocks/color-picker/dist/index.html');
  if (fs.existsSync(htmlPath)) {
    const resources = [{
      logicalName: 'index.html',
      physicalPath: `file://${path.resolve(htmlPath)}`,
      cachingTag: 'picker-v2'
    }];
    emitVivafolioBlockNotification(blockId, 'color-picker', entityId, entityGraph, resources);
  } else {
    emitVivafolioBlockNotification(blockId, 'color-picker', entityId, entityGraph);
  }
}

/**
 * Create a color square block that syncs with the picker
 *
 * @param {string} [blockId="square-456"] - Unique identifier for this square instance
 */
function vivafolioSquare(blockId = 'square-456') {
  // Get the caller's source code to extract gui_state
  const stack = new Error().stack;
  let color = '#3700ff'; // default

  if (stack) {
    // Try to extract source file from stack trace
    const stackLines = stack.split('\n');
    for (const line of stackLines) {
      const match = line.match(/at.*\((.*):\d+:\d+\)/) || line.match(/at (.*):\d+:\d+/);
      if (match && match[1] && fs.existsSync(match[1])) {
        try {
          const sourceLines = fs.readFileSync(match[1], 'utf8').split('\n');
          const currentState = extractGuiStateFromSource(sourceLines, 'square');
          color = currentState.properties?.color || '#3700ff';
          break;
        } catch (e) {
          // Continue with default color
        }
      }
    }
  }

  const entityId = `entity-${blockId}`;

  const entityGraph = {
    entities: [{
      entityId,
      properties: { color }
    }],
    links: []
  };

  // Find HTML resource file
  const htmlPath = path.join(__dirname, '../../../blocks/color-square/dist/index.html');
  if (fs.existsSync(htmlPath)) {
    const resources = [{
      logicalName: 'index.html',
      physicalPath: `file://${path.resolve(htmlPath)}`,
      cachingTag: 'square-v2'
    }];
    emitVivafolioBlockNotification(blockId, 'color-square', entityId, entityGraph, resources);
  } else {
    emitVivafolioBlockNotification(blockId, 'color-square', entityId, entityGraph);
  }
}

/**
 * Helper to format gui_state for inclusion in source code
 *
 * @param {object} stateDict - State dictionary to format
 * @returns {string} Formatted state string for use in source code
 */
function guiState(stateDict) {
  return `// gui_state: ${JSON.stringify(stateDict)}`;
}

// ===== NEW REALISTIC API =====

/**
 * gui_state() - Store and retrieve GUI state values
 *
 * This function stores the provided value and returns it, allowing it to be used
 * in variable assignments while also making the state available for GUI blocks.
 *
 * @param {*} value - The value to store and return
 * @returns {*} The same value that was passed in
 */
function gui_state(value) {
  // Store the value in a global registry for later retrieval by GUI functions
  if (!global.vivafolioGuiState) {
    global.vivafolioGuiState = {};
  }

  // Use caller location as a key to associate values with specific code locations
  const callerInfo = getCallerInfo();
  const key = `${callerInfo.file}:${callerInfo.line}`;

  global.vivafolioGuiState[key] = value;

  return value;
}

/**
 * Get caller information from stack trace
 */
function getCallerInfo() {
  const stack = new Error().stack;
  if (!stack) return { file: 'unknown', line: 0 };

  const stackLines = stack.split('\n');
  // Find the caller (skip this function and gui_state)
  for (let i = 0; i < stackLines.length; i++) {
    const line = stackLines[i];
    const match = line.match(/at.*\((.*):(\d+):\d+\)/) || line.match(/at (.*):(\d+):\d+/);
    if (match && match[1] !== __filename) {
      return {
        file: match[1],
        line: parseInt(match[2])
      };
    }
  }

  return { file: 'unknown', line: 0 };
}

/**
 * color_picker() - Create an interactive color picker block
 *
 * This function takes a color value (from gui_state) and creates an interactive
 * color picker block. As a side effect, it emits a VivafolioBlock notification.
 *
 * @param {string} colorValue - Color value (e.g., "#ffffff" or "#ff0000")
 * @returns {string} The color value (unchanged)
 */
function color_picker(colorValue) {
  // Emit VivafolioBlock notification as side effect
  const blockId = 'color-picker-' + Date.now();
  const entityId = 'color-entity-' + Date.now();

  const entityGraph = {
    entities: [{
      entityId,
      properties: { color: colorValue }
    }],
    links: []
  };

  // Find HTML resource file
  const htmlPath = path.join(__dirname, '../../../blocks/color-picker/dist/index.html');
  let resources = null;
  if (fs.existsSync(htmlPath)) {
    resources = [{
      logicalName: 'index.html',
      physicalPath: `file://${path.resolve(htmlPath)}`,
      cachingTag: 'picker-v2'
    }];
  }

  emitVivafolioBlockNotification(blockId, 'color-picker', entityId, entityGraph, resources);

  // Return the color value unchanged
  return colorValue;
}

/**
 * show_square() - Display a color square block
 *
 * This function takes a color value and displays it in a color square block.
 * As a side effect, it emits a VivafolioBlock notification.
 *
 * @param {string} colorValue - Color value to display
 * @returns {string} The color value (unchanged)
 */
function show_square(colorValue) {
  // Emit VivafolioBlock notification as side effect
  const blockId = 'color-square-' + Date.now();
  const entityId = 'square-entity-' + Date.now();

  const entityGraph = {
    entities: [{
      entityId,
      properties: { color: colorValue }
    }],
    links: []
  };

  // Find HTML resource file
  const htmlPath = path.join(__dirname, '../../../blocks/color-square/dist/index.html');
  let resources = null;
  if (fs.existsSync(htmlPath)) {
    resources = [{
      logicalName: 'index.html',
      physicalPath: `file://${path.resolve(htmlPath)}`,
      cachingTag: 'square-v2'
    }];
  }

  emitVivafolioBlockNotification(blockId, 'color-square', entityId, entityGraph, resources);

  // Return the color value unchanged
  return colorValue;
}

// Export functions for use as module
module.exports = {
  extractGuiStateFromSource,
  emitVivafolioBlockNotification,
  vivafolioPicker,
  vivafolioSquare,
  guiState,
  // New realistic API
  gui_state,
  color_picker,
  show_square
};

// Also make them available globally for direct script execution
global.vivafolioPicker = vivafolioPicker;
global.vivafolioSquare = vivafolioSquare;
global.guiState = guiState;
// New realistic API
global.gui_state = gui_state;
global.color_picker = color_picker;
global.show_square = show_square;
