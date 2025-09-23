/**
 * Vivafolio LangExecutor
 *
 * Executes external scripts/programs that emit VivafolioBlock notifications
 * to stdout at runtime. This is used for languages that support runtime
 * block emission rather than compile-time diagnostics.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  CommunicationLayer,
  CommunicationLayerType,
  CommunicationResult,
  BlockParser,
  VivafolioBlockNotification
} from '@vivafolio/communication-layer';

export interface LangExecutorOptions {
  /** Command to execute (e.g., 'python3', 'ruby', 'julia') */
  command: string;
  /** Additional arguments to pass to the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Expected number of blocks to find */
  expectedBlocks?: number;
  /** Stdin input to send to the process */
  stdin?: string;
  /** Delay before sending stdin (for processes that need to start first) */
  stdinDelay?: number;
  /** Log file path to save stdout/stderr */
  logFile?: string;
}

export class LangExecutor extends CommunicationLayer {
  private options: LangExecutorOptions;

  constructor(options: LangExecutorOptions) {
    super();
    this.options = {
      args: [],
      env: {},
      timeout: 30000,
      expectedBlocks: 1,
      stdinDelay: 0,
      ...options
    };
  }

  async discoverBlocks(
    filePath: string,
    options?: Record<string, any>
  ): Promise<CommunicationResult> {
    const mergedOptions = { ...this.options, ...options };

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          blocks: [],
          error: `File not found: ${filePath}`
        };
      }

      // Execute the script
      const result = await this.executeScript(filePath, mergedOptions);

      if (!result.success) {
        return {
          success: false,
          blocks: [],
          error: result.error
        };
      }

      // Parse blocks from stdout
      const blocks = BlockParser.fromStdoutLines(result.stdout);

      // Validate we found the expected number of blocks
      if (mergedOptions.expectedBlocks && blocks.length !== mergedOptions.expectedBlocks) {
        return {
          success: false,
          blocks,
          error: `Expected ${mergedOptions.expectedBlocks} blocks, found ${blocks.length}`
        };
      }

      return {
        success: true,
        blocks
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        blocks: [],
        error: `Execution failed: ${errorMessage}`
      };
    }
  }

  getType(): CommunicationLayerType {
    return CommunicationLayerType.LANG_EXECUTOR;
  }

  private async executeScript(
    filePath: string,
    options: LangExecutorOptions
  ): Promise<{ success: boolean; stdout: string[]; stderr: string[]; error?: string }> {
    return new Promise((resolve) => {
      const cwd = options.cwd || path.dirname(filePath);
      const env = { ...process.env, ...options.env };

      // Build command arguments
      const args = [...(options.args || []), path.basename(filePath)];

      console.log(`LangExecutor executing: ${options.command} ${args.join(' ')} in ${cwd}`);

      const proc = spawn(options.command, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const stdout: string[] = [];
      const stderr: string[] = [];
      let timeoutId: NodeJS.Timeout;

      // Collect stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        console.log(`LangExecutor stdout received chunk: ${chunk.length} chars`);
        console.log(`LangExecutor stdout chunk: ${chunk.substring(0, 200)}...`);
        const lines = chunk.split('\n').filter((line: string) => line.trim());
        console.log(`LangExecutor stdout parsed lines: ${lines.length}`);
        stdout.push(...lines);
      });

      // Collect stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        stderr.push(...lines);
      });

      // Send stdin input if specified
      if (options.stdin) {
        if (options.stdinDelay && options.stdinDelay > 0) {
          setTimeout(() => {
            proc.stdin?.write(options.stdin);
          }, options.stdinDelay);
        } else {
          proc.stdin?.write(options.stdin);
        }
      }

      // Handle process completion
      proc.on('close', (code) => {
        console.log(`LangExecutor process exited with code: ${code}`);
        console.log(`LangExecutor final stdout lines: ${stdout.length}`);
        if (stderr.length > 0) {
          console.log(`LangExecutor final stderr: ${stderr.join('\n')}`);
        }
        if (timeoutId) clearTimeout(timeoutId);

        // Save output to log file if specified
        if (options.logFile) {
          try {
            const fs = require('fs');
            const logContent = [
              `Command: ${options.command} ${args.join(' ')}`,
              `Exit Code: ${code}`,
              `Working Directory: ${cwd}`,
              '',
              'STDOUT:',
              ...stdout,
              '',
              'STDERR:',
              ...stderr
            ].join('\n');

            fs.writeFileSync(options.logFile, logContent);
            console.log(`LangExecutor saved output to: ${options.logFile}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`LangExecutor failed to write log file: ${errorMessage}`);
          }
        }

        if (code === 0) {
          resolve({ success: true, stdout, stderr });
        } else {
          resolve({
            success: false,
            stdout,
            stderr,
            error: `Process exited with code ${code}. Stderr: ${stderr.join('\n')}`
          });
        }
      });

      // Handle process errors
      proc.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          success: false,
          stdout,
          stderr,
          error: `Failed to start process: ${error.message}`
        });
      });

      // Set timeout
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          proc.kill();
          resolve({
            success: false,
            stdout,
            stderr,
            error: `Process timed out after ${options.timeout}ms`
          });
        }, options.timeout);
      }
    });
  }
}

/**
 * Factory for creating language executors with sensible defaults.
 */
export class LangExecutorFactory {
  private static readonly EXECUTORS: Record<string, LangExecutorOptions> = {
    python: {
      command: 'python3',
      expectedBlocks: 2  // color_picker + show_square
    },
    ruby: {
      command: 'ruby',
      expectedBlocks: 2
    },
    julia: {
      command: 'julia',
      expectedBlocks: 2
    },
    javascript: {
      command: 'node',
      expectedBlocks: 2
    },
    nim: {
      command: 'nim',
      args: ['c', '-r', '--hints:off'],
      expectedBlocks: 2
    }
  };

  static create(language: string, customOptions?: Partial<LangExecutorOptions>): LangExecutor {
    const baseOptions = this.EXECUTORS[language];
    if (!baseOptions) {
      throw new Error(`No executor configured for language: ${language}`);
    }

    return new LangExecutor({ ...baseOptions, ...customOptions });
  }

  static createCustom(options: LangExecutorOptions): LangExecutor {
    return new LangExecutor(options);
  }
}
