# MD Viewer 학술검색 사용자 설명서

이 문서는 MD Viewer의 학술검색, Crossref 검색 결과 탐색기, 참고문헌 관리 기능과 새 모듈 구조를 함께 설명한다. 기존 `README.md`는 이전 연결 방식의 호환 문서로 그대로 유지하며, 현재 구조와 사용법은 이 문서를 기준으로 한다.

## 1. 기능 열기

1. MD Viewer의 `설정`을 연다.
2. 기능 목록에서 `학술검색 보이기`를 체크한다.
3. 상단 도구 모음의 `학술검색` 버튼을 누르거나 `Alt + S`를 누른다.
4. 검색어를 입력하고 필요한 옵션을 선택한 뒤 `Search`를 누른다.

편집기에 선택된 텍스트가 있으면 학술검색 입력창을 열 때 검색어 초깃값으로 사용할 수 있다.

## 2. 검색 방식

### Google Scholar

Google Scholar 검색은 브라우저의 새 탭에서 연다. 언어 우선순위, 검색 기간, `Review/Survey only` 옵션을 검색어에 반영한다.

### Crossref 동시검색

`Crossref 동시검색`을 체크하면 Google Scholar 검색과 함께 Crossref 공개 API를 조회한다.

- 결과 개수: 1~50건
- 기본 개수: 15건
- 검색 기간: 전체, 최근 1년, 5년, 10년
- Review/Survey 조건: 검색어에 review/survey 조건을 추가
- 결과 보강: 초록이 있는 문헌을 우선하고 부족한 수는 일반 서지 메타데이터로 보충
- 중복 제거: DOI 또는 정규화한 논문 제목 기준

Crossref가 제공하지 않는 초록이나 서지 항목은 앱이 임의로 생성하지 않는다.

## 3. Crossref 결과 탐색기

Crossref 검색이 끝나면 앱 내부에 결과 탐색기가 열린다. 창은 문서를 가리지 않도록 이동할 수 있고, 영역 사이 구분선을 드래그해 너비를 조절할 수 있다.

### APA 참고문헌 영역

- 검색 결과를 APA 형식으로 표시한다.
- 각 항목의 제목을 눌러 해당 PV 위치로 이동한다.
- 항목별 복사와 전체 복사를 지원한다.
- `문헌관리로 보내기`를 누르면 APA 목록을 참고문헌 관리 입력란으로 전달한다.

### MD 편집 영역

- Crossref 결과 Markdown 원문을 직접 편집한다.
- `MD 복사`로 전체 원문을 복사한다.
- `MD 저장`으로 `.md` 파일을 내려받는다.
- `현재 문서로 열기`로 결과를 메인 편집기에 전달한다. 기존 문서 내용이 있으면 교체 여부를 확인한다.

### PV 편집·미리보기 영역

- Markdown을 렌더링한 결과를 확인한다.
- PV를 직접 편집하면 Markdown과 목차가 다시 동기화된다.
- DOI 링크는 새 탭에서 연다.
- `전체`, `MD만 보기`, `PV만 보기`로 작업 화면을 바꿀 수 있다.

## 4. 검색 결과 저장소

### CrossrefBank(SQL)

- 설정에서 SQLite 사용이 켜진 경우에만 사용할 수 있다.
- Crossref 결과 Markdown을 SQLite 계열 저장소에 저장하고 다시 불러온다.
- SQLite API를 사용할 수 없을 때에는 설정된 WASM/OPFS 경로를 시도한다.
- SQL 탐색기는 SQLite 설정이 꺼져 있으면 직접 호출도 차단한다.

### CrossrefBank(inDB)

- IndexedDB 전용 저장소이다.
- SQLite 설정과 관계없이 저장·목록·불러오기를 사용할 수 있다.
- 저장 목록에는 실제 저장 백엔드 표시가 함께 나타난다.

## 5. GitHub 공유

결과 탐색기의 `GitHub 공유`를 열면 설정에 저장된 GitHub PAT를 사용한다.

1. 접근 가능한 저장소를 불러온다.
2. 저장소, 브랜치, 폴더와 파일명을 선택한다.
3. `현재 MD 공유`를 눌러 파일을 생성하거나 갱신한다.
4. 완료 후 `GitHub에서 열기`로 업로드된 파일을 확인한다.

Git은 빈 폴더를 저장하지 않으므로 `폴더 생성`은 선택한 경로에 `.gitkeep`을 만든다. PAT는 문서나 내보내기 파일에 포함하지 않는다.

## 6. 참고문헌 관리

학술검색 창의 `Reference management`를 누르면 참고문헌 패널이 열린다.

### 참고문헌 추가

- APA 참고문헌을 빈 줄 또는 한 줄 단위로 붙여넣는다.
- TXT와 MD 파일을 가져올 수 있다.
- 같은 참고문헌은 정규화된 텍스트를 기준으로 중복을 줄인다.

### 인용 삽입

- 저자, 연도, 키워드로 저장 목록을 검색한다.
- 인라인 `(저자, 연도)` 또는 서술형 `저자(연도)` 형식을 선택한다.
- 선택한 인용을 현재 커서 위치에 삽입한다.
- 필요하면 문서 끝에 References 섹션을 함께 추가한다.

### 저장 목록

