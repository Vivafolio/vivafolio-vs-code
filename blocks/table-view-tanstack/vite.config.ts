
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'path'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@packages/block-frameworks/solidjs': path.resolve(__dirname, '../../packages/block-frameworks/solidjs/src/index.tsx')
    }
  },
  build: {
    target: 'esnext',
    lib: {
      entry: 'src/index.ts',
      name: 'TableViewBlock',
      fileName: 'app',
      formats: ['es']
    },
    rollupOptions: {
      // Mark Solid runtime entries as external so Rollup doesn't try to resolve jsx exports from 'solid-js'
      external: [
        'solid-js',
        'solid-js/web',
        'solid-js/jsx-runtime',
        '@tanstack/solid-table',
        '@tanstack/solid-virtual'
      ]
    }
  }
})
