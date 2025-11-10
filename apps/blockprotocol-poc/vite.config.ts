import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig(({ mode }) => ({
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      external: ['solid-js', 'vue', 'svelte', 'svelte/internal', 'lit', '@angular/core'],
      output: {
        // Handle CommonJS imports
        interop: 'auto'
      }
    },
    sourcemap: mode === 'development' ? 'inline' : false,

  },
  plugins: [
    vue(),
    svelte()
  ],
  server: {
    port: 5173,
    strictPort: false
  },
  optimizeDeps: {
    include: ['solid-js', 'vue', 'svelte', 'lit', '@angular/core', '@vivafolio/block-loader']
  }
}))
