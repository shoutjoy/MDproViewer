import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: '.',
  publicDir: false,
  plugins: [tailwindcss()],
  optimizeDeps: {
    include: ['marked', 'jszip', 'lucide', 'katex', 'mathjax/es5/tex-mml-chtml.js'],
  },
  server: {
    port: 5173,
    open: true,
    // Match previous Python static server: avoid aggressive caching while developing
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  },
  preview: {
    port: 4173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'pdf-viewer': resolve(__dirname, 'pdf-viewer.html'),
        'pptx-viewer': resolve(__dirname, 'pptx-viewer.html'),
      },
    },
  },
})
