import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'path'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@vivafolio/block-solidjs': path.resolve(__dirname, '../../packages/block-frameworks/solidjs/src/index.tsx')
    }
  },
  build: {
    target: 'esnext',
    lib: {
      entry: 'src/index.ts',
      name: 'StatusPillBlock',
  fileName: 'main',
  formats: ['cjs']
    },
    rollupOptions: {
  // Do not externalize SolidJS so the bundle is self-contained for the loader's CJS evaluator
  external: [],
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'styles.css'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  }
})
