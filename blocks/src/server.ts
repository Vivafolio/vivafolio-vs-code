import express from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import chokidar, { FSWatcher } from 'chokidar';
import { exec } from 'child_process';
import { promisify } from 'util';
import WebSocket from 'ws';
import http from 'http';
import { BlockBuilder, FrameworkBundle } from './builder.js';

const execAsync = promisify(exec);

export interface BlockMetadata {
  blockprotocol?: {
    displayName?: string;
    version?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BlockServerOptions {
  port?: number;
  host?: string;
  blocksDir?: string;
  enableWebSocket?: boolean;
  enableHotReload?: boolean;
  enableFrameworkBuilder?: boolean;
  frameworkOptions?: {
    frameworks?: string[];
    watchMode?: boolean;
  };
}

export interface BlockInfo {
  name: string;
  displayName: string;
  version: string;
}

/**
 * Block Server - HTTP server for serving Block Protocol blocks with WebSocket support
 */
export class BlockServer {
  private app: express.Application;
  private server?: http.Server;
  private wss?: WebSocket.Server;
  private blockBuilder?: BlockBuilder;
  private options: Required<BlockServerOptions>;
  private blocks = new Map<string, BlockMetadata>();
  private watchers: FSWatcher[] = [];
  private connectedClients = new Set<WebSocket>();

  constructor(options: BlockServerOptions = {}) {
    this.options = {
      port: 3001,
      host: 'localhost',
      blocksDir: process.cwd(),
      enableWebSocket: true,
      enableHotReload: true,
      enableFrameworkBuilder: false,
      frameworkOptions: {
        frameworks: ['solidjs', 'vue', 'svelte', 'lit', 'angular'],
        watchMode: false
      },
      ...options
    };

    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();

    if (this.options.enableFrameworkBuilder) {
      this.setupFrameworkBuilder();
    }
  }

  private setupMiddleware(): void {
    // CORS support
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Static file serving
    this.app.use(express.static(this.options.blocksDir));
  }

  private setupRoutes(): void {
    // Serve block resources
    this.app.get('/blocks/:blockName/:fileName', async (req, res) => {
      const { blockName, fileName } = req.params;
      const blockPath = path.join(this.options.blocksDir, blockName, 'dist', fileName);

      try {
        await fs.access(blockPath);
        // Set caching headers for development
        if (this.options.enableHotReload) {
          res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
        }
        res.sendFile(blockPath);
      } catch {
        res.status(404).json({ error: `Block ${blockName}/${fileName} not found` });
      }
    });

    // Serve framework bundles
    this.app.get('/frameworks/:framework/:fileName', async (req, res) => {
      const { framework, fileName } = req.params;
      const bundlePath = path.join(this.options.blocksDir, 'dist', 'blocks', framework, fileName);

      try {
        await fs.access(bundlePath);
        if (this.options.enableHotReload) {
          res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
        }
        res.sendFile(bundlePath);
      } catch {
        res.status(404).json({ error: `Framework bundle ${framework}/${fileName} not found` });
      }
    });

    // Block metadata endpoint
    this.app.get('/api/blocks/:blockName', (req, res) => {
      const { blockName } = req.params;
      const metadata = this.blocks.get(blockName);

      if (metadata) {
        res.json(metadata);
      } else {
        res.status(404).json({ error: `Block ${blockName} not found` });
      }
    });

    // List all blocks
    this.app.get('/api/blocks', (req, res) => {
      const blockList: BlockInfo[] = Array.from(this.blocks.entries()).map(([name, metadata]) => ({
        name,
        displayName: metadata.blockprotocol?.displayName || name,
        version: metadata.blockprotocol?.version || '1.0.0'
      }));
      res.json(blockList);
    });

    // Framework bundles endpoint
    this.app.get('/api/frameworks/:framework/bundles', (req, res) => {
      const { framework } = req.params;
      const watcher = this.blockBuilder?.getWatcher(framework);

      if (!watcher) {
        return res.status(404).json({ error: `Framework ${framework} not found` });
      }

      const bundles = Array.from(watcher.bundles.values()).map(bundle => ({
        id: bundle.id,
        hash: bundle.hash,
        entryPoint: bundle.entryPoint,
        lastModified: bundle.lastModified.toISOString()
      }));

      res.json(bundles);
    });

    // Health check
    this.app.get('/healthz', (req, res) => {
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        blocks: this.blocks.size,
        frameworks: this.blockBuilder ? this.options.frameworkOptions.frameworks?.length : 0,
        clients: this.connectedClients.size
      });
    });
  }

  private setupFrameworkBuilder(): void {
    this.blockBuilder = new BlockBuilder({
      ...this.options.frameworkOptions,
      onBundleUpdate: (framework, bundle) => {
        this.notifyClients({
          type: 'framework-update',
          framework,
          bundle: {
            id: bundle.id,
            hash: bundle.hash,
            entryPoint: bundle.entryPoint,
            lastModified: bundle.lastModified.toISOString()
          }
        });
      }
    });
  }

