/**
 * Vivafolio LSP Connection
 *
 * LSP-based communication layer that connects to language servers
 * and uses diagnostics adapters to extract VivafolioBlock notifications.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  CommunicationLayer,
  CommunicationLayerType,
  CommunicationResult,
  VivafolioBlockNotification
} from '@vivafolio/communication-layer';
import {
  DiagnosticAdapter,
  DiagnosticAdapterFactory
} from '@vivafolio/diagnostics-adapter';

export interface LspConnectionOptions {
  /** Language server command */
  command: string;
  /** Arguments to pass to the language server */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Timeout for LSP operations */
  timeout?: number;
  /** Language for diagnostics adaptation */
  language: string;
  /** Additional initialization options for the LSP */
  initializationOptions?: Record<string, any>;
}

export class LspConnection extends CommunicationLayer {
  private options: LspConnectionOptions;
  private adapter: DiagnosticAdapter;
  private process: any = null;
  private requestId: number = 1;

  constructor(options: LspConnectionOptions) {
    super();
    this.options = {
      args: [],
      env: {},
      timeout: 30000,
      ...options
    };
    this.adapter = DiagnosticAdapterFactory.create(this.options.language);
  }

  async discoverBlocks(
    filePath: string,
    options?: Record<string, any>
  ): Promise<CommunicationResult> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          blocks: [],
          error: `File not found: ${filePath}`
        };
      }

      // Start LSP server if not already running
      if (!this.process) {
        await this.startLspServer();
      }

      // Initialize LSP if needed
      await this.initializeLsp(filePath);

      // Open the document
      await this.openDocument(filePath);

      // Request diagnostics
      const diagnostics = await this.getDiagnostics(filePath);

      // Adapt diagnostics using language-specific adapter
      const blocks = this.adapter.adaptDiagnostics(diagnostics);

      return {
        success: true,
        blocks
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        blocks: [],
        error: `LSP communication failed: ${errorMessage}`
      };
    }
  }

  getType(): CommunicationLayerType {
    return CommunicationLayerType.LSP;
  }

  async cleanup(): Promise<void> {
    if (this.process) {
      // Send shutdown request
      try {
        await this.sendRequest('shutdown', {});
        await this.sendRequest('exit', {});
      } catch (e) {
        // Ignore errors during shutdown
      }

      // Kill the process
      this.process.kill();
      this.process = null;
    }
  }

  private async startLspServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cwd = this.options.cwd || process.cwd();
      const env = { ...process.env, ...this.options.env };

      this.process = spawn(this.options.command, this.options.args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let initialized = false;
      let buffer = '';

      const handleData = (data: Buffer) => {
        buffer += data.toString();

        // Check for Content-Length header
        const contentLengthMatch = buffer.match(/Content-Length: (\d+)/);
        if (contentLengthMatch) {
          const contentLength = parseInt(contentLengthMatch[1]);
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const messageStart = headerEnd + 4;
            if (buffer.length >= messageStart + contentLength) {
              const message = buffer.substring(messageStart, messageStart + contentLength);
              buffer = buffer.substring(messageStart + contentLength);

              try {
                const response = JSON.parse(message);
                if (response.id && !initialized) {
                  initialized = true;
                  resolve();
                }
              } catch (e) {
                // Invalid JSON, continue
              }
            }
          }
        }
      };

      this.process.stdout?.on('data', handleData);
      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('LSP stderr:', data.toString());
      });

      this.process.on('error', reject);

      // Timeout
      setTimeout(() => {
        if (!initialized) {
          reject(new Error('LSP server failed to start within timeout'));
        }
      }, this.options.timeout);
    });
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('LSP server not running'));
        return;
      }

      const request = {
        jsonrpc: '2.0',
        id: this.requestId++,
        method,
        params
      };

      const content = JSON.stringify(request);
      const message = `Content-Length: ${content.length}\r\n\r\n${content}`;

      let buffer = '';
      let responseReceived = false;

      const handleResponse = (data: Buffer) => {
        buffer += data.toString();

        const contentLengthMatch = buffer.match(/Content-Length: (\d+)/);
        if (contentLengthMatch) {
          const contentLength = parseInt(contentLengthMatch[1]);
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const messageStart = headerEnd + 4;
            if (buffer.length >= messageStart + contentLength) {
              const message = buffer.substring(messageStart, messageStart + contentLength);
              buffer = buffer.substring(messageStart + contentLength);

              try {
                const response = JSON.parse(message);
                if (response.id === request.id) {
                  responseReceived = true;
                  this.process.stdout?.off('data', handleResponse);
                  resolve(response);
                }
              } catch (e) {
                // Invalid JSON, continue
              }
            }
          }
        }
      };

      this.process.stdout?.on('data', handleResponse);
      this.process.stdin?.write(message);

      // Timeout
      setTimeout(() => {
        if (!responseReceived) {
          this.process.stdout?.off('data', handleResponse);
          reject(new Error(`Request ${method} timed out`));
        }
      }, this.options.timeout);
    });
  }

  private async initializeLsp(filePath: string): Promise<void> {
    const rootUri = `file://${path.dirname(filePath)}`;

    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {},
      initializationOptions: this.options.initializationOptions
    });
  }

  private async openDocument(filePath: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf8');
    const uri = `file://${filePath}`;

    await this.sendRequest('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.options.language,
        version: 1,
        text: content
      }
    });
  }

  private async getDiagnostics(filePath: string): Promise<any[]> {
    // For now, we'll wait a bit for diagnostics to be published
    // In a full implementation, we'd listen for publishDiagnostics notifications
    await new Promise(resolve => setTimeout(resolve, 1000));

    // This is a simplified version - in practice, we'd need to:
    // 1. Listen for publishDiagnostics notifications
    // 2. Or poll for diagnostics using textDocument/publishDiagnostics

    // For this test implementation, we'll use a simpler approach
    // by requesting document symbols or similar to trigger diagnostics
    try {
      await this.sendRequest('textDocument/documentSymbol', {
        textDocument: { uri: `file://${filePath}` }
      });
    } catch (e) {
      // Ignore errors - we're just trying to trigger diagnostics
    }

    // Wait a bit more for diagnostics
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In a real implementation, diagnostics would be collected from
    // publishDiagnostics notifications. For now, return empty array.
    return [];
  }
}

/**
 * Factory for creating LSP connections with sensible defaults.
 */
export class LspConnectionFactory {
  private static readonly SERVERS: Record<string, LspConnectionOptions> = {
    nim: {
      command: 'nimlsp',
      language: 'nim'
    },
    'nim-nimlangserver': {
      command: 'nimlangserver',
      language: 'nim'
    },
    d: {
      command: 'dls',
      language: 'd'
    },
    lean: {
      command: 'lean',
      args: ['--server'],
      language: 'lean'
    },
    zig: {
      command: 'zls',
      language: 'zig'
    },
    crystal: {
      command: 'crystalline',
      language: 'crystal'
    },
    rust: {
      command: 'rust-analyzer',
      language: 'rust'
    }
  };

  static create(language: string, customOptions?: Partial<LspConnectionOptions>): LspConnection {
    const baseOptions = this.SERVERS[language];
    if (!baseOptions) {
      throw new Error(`No LSP server configured for language: ${language}`);
    }

    return new LspConnection({ ...baseOptions, ...customOptions });
  }

  static createCustom(options: LspConnectionOptions): LspConnection {
    return new LspConnection(options);
  }
}
