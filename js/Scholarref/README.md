# Scholarref Bundle

`js/Scholarref` now contains a portable Scholar Search + Reference Management bundle.

## Files
- `scholarsearch-shell.html`: Scholar Search + Reference management UI markup source.
- `scholarsearch-shell.js`: Scholar Search shell logic + bridge methods + dynamic mount logic.
- `scholarref.js`: Reference management data/editing module.
- `scholarref.css`: Reference management styles.
- `crossref-search.js`: Scholar Search 전용 Crossref API 검색 및 Markdown 결과 변환 모듈.
- `CROSSREF_SEARCH.md`: Crossref 동시검색과 MD/PV 미러 편집 기능 설명서.

## APA 학술지 서식

- 저장 목록과 선택 목록에서는 학술지명과 권(volume)을 HTML 이탤릭으로 표시합니다.
- `참고문헌 섹션 삽입`, 인용 삽입 시 References 추가, MD 다운로드 및 GitHub MD 저장에는 같은 부분을 Markdown 이탤릭(`*...*`)으로 기록합니다.
- APA 7판에 따라 호(issue)는 권 바로 뒤의 괄호 안에 일반체로 유지합니다. 예: `*Journal Name, 20*(4), 163–180.`
- 기존에 저장된 일반 텍스트 참고문헌도 `학술지명, 권(호), 페이지` 구조를 인식할 수 있으면 자동으로 같은 서식을 적용합니다.
- 문서 PV, miniPV, 새창 PV 및 Crossref 미러 PV에서 `doi.org` 링크는 현재 문서를 벗어나지 않고 새 탭으로 열립니다.

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
