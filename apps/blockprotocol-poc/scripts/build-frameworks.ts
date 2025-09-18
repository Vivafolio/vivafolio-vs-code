#!/usr/bin/env tsx

import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import crypto from 'crypto'

// Simple framework build script
function generateAssetHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8)
}
async function buildFrameworks() {
  const rootDir = path.resolve(process.cwd(), '..')
  const frameworksDir = path.join(rootDir, 'libs/block-frameworks')
  const outputDir = path.join(rootDir, 'dist/frameworks')

  console.log('[build-frameworks] Building framework examples...')

  const frameworks = ['solidjs', 'vue', 'svelte', 'lit', 'angular']

  for (const framework of frameworks) {
    const sourceDir = path.join(frameworksDir, framework, 'examples')
    const frameworkOutputDir = path.join(outputDir, framework)

    if (!existsSync(sourceDir)) {
      console.log(`[build-frameworks] Skipping ${framework} - examples directory not found`)
      continue
    }

    console.log(`[build-frameworks] Building ${framework} blocks...`)

    try {
      const files = await fs.readdir(sourceDir)

      for (const file of files) {
        if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.vue') || file.endsWith('.svelte')) {
          const sourcePath = path.join(sourceDir, file)
          const sourceContent = await fs.readFile(sourcePath, 'utf8')
          const hash = generateAssetHash(sourceContent)

          // Create simple compiled output (in production, this would use proper bundlers)
          const compiledContent = `
(function() {
  const ${framework}Block = ${JSON.stringify(sourceContent)};

  // Simple runtime wrapper
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ${framework}Block;
  }

  if (typeof window !== 'undefined') {
    window.${framework}Block = ${framework}Block;
  }

  return ${framework}Block;
})();
`

          await fs.mkdir(frameworkOutputDir, { recursive: true })
          const outputFile = path.join(frameworkOutputDir, `${framework}-${file.replace(/\.(tsx|ts|js|vue|svelte)$/, '')}-${hash}.js`)
          await fs.writeFile(outputFile, compiledContent, 'utf8')

          console.log(`[build-frameworks] Built ${framework}/${file} -> ${path.basename(outputFile)}`)
        }
      }
    } catch (error) {
      console.error(`[build-frameworks] Failed to build ${framework} blocks:`, error)
    }
  }

  console.log('[build-frameworks] Framework build complete!')
}

buildFrameworks().catch(console.error)
