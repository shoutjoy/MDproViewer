# Scholarref Bundle

`js/Scholarref` now contains a portable Scholar Search + Reference Management bundle.

## Files
- `scholarsearch-shell.html`: Scholar Search + Reference management UI markup source.
- `scholarsearch-shell.js`: Scholar Search shell logic + bridge methods + dynamic mount logic.
- `scholarref.js`: Reference management data/editing module.
- `scholarref.css`: Reference management styles.

## Minimal Host Integration
1. Load CSS: `./js/Scholarref/scholarref.css`
2. Load scripts (defer):
   - `./js/Scholarref/scholarref.js`
   - `./js/Scholarref/scholarsearch-shell.js`
3. `scholarsearch-shell.js` tries to load `scholarsearch-shell.html` first and mounts it into `#scholar-search-slot` (or `body` fallback).
4. Configure from host app (optional but recommended):

```js
window.ScholarSearchShell.init({
  dbGetter: () => db,
  getEditor: () => editorTextarea,
  showToast: (msg) => showToast(msg),
  getEditorSelectedText: () => getEditorSelectedText(),
  getDocumentBaseUrl: () => getDocumentBaseUrl()
});
```

## Fallback Sync Automation
- Purpose: keep JS fallback template synchronized with `scholarsearch-shell.html` in case HTML fetch fails at runtime.
- Command:

```bash
node ./js/Scholarref/sync-fallback-from-html.js
```

- What it does:
  - Reads `scholarsearch-shell.html`
  - Regenerates the auto-generated fallback block in `scholarsearch-shell.js`
  - Keeps `getTemplateHtml()` aligned with the latest HTML source

## Global APIs Exposed
- Scholar Search: `openScholarSearchModal`, `closeScholarSearchModal`, `runScholarSearchFromModal`, `quickScholarSearchFromSelection`, `toggleScholarSearchDockRight`, `toggleScholarSearchShrink`
- Reference bridge: `toggleScholarRefPanel`, `switchScholarRefTab`, `setScholarRefInputMode`, `scholarRefApplyInput`, `scholarRefClearInput`, `openScholarRefTxtImport`, `openScholarRefMdImport`, `importScholarRefTxt`, `importScholarRefMd`, `renderScholarRefSelectionList`, `toggleScholarRefPick`, `selectAllScholarRefs`, `clearScholarRefSelection`, `insertSelectedScholarRefs`, `insertAllScholarRefSection`, `downloadScholarRefTxt`, `downloadScholarRefMd`, `openScholarRefListWindow`, `deleteScholarRefItem`, `clearAllScholarRefs`