  private async loadBlockMetadata(blockName: string): Promise<BlockMetadata | null> {
    const metadataPath = path.join(this.options.blocksDir, blockName, 'block-metadata.json');

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      this.blocks.set(blockName, metadata);
      return metadata;
    } catch (error) {
      console.error(`Error loading metadata for ${blockName}:`, error);
      return null;
    }
  }

  private async initializeBlocks(): Promise<void> {
    const blockDirs = (await fs.readdir(this.options.blocksDir, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .filter(name => existsSync(path.join(this.options.blocksDir, name, 'block-metadata.json')));

    for (const blockName of blockDirs) {
      await this.loadBlockMetadata(blockName);
    }

    console.log(`Loaded ${this.blocks.size} blocks: ${Array.from(this.blocks.keys()).join(', ')}`);
  }

  private setupBlockWatching(): void {
    if (!this.options.enableHotReload) return;

    const watcher = chokidar.watch('*/src/**/*', {
      cwd: this.options.blocksDir,
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/dist/**']
    });

    watcher.on('change', (filePath) => {
      const blockName = filePath.split('/')[0];
      console.log(`Block ${blockName} source changed: ${filePath}`);

      // Rebuild the block
      execAsync(`cd ${blockName} && npm run build`, { cwd: this.options.blocksDir })
        .then(({ stdout, stderr }) => {
          if (stdout) console.log(`Rebuilt ${blockName}:`, stdout.trim());
          if (stderr) console.error(`Rebuild warnings for ${blockName}:`, stderr.trim());
          console.log(`✅ ${blockName} rebuilt successfully`);

          // Notify clients about the block update
          this.notifyClients({
            type: 'block-update',
            blockName
          });
        })
        .catch((error) => {
          console.error(`Error rebuilding ${blockName}:`, error.message);
        });
    });

    this.watchers.push(watcher);
    console.log('Block file watching enabled');
  }

  private setupWebSocket(): void {
    if (!this.options.enableWebSocket || !this.server) return;

    this.wss = new WebSocket.Server({ server: this.server });

    this.wss.on('connection', (ws) => {
      console.log('Client connected');
      this.connectedClients.add(ws);

      ws.on('close', () => {
        console.log('Client disconnected');
        this.connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });
    });
  }

  private notifyClients(message: any): void {
    const messageStr = JSON.stringify(message);
    for (const client of this.connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    }
  }

  async start(): Promise<void> {
    try {
      // Initialize blocks
      await this.initializeBlocks();

      // Setup file watching
      this.setupBlockWatching();

      // Setup framework builder if enabled
      if (this.blockBuilder) {
        await this.blockBuilder.build();
        if (this.options.frameworkOptions.watchMode) {
          await this.blockBuilder.watch();
        }
      }

      // Start HTTP server
      this.server = this.app.listen(this.options.port, this.options.host, () => {
        console.log(`🚀 Block Server running on http://${this.options.host}:${this.options.port}`);
        console.log(`📦 Serving ${this.blocks.size} blocks`);
        if (this.options.enableHotReload) console.log(`🔍 Hot reload enabled`);
        if (this.options.enableWebSocket) console.log(`🔌 WebSocket support enabled`);
        console.log(`📊 Health check: http://${this.options.host}:${this.options.port}/healthz`);
        console.log(`📋 Block list: http://${this.options.host}:${this.options.port}/api/blocks`);
      });

      // Setup WebSocket after server starts
      this.setupWebSocket();

    } catch (error) {
      console.error('Failed to start block server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    // Close WebSocket connections
    for (const client of this.connectedClients) {
      client.close();
    }
    this.connectedClients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Stop file watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    // Stop framework builder
    if (this.blockBuilder) {
      await this.blockBuilder.stop();
    }

    // Close HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => resolve());
      });
    }
  }

  // ESM export support
  getBlockBuilder(): BlockBuilder | undefined {
    return this.blockBuilder;
  }

  getBlocks(): Map<string, BlockMetadata> {
    return new Map(this.blocks);
  }
}

/**
 * Start standalone block server
 */
export async function startBlockServer(options: BlockServerOptions = {}): Promise<BlockServer> {
  const server = new BlockServer(options);
  await server.start();
  return server;
}

/**
 * CLI entry point
 */
export async function main() {
  const port = parseInt(process.env.BLOCK_SERVER_PORT || '3001');
  const enableWebSocket = process.env.BLOCK_SERVER_WEBSOCKET !== 'false';
  const enableHotReload = process.env.BLOCK_SERVER_HOT_RELOAD !== 'false';
  const enableFrameworkBuilder = process.env.BLOCK_SERVER_FRAMEWORK_BUILDER === 'true';

  const server = new BlockServer({
    port,
    enableWebSocket,
    enableHotReload,
    enableFrameworkBuilder,
    frameworkOptions: {
      watchMode: enableFrameworkBuilder
    }
  });

  await server.start();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down block server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down block server...');
    await server.stop();
    process.exit(0);
  });
}

// Run as CLI if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
