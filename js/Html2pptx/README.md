# Html2pptx (GenSlide) Isolation Notes

This folder is designed to run independently from the main mdproviewer app.

## Scope
- Entry page: `html2pptx.html`
- Main app: `jenaEditor/index.html`, `jenaEditor/styles.css`
- Split UI fragments:
  - `jenaEditor/ui/main.html`
  - `jenaEditor/ui/header.html`
  - `jenaEditor/ui/leftSidebar.html`
  - `jenaEditor/ui/htmlcode.html`
  - `jenaEditor/ui/editor.html`
- Split scripts:
  - `jenaEditor/js/state.js`
  - `jenaEditor/js/ui.js`
  - `jenaEditor/js/htmlcode.js`
  - `jenaEditor/js/editor.js`
  - `jenaEditor/js/save.js`
  - `jenaEditor/js/export.js`
  - `jenaEditor/js/main.js`
  - `jenaEditor/js/controller.js` (UI assembly + bootstrap/orchestration)
- Legacy reference script (not loaded): `legacy/html2pptx_ex.js`

## Isolation rules applied
- Dedicated IndexedDB: `GenSlideDB`
- Dedicated message channel: `genslide-open-slide`
- Dedicated export format id: `genslide-html2pptx-mpp`
- Dedicated popup window names: `genslide_gallery`, `genslide_slideshow`
- Feature domains are split by file to avoid concentration in one script.

## Integration guidance
- If mdproviewer opens GenSlide, call/open only `js/Html2pptx/html2pptx.html`.
- Do not import files under `jenaEditor/js/` into the main mdproviewer bundle.
- Keep all new GenSlide features implemented under `js/Html2pptx/**` only.

## Electron stability (fixed state)
- Current stable fix is applied in `jenaEditor/js/controller.js`.
- `controller.js` now:
  - Resolves UI/script paths from the `jenaEditor` app base (not parent page location).
  - Uses `fetch` + XHR fallback for local file loading.
  - Normalizes broken UI fragment text before mounting:
    - strips BOM/mojibake prefix (`ï»¿`, `癤?`)
    - if wrapped as full HTML document, extracts only `body.innerHTML`
- This prevents UI mount failures in packaged Electron (`file://`) environments.

### Build pipeline caution
- Do not re-encode or wrap files under `js/Html2pptx/jenaEditor/ui/*.html`.
- If a packaging step injects `<html><body>` wrappers or corrupts leading bytes, GenSlide layout can collapse without obvious JS runtime errors.
- Keep UI fragments as raw partial HTML snippets.

## Cleanup candidate
- `legacy/html2pptx_ex.js` appears to be old sample code and is not referenced by current pages.
- `legacy/jenaEditor_app.js` is the previous monolithic script backup and is not loaded by current pages.
  Keep for reference or remove after final verification.
