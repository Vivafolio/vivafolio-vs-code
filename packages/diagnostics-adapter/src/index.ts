/**
 * Vivafolio Diagnostics Adapter
 *
 * Handles language-specific fixups and transformations for LSP diagnostics.
 * Different languages may append strings, decorations, or other artifacts
 * to diagnostic messages that need to be cleaned up before parsing
 * VivafolioBlock notifications.
 */

import {
  VivafolioBlockNotification,
  BlockParser
} from '@vivafolio/communication-layer';

export interface DiagnosticAdapter {
  /**
   * Clean and adapt raw diagnostic messages for a specific language.
   *
   * @param diagnostics - Raw LSP diagnostics
   * @returns Adapted VivafolioBlock notifications
   */
  adaptDiagnostics(diagnostics: any[]): VivafolioBlockNotification[];

  /**
   * Get the language this adapter handles.
   */
  getLanguage(): string;
}

/**
 * Base diagnostic adapter with common functionality.
 */
export abstract class BaseDiagnosticAdapter implements DiagnosticAdapter {
  protected language: string;

  constructor(language: string) {
    this.language = language;
  }

  getLanguage(): string {
    return this.language;
  }

  /**
   * Pre-process diagnostic messages before parsing.
   * Override in subclasses for language-specific cleaning.
   */
  protected preprocessMessage(message: string): string {
    return message;
  }

  adaptDiagnostics(diagnostics: any[]): VivafolioBlockNotification[] {
    const processedDiagnostics = diagnostics.map(diagnostic => ({
      ...diagnostic,
      message: this.preprocessMessage(diagnostic.message || '')
    }));

    return BlockParser.fromLspDiagnostics(processedDiagnostics);
  }
}

/**
 * Nim diagnostic adapter.
 * Nim LSPs may add extra information or formatting.
 */
export class NimDiagnosticAdapter extends BaseDiagnosticAdapter {
  constructor() {
    super('nim');
  }

  protected preprocessMessage(message: string): string {
    // Nim LSPs sometimes add extra newlines or formatting
    // Clean up any trailing whitespace or newlines
    let cleaned = message.trim();

    // Remove any extra decorations that Nim LSP might add
    // For example: remove ANSI color codes if present
    cleaned = cleaned.replace(/\x1b\[[0-9;]*m/g, '');

    // Ensure vivafolio: prefix is preserved if present
    if (cleaned.includes('vivafolio:')) {
      // Extract just the JSON part after vivafolio:
      const match = cleaned.match(/vivafolio:\s*(\{.*\})/);
      if (match) {
        cleaned = 'vivafolio: ' + match[1];
      }
    }

    return cleaned;
  }
}

/**
 * D language diagnostic adapter.
 * D compilers may add compilation artifacts.
 */
export class DDiagnosticAdapter extends BaseDiagnosticAdapter {
  constructor() {
    super('d');
  }

  protected preprocessMessage(message: string): string {
    let cleaned = message.trim();

    // D compilers might add file:line: prefixes that we need to strip
    // But only if they're not part of the actual vivafolio message
    if (cleaned.includes('vivafolio:')) {
      const vivafolioIndex = cleaned.indexOf('vivafolio:');
      cleaned = cleaned.substring(vivafolioIndex);
    }

    // Remove any D-specific error prefixes
    cleaned = cleaned.replace(/^Error:\s*/, '');
    cleaned = cleaned.replace(/^Warning:\s*/, '');

    return cleaned;
  }
}

/**
 * Lean diagnostic adapter.
 * Lean has specific message formatting.
 */
export class LeanDiagnosticAdapter extends BaseDiagnosticAdapter {
  constructor() {
    super('lean');
  }

  protected preprocessMessage(message: string): string {
    let cleaned = message.trim();

    // Lean messages might have structured formatting
    // Extract the core message content
    if (cleaned.includes('vivafolio:')) {
      // Lean might wrap messages in additional formatting
      const lines = cleaned.split('\n');
      const vivafolioLine = lines.find(line => line.includes('vivafolio:'));
      if (vivafolioLine) {
        cleaned = vivafolioLine.trim();
      }
    }

    return cleaned;
  }
}

/**
 * Zig diagnostic adapter.
 * Zig has specific error message formats.
 */
export class ZigDiagnosticAdapter extends BaseDiagnosticAdapter {
  constructor() {
    super('zig');
  }

  protected preprocessMessage(message: string): string {
    let cleaned = message.trim();

    // Zig compiler messages have specific formats
    // Remove any Zig-specific prefixes while preserving vivafolio content
    if (cleaned.includes('vivafolio:')) {
      const match = cleaned.match(/vivafolio:\s*(\{.*\})/);
      if (match) {
        cleaned = 'vivafolio: ' + match[1];
      }
    }

    // Remove common Zig error prefixes
    cleaned = cleaned.replace(/^error:\s*/, '');
    cleaned = cleaned.replace(/^note:\s*/, '');

    return cleaned;
  }
}

/**
 * Crystal diagnostic adapter.
 * Crystal has specific message formatting.
 */
export class CrystalDiagnosticAdapter extends BaseDiagnosticAdapter {
  constructor() {
    super('crystal');
  }

  protected preprocessMessage(message: string): string {
    let cleaned = message.trim();

    // Crystal messages might have type information or other artifacts
    if (cleaned.includes('vivafolio:')) {
      // Extract the JSON part
      const match = cleaned.match(/vivafolio:\s*(\{.*\})/);
      if (match) {
        cleaned = 'vivafolio: ' + match[1];
      }
    }

    return cleaned;
  }
}

/**
 * Rust diagnostic adapter.
 * Rust has structured error messages with spans.
 */
export class RustDiagnosticAdapter extends BaseDiagnosticAdapter {
  constructor() {
    super('rust');
  }

  protected preprocessMessage(message: string): string {
    let cleaned = message.trim();

    // Rust cargo/rustc can add multiple lines and spans
    // Look for the line containing vivafolio
    const lines = cleaned.split('\n');
    for (const line of lines) {
      if (line.includes('vivafolio:')) {
        cleaned = line.trim();
        break;
      }
    }

    // Clean up any remaining artifacts
    if (cleaned.includes('vivafolio:')) {
      const match = cleaned.match(/vivafolio:\s*(\{.*\})/);
      if (match) {
        cleaned = 'vivafolio: ' + match[1];
      }
    }

    return cleaned;
  }
}

/**
 * Factory for creating diagnostic adapters.
 */
export class DiagnosticAdapterFactory {
  private static readonly ADAPTERS: Record<string, new () => DiagnosticAdapter> = {
    nim: NimDiagnosticAdapter,
    d: DDiagnosticAdapter,
    lean: LeanDiagnosticAdapter,
    zig: ZigDiagnosticAdapter,
    crystal: CrystalDiagnosticAdapter,
    rust: RustDiagnosticAdapter
  };

  static create(language: string): DiagnosticAdapter {
    const AdapterClass = this.ADAPTERS[language];
    if (!AdapterClass) {
      // Return a default adapter that does minimal processing
      return new class extends BaseDiagnosticAdapter {
        constructor() {
          super(language);
        }
      };
    }

    return new AdapterClass();
  }

  static getSupportedLanguages(): string[] {
    return Object.keys(this.ADAPTERS);
  }
}





