/**
 * Vivafolio HCR LangExecutor
 *
 * Hot Code Reload Language Executor for interactive Vivafolio development.
 * Implements the HCR protocol (JSON-RPC 2.0 over stdio or Unix socket)
 * as defined in Hot-Code-Reloading-High-Level-Interfaces.md section 2.
 */

import { ChildProcess, spawn } from 'child_process';
import { Socket, createConnection } from 'net';
import { EventEmitter } from 'events';
import {
  CommunicationLayer,
  CommunicationLayerType,
  CommunicationResult,
  VivafolioBlockNotification
} from '@vivafolio/communication-layer';

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, any>;
}

// ---------------------------------------------------------------------------
// HCR protocol types
// ---------------------------------------------------------------------------

export interface HcrCapabilities {
  supportsRollback: boolean;
  supportsStateMigration: boolean;
  supportsPartialReload: boolean;
  supportedLanguages: string[];
  providerType: string;
  maxConcurrentReloads: number;
}

export interface HcrReloadParams {
  changedFiles: Array<{ uri: string; version?: number }>;
  targetPid?: number;
  options?: { forceLayoutChanges?: boolean };
}

export interface HcrPatchApplied {
  requestId: number;
  patchedFunctions: string[];
  skippedFunctions?: Array<{ name: string; reason: string }>;
  timestamp: string;
}

export interface HcrPatchFailed {
  requestId: number;
  stage: 'compilation' | 'linking' | 'patching' | 'stateMigration';
  errors: Array<{ file: string; line?: number; message: string }>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface HcrLangExecutorOptions {
  /** Command to execute */
  command: string;
  /** Additional arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Connection protocol (stdin/stdout, unix socket, etc.) */
  protocol?: 'stdio' | 'socket';
  /** Socket path for socket-based communication */
  socketPath?: string;
  /** Connection timeout */
  connectTimeout?: number;
}

// ---------------------------------------------------------------------------
// Content-Length framed transport (same framing as LSP/DAP)
// ---------------------------------------------------------------------------

export class ContentLengthTransport extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private contentLength: number = -1;

  feed(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.parse();
  }

  private parse(): void {
    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        const header = this.buffer.subarray(0, headerEnd).toString('utf-8');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // Skip malformed header
          this.buffer = this.buffer.subarray(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.subarray(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) return;

      const body = this.buffer.subarray(0, this.contentLength).toString('utf-8');
      this.buffer = this.buffer.subarray(this.contentLength);
      this.contentLength = -1;

      try {
        const message = JSON.parse(body);
        this.emit('message', message);
      } catch {
        // Ignore malformed JSON
      }
    }
  }

