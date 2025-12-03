#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const cacheDir = path.join(projectRoot, '.wdio-vscode-service')

// Ensure the WDIO cache directory exists
try {
    await fs.mkdir(cacheDir, { recursive: true })
    console.log(`✅ WDIO cache directory ready: ${cacheDir}`)
} catch (error) {
    console.error(`❌ Failed to create WDIO cache directory: ${error.message}`)
    process.exit(1)
}
