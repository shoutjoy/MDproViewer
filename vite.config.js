import { defineConfig } from 'vite'
import { access, cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Classic (non-module) scripts/assets are not bundled; copy them into dist for preview/run.py.
const STATIC_RUNTIME_DIRS = [
  'js',
  'trt',
  'Setting',
  'hotkey',
  'imageDB',
  'file_format',
  'sidebarAI',
  'ShareSites',
  'AI_App',
  'sidebar_left',
  'HighLights',
  'css',
  'Icon',
  'vendor',
  'Apps',
]

function copyStaticRuntimeAssets() {
  return {
    name: 'copy-static-runtime-assets',
    async closeBundle() {
      const outDir = resolve(__dirname, 'dist')
      for (const dir of STATIC_RUNTIME_DIRS) {
        const src = resolve(__dirname, dir)
        try {
          await access(src)
        } catch {
          continue
        }
        await cp(src, resolve(outDir, dir), { recursive: true, force: true })
      }
    },
  }
}

export default defineConfig({
  root: '.',
  // Multi-page app: disable SPA fallback. Otherwise missing iframe URLs
  // (e.g. ./js/Html2pptx/jenaEditor/index.html) return index.html and nest forever.
  appType: 'mpa',
  publicDir: false,
  plugins: [tailwindcss(), copyStaticRuntimeAssets()],
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
