import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const thisFilePath = fileURLToPath(import.meta.url)
const thisDir = path.dirname(thisFilePath)

const graphStdlibShimPath = path.resolve(
  thisDir,
  'src/shims/blockprotocol-graph-stdlib.ts'
)

export default defineConfig({
  root: '.',
  publicDir: false,
  resolve: {
    alias: {
      '@blockprotocol/graph/stdlib': graphStdlibShimPath
    }
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: false
  }
})
