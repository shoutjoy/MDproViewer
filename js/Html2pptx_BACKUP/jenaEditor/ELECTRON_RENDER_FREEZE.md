# GenSlide Electron Render Freeze Note

Date: 2026-04-07

## Goal
Keep the current working GenSlide render behavior in Electron exactly as-is.

## Verified stable points
- UI fragments mount correctly in Electron package output.
- No `GenSlide boot failed` for `./js/state.js` path resolution.
- Header / Slides / HTML Code / Editor split layout renders in normal structure.

## Required implementation (already applied)
- File: `js/Html2pptx/jenaEditor/js/controller.js`
- App base path resolution from controller script location (`../`).
- Fragment load fallback: `fetch` -> `XMLHttpRequest`.
- Fragment sanitization before slot replacement:
  - remove BOM and broken prefix (`ï»¿`, `癤?`)
  - if full document wrapper exists, use only `body.innerHTML`.

## Packaging guardrails
- Do not convert `ui/*.html` into full documents.
- Do not prepend/patch encoding bytes in `ui/*.html`.
- Keep fragment files as plain partial HTML.

## If issue returns
1. Check packaged file: `web/js/Html2pptx/jenaEditor/ui/main.html`
2. If first chars are corrupted (e.g., `癤?div`), packaging encoding step must exclude `ui/*.html`.
3. Confirm packaged `controller.js` includes fragment normalization logic.
