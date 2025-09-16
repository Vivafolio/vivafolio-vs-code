#!/usr/bin/env node

/**
 * Vivafolio Runtime Path Helpers for JavaScript/Node.js
 *
 * This module provides helper functions for creating VivafolioBlock notifications
 * that work with the Vivafolio VS Code extension's runtime path.
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
 * @param {object} initialGraph - Initial graph data with entities and links
 * @param {object[]} [resources] - Optional array of resources (HTML files, etc.)
 */
function emitVivafolioBlockNotification(blockId, blockType, entityId, initialGraph, resources = null) {
  const notification = {
    blockId,
    blockType: `https://blockprotocol.org/@blockprotocol/types/block-type/${blockType}/`,
    displayMode: 'multi-line',
    entityId,
    initialGraph,
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

  const initialGraph = {
    entities: [{
      entityId,
      properties: { color }
    }],
    links: []
  };

  // Find HTML resource file
  const htmlPath = path.join(__dirname, '../../resources/blocks/color-picker.html');
  if (fs.existsSync(htmlPath)) {
    const resources = [{
      logicalName: 'index.html',
      physicalPath: `file://${path.resolve(htmlPath)}`,
      cachingTag: 'picker-v1'
    }];
    emitVivafolioBlockNotification(blockId, 'color-picker', entityId, initialGraph, resources);
  } else {
    emitVivafolioBlockNotification(blockId, 'color-picker', entityId, initialGraph);
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

  const initialGraph = {
    entities: [{
      entityId,
      properties: { color }
    }],
    links: []
  };

  // Find HTML resource file
  const htmlPath = path.join(__dirname, '../../resources/blocks/color-square.html');
  if (fs.existsSync(htmlPath)) {
    const resources = [{
      logicalName: 'index.html',
      physicalPath: `file://${path.resolve(htmlPath)}`,
      cachingTag: 'square-v1'
    }];
    emitVivafolioBlockNotification(blockId, 'color-square', entityId, initialGraph, resources);
  } else {
    emitVivafolioBlockNotification(blockId, 'color-square', entityId, initialGraph);
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

// Export functions for use as module
module.exports = {
  extractGuiStateFromSource,
  emitVivafolioBlockNotification,
  vivafolioPicker,
  vivafolioSquare,
  guiState
};

// Also make them available globally for direct script execution
global.vivafolioPicker = vivafolioPicker;
global.vivafolioSquare = vivafolioSquare;
global.guiState = guiState;
