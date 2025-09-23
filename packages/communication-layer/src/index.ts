/**
 * Vivafolio Communication Layer
 *
 * Abstract interface for different mechanisms to discover and communicate with
 * Vivafolio blocks in various programming languages and execution environments.
 */

export interface VivafolioBlockNotification {
  blockId: string;
  blockType: string;
  displayMode: string;
  sourceUri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  entityId: string;
  entityGraph: {
    entities: Array<{
      entityId: string;
      properties: Record<string, any>;
    }>;
    links: any[];
  };
  supportsHotReload: boolean;
  initialHeight: number;
  resources?: Array<{
    logicalName: string;
    physicalPath: string;
    cachingTag: string;
  }>;
}

export interface CommunicationResult {
  success: boolean;
  blocks: VivafolioBlockNotification[];
  error?: string;
  logPath?: string;
}

/**
 * Abstract communication layer for discovering Vivafolio blocks.
 *
 * This interface allows different mechanisms to discover blocks:
 * - LSP connections for compile-time diagnostics
 * - Script execution for runtime block emission
 * - Hot-reload connections for interactive development
 */
export abstract class CommunicationLayer {
  /**
   * Discover Vivafolio blocks in the given file or project.
   *
   * @param filePath - Path to the file to analyze
   * @param options - Language-specific options
   * @returns Promise resolving to communication result with discovered blocks
   */
  abstract discoverBlocks(
    filePath: string,
    options?: Record<string, any>
  ): Promise<CommunicationResult>;

  /**
   * Get the type of communication layer.
   */
  abstract getType(): CommunicationLayerType;

  /**
   * Clean up resources if needed.
   */
  cleanup?(): Promise<void>;
}

export enum CommunicationLayerType {
  LSP = 'lsp',
  LANG_EXECUTOR = 'lang_executor',
  HCR_LANG_EXECUTOR = 'hcr_lang_executor'
}

export interface CommunicationLayerFactory {
  create(language: string, options?: Record<string, any>): CommunicationLayer;
}

/**
 * Utility function to validate a VivafolioBlock notification structure.
 */
export function validateVivafolioBlock(block: any): block is VivafolioBlockNotification {
  return (
    typeof block === 'object' &&
    typeof block.blockId === 'string' &&
    typeof block.blockType === 'string' &&
    typeof block.displayMode === 'string' &&
    typeof block.sourceUri === 'string' &&
    typeof block.range === 'object' &&
    typeof block.range.start === 'object' &&
    typeof block.range.end === 'object' &&
    typeof block.entityId === 'string' &&
    typeof block.entityGraph === 'object' &&
    Array.isArray(block.entityGraph.entities) &&
    Array.isArray(block.entityGraph.links) &&
    typeof block.supportsHotReload === 'boolean' &&
    typeof block.initialHeight === 'number'
  );
}

/**
 * Parse VivafolioBlock notifications from various sources.
 */
export class BlockParser {
  /**
   * Parse blocks from LSP diagnostics.
   */
  static fromLspDiagnostics(diagnostics: any[]): VivafolioBlockNotification[] {
    const blocks: VivafolioBlockNotification[] = [];

    for (const diagnostic of diagnostics) {
      // Look for vivafolio: prefix in diagnostic messages
      if (diagnostic.message && diagnostic.message.startsWith('vivafolio: ')) {
        try {
          const jsonStr = diagnostic.message.substring('vivafolio: '.length);
          const block = JSON.parse(jsonStr);
          if (validateVivafolioBlock(block)) {
            blocks.push(block);
          }
        } catch (e) {
          // Invalid JSON, skip
          continue;
        }
      }
    }

    return blocks;
  }

  /**
   * Parse blocks from stdout lines (runtime execution).
   */
  static fromStdoutLines(lines: string[]): VivafolioBlockNotification[] {
    const blocks: VivafolioBlockNotification[] = [];

    console.log(`BlockParser processing ${lines.length} lines:`);
    lines.forEach((line, i) => {
      console.log(`  Line ${i}: ${line.substring(0, 100)}...`);
    });

    for (const line of lines) {
      try {
        let jsonStr = line.trim();

        // Skip empty lines
        if (!jsonStr) continue;

        // Handle nimsuggest format: "vivafolio: {...}"
        if (jsonStr.startsWith('vivafolio: ')) {
          jsonStr = jsonStr.substring('vivafolio: '.length);
        }

        console.log(`Attempting to parse: ${jsonStr.substring(0, 50)}...`);
        const block = JSON.parse(jsonStr);
        if (validateVivafolioBlock(block)) {
          console.log(`Successfully parsed block: ${block.blockId}`);
          blocks.push(block);
        } else {
          console.log(`Parsed object but not valid block`);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.log(`Failed to parse line as JSON: ${line.substring(0, 50)}... - ${errorMessage}`);
        continue;
      }
    }

    console.log(`BlockParser found ${blocks.length} valid blocks`);
    return blocks;
  }
}
