/**
 * Vivafolio JavaScript/Node.js Runtime Library
 *
 * This library provides helper functions for creating VivafolioBlock notifications
 * that work with the Vivafolio VS Code extension's runtime path.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface EntityGraph {
  entities: Entity[];
  links: Link[];
}

export interface Entity {
  entityId: string;
  properties: Record<string, any>;
}

export interface Link {
  sourceEntityId: string;
  destinationEntityId: string;
  [key: string]: any;
}

export interface BlockResource {
  logicalName: string;
  physicalPath: string;
  cachingTag: string;
}

export interface VivafolioBlockNotification {
  blockId: string;
  blockType: string;
  displayMode: string;
  entityId: string;
  entityGraph: EntityGraph;
  supportsHotReload: boolean;
  initialHeight: number;
  resources?: BlockResource[];
}

// Global registry for GUI state
const stateRegistry: Map<string, any> = new Map();

/**
 * gui_state() - Store and retrieve GUI state values
 *
 * This function stores the provided value and returns it, allowing it to be used
 * in variable assignments while also making the state available for GUI blocks.
 *
 * @param value - The value to store and return
 * @returns The same value that was passed in
 */
export function gui_state<T>(value: T): T {
  // Use caller location as a key to associate values with specific code locations
  const error = new Error();
  const stack = error.stack?.split('\n');
  if (stack && stack.length > 2) {
    // Extract file and line from stack trace
    const callerLine = stack[2];
    const match = callerLine.match(/\(([^:]+):(\d+):\d+\)/) || callerLine.match(/at\s+([^:]+):(\d+):\d+/);
    if (match) {
      const [, file, line] = match;
      const key = `${file}:${line}`;
      stateRegistry.set(key, value);
    }
  }

  return value;
}

/**
 * Create an interactive color picker block
 *
 * @param colorValue - Color value (e.g., "#ffffff" or "#ff0000")
 * @returns The color value (unchanged)
 */
export function color_picker(colorValue: string): string {
  // Create deterministic IDs based on the color value
  const colorHash = createHash('md5').update(colorValue).digest('hex').substring(0, 8);
  const blockId = `color-picker-${colorHash}`;
  const entityId = `color-entity-${colorHash}`;

  const entityGraph: EntityGraph = {
    entities: [{
      entityId,
      properties: { color: colorValue }
    }],
    links: []
  };

  // Find HTML resource file
  let resources: BlockResource[] | undefined;
  const htmlPath = path.join(__dirname, '../../../blocks/color-picker/dist/index.html');
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
 * Display a color square block
 *
 * @param colorValue - Color value to display
 * @returns The color value (unchanged)
 */
export function show_square(colorValue: string): string {
  // Create deterministic IDs based on the color value
  const colorHash = createHash('md5').update(colorValue).digest('hex').substring(0, 8);
  const blockId = `color-square-${colorHash}`;
  const entityId = `square-entity-${colorHash}`;

  const entityGraph: EntityGraph = {
    entities: [{
      entityId,
      properties: { color: colorValue }
    }],
    links: []
  };

  // Find HTML resource file
  let resources: BlockResource[] | undefined;
  const htmlPath = path.join(__dirname, '../../../blocks/color-square/dist/index.html');
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

/**
 * Emit a VivafolioBlock notification to stdout for the Vivafolio extension
 *
 * @param blockId - Unique identifier for this block instance
 * @param blockType - Type of block (e.g., 'color-picker', 'color-square')
 * @param entityId - Entity identifier
 * @param entityGraph - Initial graph data with entities and links
 * @param resources - Optional list of resources (HTML files, etc.)
 * @param displayMode - Display mode ('multi-line' or 'inline')
 * @param initialHeight - Initial height for the block
 */
export function emitVivafolioBlockNotification(
  blockId: string,
  blockType: string,
  entityId: string,
  entityGraph: EntityGraph,
  resources?: BlockResource[],
  displayMode: string = 'multi-line',
  initialHeight: number = 200
): void {
  const notification: VivafolioBlockNotification = {
    blockId,
    blockType: `https://blockprotocol.org/@blockprotocol/types/block-type/${blockType}/`,
    displayMode,
    entityId,
    entityGraph,
    supportsHotReload: false,
    initialHeight
  };

  if (resources) {
    notification.resources = resources;
  }

  // Emit as JSON line to stdout
  console.log(JSON.stringify(notification));
}

/**
 * Create a basic entity graph with a single entity
 *
 * @param entityId - Unique identifier for the entity
 * @param properties - Properties dictionary for the entity
 * @returns Entity graph structure
 */
export function createEntityGraph(entityId: string, properties: Record<string, any>): EntityGraph {
  return {
    entities: [{
      entityId,
      properties
    }],
    links: []
  };
}

/**
 * Create block resources array
 *
 * @param logicalName - Logical name of the resource
 * @param physicalPath - Physical file path
 * @param cachingTag - Cache busting tag
 * @returns Resources array
 */
export function createBlockResources(
  logicalName: string,
  physicalPath: string,
  cachingTag: string
): BlockResource[] {
  return [{
    logicalName,
    physicalPath,
    cachingTag
  }];
}

// Default export
export default {
  gui_state,
  color_picker,
  show_square,
  emitVivafolioBlockNotification,
  createEntityGraph,
  createBlockResources
};





