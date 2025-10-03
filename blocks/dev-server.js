#!/usr/bin/env node

/**
 * Block Development Server
 *
 * Provides hot reloading and development support for Block Protocol blocks.
 * Serves block resources with proper caching headers and automatic rebuilds.
 */

import express from 'express'
import path from 'node:path'
import * as fs from 'node:fs'
import chokidar from 'chokidar'
import { exec } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// __dirname shim for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// --- CLI args parsing (minimal) -------------------------------------------------
function getArgValue(name) {
  // returns value for flags like --port=3001 or --port 3001
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1]
  }
  const withEq = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (withEq) return withEq.split('=')[1]
  return undefined
}

const argPort = getArgValue('port')
const argHost = getArgValue('host')

// Precedence: CLI > BLOCK_* env > generic env > default
const PORT = Number(argPort ?? process.env.BLOCK_DEV_SERVER_PORT ?? process.env.PORT ?? 3001)
const HOST = String(argHost ?? process.env.BLOCK_DEV_SERVER_HOST ?? process.env.HOST ?? '0.0.0.0')

const app = express();

// Block registry
const blocks = new Map();

// Load block metadata
function loadBlockMetadata(blockName) {
  const metadataPath = path.join(__dirname, blockName, 'block-metadata.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      blocks.set(blockName, metadata);
      return metadata;
    } catch (error) {
      console.error(`Error loading metadata for ${blockName}:`, error.message);
    }
  }
  return null;
}

// Initialize blocks
function initializeBlocks() {
  const blockDirs = fs.readdirSync(__dirname, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => fs.existsSync(path.join(__dirname, name, 'block-metadata.json')));

  blockDirs.forEach(blockName => {
    loadBlockMetadata(blockName);
  });

  console.log(`Loaded ${blocks.size} blocks: ${Array.from(blocks.keys()).join(', ')}`);
}

// Watch for block changes and rebuild
function setupBlockWatching() {
  const watcher = chokidar.watch('*/src/**/*', {
    cwd: __dirname,
    ignoreInitial: true,
    ignored: ['**/node_modules/**', '**/dist/**']
  });

  watcher.on('change', (filePath) => {
  const blockName = filePath.split(path.sep)[0];
    console.log(`Block ${blockName} source changed: ${filePath}`);

    // Rebuild the block
    exec(`cd ${blockName} && npm run build`, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error rebuilding ${blockName}:`, error.message);
        return;
      }

      if (stdout) console.log(`Rebuilt ${blockName}:`, stdout.trim());
      if (stderr) console.error(`Rebuild warnings for ${blockName}:`, stderr.trim());

      console.log(`✅ ${blockName} rebuilt successfully`);
    });
  });

  console.log('Block file watching enabled');
}

// Serve block resources
app.get('/blocks/:blockName/:fileName', (req, res) => {
  const { blockName, fileName } = req.params;
  const blockPath = path.join(__dirname, blockName, 'dist', fileName);

  if (fs.existsSync(blockPath)) {
    // Set caching headers for development
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.sendFile(blockPath);
  } else {
    res.status(404).json({ error: `Block ${blockName}/${fileName} not found` });
  }
});

// Block metadata endpoint
app.get('/api/blocks/:blockName', (req, res) => {
  const { blockName } = req.params;
  const metadata = blocks.get(blockName);

  if (metadata) {
    res.json(metadata);
  } else {
    res.status(404).json({ error: `Block ${blockName} not found` });
  }
});

// List all blocks
app.get('/api/blocks', (req, res) => {
  const blockList = Array.from(blocks.entries()).map(([name, metadata]) => ({
    name,
    displayName: metadata.blockprotocol?.displayName || name,
    version: metadata.blockprotocol?.version || '1.0.0'
  }));
  res.json(blockList);
});

// Health check
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    blocks: blocks.size
  });
});

// Static file serving for development
app.use(express.static(path.join(__dirname)));

// Start server
export async function startServer() {
  try {
    // Initialize blocks
    initializeBlocks();

    // Setup file watching
    setupBlockWatching();

    // Start HTTP server
  app.listen(PORT, HOST, () => {
      const hostForBanner = (HOST === '0.0.0.0' || HOST === '::') ? 'localhost' : HOST
      console.log(`🚀 Block Development Server running at http://${hostForBanner}:${PORT}`);
      console.log(`📦 Serving ${blocks.size} blocks`);
      console.log(`🔍 Block watching enabled`);
      console.log(`📊 Health check: http://${hostForBanner}:${PORT}/healthz`);
      console.log(`📋 Block list: http://${hostForBanner}:${PORT}/api/blocks`);
    });

  } catch (error) {
    console.error('Failed to start block development server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down block development server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down block development server...');
  process.exit(0);
});

// Start the server when executed directly
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  startServer()
}
