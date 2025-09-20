#!/usr/bin/env tsx

import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import crypto from 'crypto'
import { build as viteBuild } from 'vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { visualizer } from 'rollup-plugin-visualizer'

interface FrameworkBundle {
  id: string
  hash: string
  assets: string[]
  entryPoint: string
  metadata: {
    framework: string
    sourcePath: string
    compiledAt: string
  }
  lastModified: Date
}

function generateAssetHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8)
}

async function createViteConfig(framework: string, entryPath: string, outputDir: string) {
  const config: any = {
    build: {
      lib: {
        entry: entryPath,
        name: `${framework}Block`,
        formats: ['es', 'umd'],
        fileName: (format: string) => `${framework}-block.${format}.js`
      },
      outDir: outputDir,
      emptyOutDir: false,
      minify: 'terser',
      sourcemap: false,
      rollupOptions: {
        external: ['solid-js', 'vue', 'svelte', 'svelte/internal', 'lit', '@angular/core', '@blockprotocol/graph', '@blockprotocol/core'],
        output: {
          globals: {
            'solid-js': 'SolidJS',
            'vue': 'Vue',
            'svelte': 'Svelte',
            'svelte/internal': 'SvelteInternal',
            'lit': 'Lit',
            '@angular/core': 'AngularCore',
            '@blockprotocol/graph': 'BlockProtocolGraph',
            '@blockprotocol/core': 'BlockProtocolCore'
          },
          // Enable code splitting for better performance (only for internal dependencies)
          manualChunks: undefined,
          // Optimize chunk file names for production
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: `${framework}-block.[format].js`,
          assetFileNames: `${framework}-assets/[name]-[hash].[ext]`
        },
        // Enable tree shaking
        treeshake: true
      },
      // Enable CSS code splitting
      cssCodeSplit: true,
      // Optimize dependencies
      commonjsOptions: {
        include: [/node_modules/]
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    esbuild: {
      jsx: 'transform',
      jsxFactory: 'createElement',
      jsxFragment: 'Fragment'
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000
  }

  // Framework-specific configurations
  config.plugins = [
    // Add bundle analyzer for production builds
    visualizer({
      filename: path.join(outputDir, `${framework}-bundle-analysis.html`),
      open: false,
      gzipSize: true,
      brotliSize: true
    })
  ]

  switch (framework) {
    case 'solidjs':
      config.plugins.push({
        name: 'solidjs-resolve',
        resolveId(id: string) {
          if (id === 'solid-js') return { id: 'solid-js', external: true }
          return null
        }
      })
      break

    case 'vue':
      config.plugins.push(vue())
      config.plugins.push({
        name: 'vue-resolve',
        resolveId(id: string) {
          if (id === 'vue') return { id: 'vue', external: true }
          return null
        }
      })
      break

    case 'svelte':
      config.plugins.push(svelte())
      config.plugins.push({
        name: 'svelte-resolve',
        resolveId(id: string) {
          if (id === 'svelte' || id === 'svelte/internal') return { id, external: true }
          return null
        }
      })
      break

    case 'lit':
      config.plugins.push({
        name: 'lit-resolve',
        resolveId(id: string) {
          if (id === 'lit') return { id: 'lit', external: true }
          return null
        }
      })
      break

    case 'angular':
      config.plugins.push({
        name: 'angular-resolve',
        resolveId(id: string) {
          if (id.startsWith('@angular/')) return { id, external: true }
          return null
        }
      })
      break
  }

  return config
}

async function buildFrameworkBundle(framework: string, sourcePath: string, outputDir: string, blockName?: string): Promise<FrameworkBundle> {
  console.log(`[build-frameworks] Building ${framework} block from ${sourcePath}`)

  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const hash = generateAssetHash(sourceContent)

  // For SolidJS, create separate directory for each block
  const actualOutputDir = framework === 'solidjs' && blockName ? path.join(outputDir, blockName) : outputDir

  const viteConfig = await createViteConfig(framework, sourcePath, actualOutputDir)

  try {
    await viteBuild(viteConfig)
    console.log(`[build-frameworks] ✓ Built ${framework} block`)
  } catch (error) {
    console.error(`[build-frameworks] ✗ Failed to build ${framework} block:`, error)
    throw error
  }

  // Check what files were created
  const outputFiles = await fs.readdir(actualOutputDir)
  const assets = outputFiles.filter(file => file.endsWith('.js') || file.endsWith('.css'))

  if (assets.length === 0) {
    throw new Error(`No output files generated for ${framework}`)
  }

  const entryPoint = assets.find(file => file.includes('.es.')) || assets[0]

  return {
    id: `${framework}-${path.basename(sourcePath, path.extname(sourcePath))}`,
    hash,
    assets,
    entryPoint,
    metadata: {
      framework,
      sourcePath,
      compiledAt: new Date().toISOString()
    },
    lastModified: new Date()
  }
}

async function buildGeneralBlocks() {
  const rootDir = process.cwd()
  const examplesDir = path.join(rootDir, 'examples/blocks')
  const outputDir = path.join(rootDir, 'dist/frameworks')
  const builtBundles: FrameworkBundle[] = []

  if (!existsSync(examplesDir)) {
    console.log('[build-frameworks] General examples directory not found, skipping...')
    return builtBundles
  }

  console.log('[build-frameworks] Processing general example blocks...')

  try {
    const blockDirs = await fs.readdir(examplesDir)

    for (const blockDir of blockDirs) {
      const blockPath = path.join(examplesDir, blockDir)
      const stat = await fs.stat(blockPath)

      if (!stat.isDirectory()) continue

      const mainFile = path.join(blockPath, 'main.js')
      if (!existsSync(mainFile)) continue

      console.log(`[build-frameworks] Building general block: ${blockDir}`)

      const outputName = `${blockDir}-block`
      const blockOutputDir = path.join(outputDir, blockDir)

      try {
        const bundle = await buildFrameworkBundle('general', mainFile, blockOutputDir)
        // Update the bundle ID to use the block name instead of the file path
        bundle.id = outputName
        builtBundles.push(bundle)
        console.log(`[build-frameworks] ✓ Built general block: ${blockDir}`)
      } catch (error) {
        console.error(`[build-frameworks] ✗ Failed to build general block ${blockDir}:`, error)
      }
    }
  } catch (error) {
    console.error('[build-frameworks] Error processing general blocks:', error)
  }

  return builtBundles
}

async function buildFrameworks() {
  const rootDir = process.cwd()
  const frameworksDir = path.join(rootDir, 'libs/block-frameworks')
  const outputDir = path.join(rootDir, 'dist/frameworks')

  console.log('[build-frameworks] Starting production framework compilation...')

  const frameworks = ['solidjs'] // Only build SolidJS for now to demonstrate production capabilities
  const builtBundles: FrameworkBundle[] = []

  // Build framework-specific blocks
  for (const framework of frameworks) {
    const sourceDir = path.join(frameworksDir, framework, 'examples')
    const frameworkOutputDir = path.join(outputDir, framework)

    if (!existsSync(sourceDir)) {
      console.log(`[build-frameworks] Skipping ${framework} - examples directory not found`)
      continue
    }

    console.log(`[build-frameworks] Processing ${framework} framework...`)

    try {
      const files = await fs.readdir(sourceDir)

      for (const file of files) {
        if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.vue') || file.endsWith('.svelte')) {
          const sourcePath = path.join(sourceDir, file)
          const blockName = file.replace(/\.(tsx|ts|js|vue|svelte)$/, '')
          const bundle = await buildFrameworkBundle(framework, sourcePath, frameworkOutputDir, blockName)
          builtBundles.push(bundle)

          console.log(`[build-frameworks] ✓ ${bundle.id} -> ${bundle.entryPoint}`)
        }
      }
    } catch (error) {
      console.error(`[build-frameworks] Failed to build ${framework} blocks:`, error)
      throw error
    }
  }

  // Build general example blocks
  const generalBundles = await buildGeneralBlocks()
  builtBundles.push(...generalBundles)

  // Generate bundle manifest
  const manifestPath = path.join(outputDir, 'manifest.json')
  await fs.mkdir(outputDir, { recursive: true })

  const manifest = {
    generatedAt: new Date().toISOString(),
    bundles: builtBundles.map(bundle => ({
      id: bundle.id,
      framework: bundle.metadata.framework,
      hash: bundle.hash,
      entryPoint: bundle.entryPoint,
      assets: bundle.assets,
      sourcePath: bundle.metadata.sourcePath
    }))
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`[build-frameworks] ✓ Generated manifest with ${builtBundles.length} bundles`)

  console.log('[build-frameworks] Framework compilation complete!')
  console.log(`[build-frameworks] Total bundles built: ${builtBundles.length}`)
}

buildFrameworks().catch(console.error)
