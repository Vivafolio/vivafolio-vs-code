import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
export default defineConfig({
  plugins: [solid()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: { 
      input: 'src/index.tsx', 
      output: { 
        entryFileNames: 'index.js',
        format: 'cjs'
      } 
    },
  },
});