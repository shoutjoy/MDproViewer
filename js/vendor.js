/**
 * Load npm packages once and expose CDN-compatible globals
 * used by classic (non-module) scripts in this app.
 */
import { marked } from 'marked'
import JSZip from 'jszip'
import { createIcons, icons } from 'lucide'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'mathjax/es5/tex-mml-chtml.js'

window.marked = marked
window.JSZip = JSZip
window.katex = katex

window.lucide = {
  icons,
  createIcons(options) {
    const opts = options && typeof options === 'object' ? options : {}
    return createIcons({
      ...opts,
      icons: opts.icons || icons,
    })
  },
}