- 전체 References 섹션 삽입
- TXT/MD 다운로드와 MD 불러오기
- STORAGE 또는 inDB 저장·가져오기
- 새 창 목록 보기
- GitHub `Reference` 폴더 push/pull
- 개별 삭제 또는 전체 삭제

학술지명과 권(volume)은 APA 7 형식에 맞춰 이탤릭으로 표시하고, 호(issue)는 괄호 안 일반체로 유지한다.

## 7. 모듈 구조

학술검색은 메인 앱에서 분리되어 `js/Scholarref` 아래에 기능별로 구성된다.

| 경로 | 객체/역할 |
| --- | --- |
| `integration/scholar-search-app.js` | `ScholarSearchApp`, 메인 앱 연결·화면 진입점·지연 로드·표시 설정 |
| `ui/scholarsearch-shell.js` | `ScholarSearchShell`, 검색창·Crossref 결과 탐색기·저장·GitHub·참고문헌 브리지 |
| `ui/scholarsearch-shell.html` | 검색창과 결과 탐색기의 HTML 원본 |
| `crossref/search.js` | `ScholarCrossrefSearch`, Crossref API 조회·정규화·Markdown/APA 변환 |
| `ai/academic-search.js` | AI Jena용 OpenAlex 검색·Crossref 보강·근거/Markdown 변환 |
| `reference/scholarref.js` | `ScholarRef`, 참고문헌 저장·검색·삽입·내보내기·GitHub 연동 |
| `styles/scholarref.css` | 학술검색과 참고문헌 화면 스타일 |
| `tools/sync-fallback-from-html.js` | HTML 원본을 셸의 내장 폴백 템플릿과 동기화 |

루트의 `scholarref.js`, `crossref-search.js`, `scholarsearch-shell.js`, `scholarref.css`, `sync-fallback-from-html.js`는 기존 경로를 사용하는 코드와 문서를 위한 호환 진입점이다. `AI_App/aiChat/academic-search.js`도 이전 경로 호환 로더만 유지한다. 실제 학술검색 구현은 위 하위 폴더에 있다.

`ScholarAI` 사이드바, AI 모델 공급자, SQLite/inDB 저장 서비스와 설정 UI는 학술검색 전용 코드가 아니라 다른 기능도 함께 사용하는 독립·공용 모듈이므로 `Scholarref`로 이동하지 않는다. `Scholarref`는 이 모듈들의 공개 API만 연결해 사용한다.

## 8. 객체 연결 방식

메인 앱은 개별 학술검색 함수들을 소유하지 않고 `ScholarSearchApp`에 필요한 호스트 기능만 전달한다.

```javascript
window.ScholarSearchApp.connectHost({
  dbGetter: () => db,
  getEditor: () => editorTextarea,
  showToast: (message) => showToast(message),
  getEditorSelectedText: () => getEditorSelectedText(),
  getDocumentBaseUrl: () => getDocumentBaseUrl(),
  saveSettings: (patch) => setAiSettings(patch),
  syncHeaderVisibility: () => syncHeaderFeatureToolsVisibility()
});
```

공개 객체는 다음과 같다.

```javascript
ScholarSearch.App         // 통합 진입점
ScholarSearch.Shell       // 로드된 검색/결과 UI 객체
ScholarSearch.Crossref    // 로드된 Crossref 검색 객체
ScholarSearch.References  // 로드된 참고문헌 객체
ScholarSearch.AcademicSearch // AI Jena용 OpenAlex/Crossref 검색 객체
```

`ScholarSearchApp.open()`을 처음 호출할 때 무거운 참고문헌, Crossref, 결과 셸 스크립트를 순서대로 불러온다. 기존 `openScholarSearchModal()` 호출은 호환 래퍼를 통해 같은 객체로 연결된다.

## 9. HTML 폴백 동기화

`ui/scholarsearch-shell.html`을 수정한 뒤에는 반드시 폴백 템플릿을 동기화한다.

```powershell
node js\Scholarref\sync-fallback-from-html.js
```

이 명령은 실제 도구인 `tools/sync-fallback-from-html.js`를 실행하며, `ui/scholarsearch-shell.js` 안의 자동 생성 폴백 블록을 갱신한다.

## 10. 점검 명령

```powershell
node --check js\Scholarref\integration\scholar-search-app.js
node --check js\Scholarref\ui\scholarsearch-shell.js
node --check js\Scholarref\crossref\search.js
node --check js\Scholarref\reference\scholarref.js
node scripts\test-scholar-module-layout.js
node scripts\test-academic-search-crossref.js
node scripts\test-scholarref-apa-format.js
node scripts\test-scholar-sqlite-explorer.js
```

## 11. 제한사항

- Google Scholar 결과는 사이트 정책과 브라우저 제약 때문에 앱 내부에서 수집하지 않고 외부 검색 탭으로 연다.
- Crossref 결과 품질과 초록 제공 여부는 등록기관이 공개한 메타데이터에 좌우된다.
- 실제 GitHub 업로드, 외부 네트워크 검색, 브라우저 팝업 동작은 오프라인 자동 검사만으로 확인할 수 없다.
- 메인 문서로 결과를 열면 기존 내용을 바꿀 수 있으므로 확인창의 대상 문서를 확인한다.