  static encode(message: object): Buffer {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    return Buffer.from(header + body, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// HcrLangExecutor
// ---------------------------------------------------------------------------

export class HcrLangExecutor extends CommunicationLayer {
  private options: HcrLangExecutorOptions;
  private connected: boolean = false;
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private transport: ContentLengthTransport = new ContentLengthTransport();
  private nextId: number = 1;
  private pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = new Map();
  private capabilities: HcrCapabilities | null = null;
  private emitter: EventEmitter = new EventEmitter();

  constructor(options: HcrLangExecutorOptions) {
    super();
    this.options = {
      args: [],
      env: {},
      protocol: 'stdio',
      connectTimeout: 5000,
      ...options
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Discover blocks by querying the running program for its current state
   * after a reload cycle.
   */
  async discoverBlocks(
    filePath: string,
    options?: Record<string, any>
  ): Promise<CommunicationResult> {
    if (!this.connected) {
      const ok = await this.connect();
      if (!ok) {
        return {
          success: false,
          blocks: [],
          error: 'Failed to connect to HCR provider'
        };
      }
    }

    try {
      const response = await this.sendRequest('hcr/status', {});
      return {
        success: true,
        blocks: [],
        // Status info carried for callers that want to inspect provider state
        ...(response?.state ? { error: undefined } : {})
      };
    } catch (err: any) {
      return {
        success: false,
        blocks: [],
        error: err.message || String(err)
      };
    }
  }

  getType(): CommunicationLayerType {
    return CommunicationLayerType.HCR_LANG_EXECUTOR;
  }

  async cleanup(): Promise<void> {
    this.connected = false;
    this.pendingRequests.forEach(({ reject }) =>
      reject(new Error('HCR connection closed'))
    );
    this.pendingRequests.clear();

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * Notify the HCR provider of a file change, triggering a reload.
   * Resolves when the provider acknowledges the reload request.
   */
  async notifyFileChange(filePath: string, content?: string): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    const params: HcrReloadParams = {
      changedFiles: [{ uri: `file://${filePath}` }]
    };

    await this.sendRequest('hcr/reload', params);
  }

  /**
   * Subscribe to HCR notifications (patchApplied, patchFailed, stateWarning).
   */
  on(event: 'patchApplied', listener: (params: HcrPatchApplied) => void): this;
  on(event: 'patchFailed', listener: (params: HcrPatchFailed) => void): this;
  on(event: 'stateWarning', listener: (params: any) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  off(event: string, listener: (...args: any[]) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  /**
   * Get the negotiated capabilities, or null if not yet connected.
   */
  getCapabilities(): HcrCapabilities | null {
    return this.capabilities;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    this.transport = new ContentLengthTransport();
    this.transport.on('message', (msg: any) => this.handleMessage(msg));

    if (this.options.protocol === 'socket' && this.options.socketPath) {
      return this.connectSocket();
    }
    return this.connectStdio();
  }

  private connectStdio(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectTimeout!);

      this.process = spawn(this.options.command, this.options.args || [], {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout!.on('data', (data: Buffer) => {
        this.transport.feed(data);
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        this.connected = false;
        reject(err);
      });

      this.process.on('exit', () => {
        this.connected = false;
      });

      // Perform capability negotiation
      this.connected = true;
      this.negotiateCapabilities()
        .then((caps) => {
          clearTimeout(timeout);
          this.capabilities = caps;
          resolve(true);
        })
        .catch((err) => {
          clearTimeout(timeout);
          this.connected = false;
          reject(err);
        });
    });
  }

  private connectSocket(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectTimeout!);

      this.socket = createConnection(this.options.socketPath!, () => {
        this.connected = true;
        this.negotiateCapabilities()
          .then((caps) => {
            clearTimeout(timeout);
            this.capabilities = caps;
            resolve(true);
          })
          .catch((err) => {
            clearTimeout(timeout);
            this.connected = false;
            reject(err);
          });
      });

      this.socket.on('data', (data: Buffer) => {
        this.transport.feed(data);
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        this.connected = false;
        reject(err);
      });

      this.socket.on('close', () => {
        this.connected = false;
      });
    });
  }

  // -----------------------------------------------------------------------
  // Capability negotiation (section 2.2 of the HCR protocol spec)
  // -----------------------------------------------------------------------

  private async negotiateCapabilities(): Promise<HcrCapabilities> {
    const result = await this.sendRequest('hcr/capabilities', {});
    return result as HcrCapabilities;
  }

  // -----------------------------------------------------------------------
  // Message handling
  // -----------------------------------------------------------------------

  private handleMessage(msg: any): void {
    // Response to a pending request
    if ('id' in msg && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Notification from provider
    if ('method' in msg && !('id' in msg)) {
      switch (msg.method) {
        case 'hcr/patchApplied':
          this.emitter.emit('patchApplied', msg.params as HcrPatchApplied);
          break;
        case 'hcr/patchFailed':
          this.emitter.emit('patchFailed', msg.params as HcrPatchFailed);
          break;
        case 'hcr/stateWarning':
          this.emitter.emit('stateWarning', msg.params);
          break;
      }
    }
  }

  sendRequest(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });

      const encoded = ContentLengthTransport.encode(request);
      this.writeRaw(encoded);
    });
  }

  private writeRaw(data: Buffer): void {
    if (this.options.protocol === 'socket' && this.socket) {
      this.socket.write(data);
    } else if (this.process?.stdin) {
      this.process.stdin.write(data);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export class HcrLangExecutorFactory {
  static create(language: string, customOptions?: Partial<HcrLangExecutorOptions>): HcrLangExecutor {
    const configs: Record<string, HcrLangExecutorOptions> = {
      python: {
        command: 'python3',
        args: ['-u', require('path').join(__dirname, '..', 'providers', 'python_hcr_provider.py')],
        protocol: 'stdio'
      },
      julia: {
        command: 'julia',
        protocol: 'stdio'
      },
      mojo: {
        command: 'mojo',
        protocol: 'socket',
        socketPath: '/tmp/vivafolio-mojo-hcr.sock'
      }
    };

    const baseOptions = configs[language];
    if (!baseOptions) {
      throw new Error(`No HCR executor configured for language: ${language}`);
    }

    return new HcrLangExecutor({ ...baseOptions, ...customOptions });
  }
}
