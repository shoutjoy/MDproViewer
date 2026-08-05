## 2026-08-06 — MDproViewer AI Jena 통합

- `AI_App (2)`의 AI Jena 채팅·스트리밍·문서 삽입·답변 미리보기 기능을 MDproViewer의 `AI_App`으로 통합했다.
- 크롬 확장의 다른 웹사이트 탭에서 동작하는 사이드패널·전역 페이지 브리지는 포함하지 않았다.
- MDproViewer 전용 `AIChatBridge`를 유지하고, 새창의 렌더 HTML 삽입 옵션을 지원하도록 확장했다.

---

## 2026-07-28 — Gemini Notebook 도메인 이전 (`notebook.google.com`)

### 원인
`https://notebooklm.google.com/` → **`https://notebook.google.com/`** 로 리다이렉트.
확장은 옛 호스트만 content_scripts/매칭 → 새 도메인에서 사이드바·헤더 미주입.

### 수정
- `manifest.json`: `host_permissions` / `content_scripts` / `web_accessible_resources`에 `https://notebook.google.com/*` 추가
- 탭 조회·호스트 판별: `notebooklm` + `notebook.google.com` 병행
- 기본 열기 URL: `https://notebook.google.com/`
- Gemini 노트북 「열기」: 팝업 창 대신 **일반 탭** (`notebook.google.com`)

### 재로드
확장 프로그램 재로드 후 `notebook.google.com`에서 동작 확인.

---

## 2026-07-27 — LM Studio 주소 자동 탐색

### 목적
LM Studio Developer 화면의 **Reachable at** 주소(예: `http://172.30.1.36:5678`)를 환경설정 Base URL에 자동 반영.

### 동작
- 로컬 후보 호스트: `127.0.0.1`, `localhost`, WebRTC로 수집한 LAN IPv4, 기존 Base URL 호스트
- 포트: 현재 설정 포트 + `5678`, `1234`
- 프로브: `GET /lmstudio-greeting`, `GET /api/v1/models` (200 또는 401이면 서버로 인정)
- LAN IP가 localhost보다 **우선** (정렬 시 loopback 뒤로)
- 성공 시 `inpAiChatLmBaseUrl` ← `{root}/v1`

### 트리거
| 시점 | 비고 |
|------|------|
| LM Studio 설정 `<details>` 펼침 | silent 탐색 + 로드 모델 확인 |
| 환경설정 로드(`hydrateAiChatFields`) | 동일 |
| 「현재 로드 모델 확인」/「LM 연결 테스트」 | 기존 URL 실패 시 자동 탐색 후 재시도 |
| 「LM Studio 주소 자동 찾기」 버튼 | 수동 |

### 저장
탐색만으로는 영구 저장 안 됨 → **「LM 설정 저장」** 또는 환경설정 전체 **저장** 필요.

### 주요 파일
- `popup_setting/popup-settings.js` — `discoverLmStudioBaseUrl`, `probeLmStudioRoot`, `collectLocalIpv4Candidates`
- `popup_setting/popup-settings.html` — 버튼·설명 문구

### 이식 시
- `chrome.storage.local` 키 `scholarAiChatSettingsV1.lmStudio.baseUrl`와 UI 필드만 맞추면 됨.
- `host_permissions`: `http://127.0.0.1/*`, `http://*/*` 등 로컬/LAN fetch 허용 필요.

---

## 2026-07-27 — AI Jena 표시 통제 (설정 연동)

### 목적
환경설정 **「AI Jena 사용」** (`scholarAiChatSettingsV1.enabled`, 기본 `false`)와 실제 UI 일치.

### 문제
`ai-chat.js`는 `localStorage` 키 `ss_ai_chat_enabled`만 보던 반면, 설정 UI는 `chrome.storage.local`만 갱신 → 꺼도 플로팅/스튜디오 버튼이 뜨는 현상.

### 해결
- `init()`에서 `scholarAiChatSettingsV1.enabled` → `ss_ai_chat_enabled` 동기화
- `chrome.storage.onChanged`로 실시간 `setEnabled()`
- Studio 헤더 **AI Jena** 버튼: `AIChat.isEnabled()`일 때만 렌더 (`content.js` `injectStudioPromptLauncher`)

### 주요 파일
- `AI_App/aiChat/ai-chat.js`
- `content.js`

---

## 2026-07-27 — 답변 복사·미리보기·문서 삽입 (채팅 vs 새창)

### 설계 원칙 (다른 앱 이식 시 핵심)

| 위치 | 복사 | 문서에 넣기 |
|------|------|------------|
| **채팅 패널** (`ai-chat.js` 메시지 액션) | MD **raw** / MD **render** / Q&A | **Markdown 원문 그대로** (`insertQuestionAnswer` → plain `insertIntoDocument`) |
| **새창 보기** (`ai-chat-answer-view.html`) | 동일 + MD/PV 탭 | **렌더 HTML** 4종 (대체·커서·한 줄 아래·맨 아래) |

- 채팅: `문서에 넣기 ▾` 유지 (원문).
- 렌더 삽입은 **반드시 새창**에서만.

### 새 파일
| 파일 | 역할 |
|------|------|
| `ai-chat-markdown.js` | `AIChatMarkdown.toHtml` / `toPlainText` / `copyRaw` / `copyRendered` (marked) |
| `ai-chat-answer-view.html` | MD·PV 탭, 삽입·복사 UI |
| `ai-chat-answer-view.js` | 세션 payload 로드, 탭/프레임 삽입 라우팅 |
| `ai-chat-answer-view.css` | 새창 레이아웃 |

### 채팅 패널 UI (`renderMessages` assistant 액션)
- `MD raw 복사`, `MD render 복사`, `Q&A 복사`
- `문서에 넣기 ▾` (4옵션, 원문)
- `새창에서 보기` → `chrome.storage.session` `aiChatAnswerViewLatest` + `chrome.windows.create` 팝업

### 새창 데이터
```js
chrome.storage.session.set({
  aiChatAnswerViewLatest: { markdown, question, createdAt }
});
```

### manifest / 로드 순서
- NotebookLM content_scripts: `marked.min.js` → `ai-chat-markdown.js` → `ai-chat.js`
- `ai-jena-app.html`에도 동일 스크립트 추가
- `web_accessible_resources`에 answer-view·markdown 관련 경로

### README
- `AI_App/aiChat/README.md` — 채팅/새창 역할 구분 반영

---

## 2026-07-27 — 렌더 HTML 삽입 (브라우저 전역·커서)

### 목적
새창에서 넣기 시 NotebookLM뿐 아니라 **네이버 블로그 등** 마지막으로 클릭한 편집기·커서 위치에 삽입.

### 아키텍처
1. **`ai-jena-page-bridge.js`** (모든 `http(s)://` 프레임)
   - `isEditor` 확장: `contenteditable`, `role=textbox`, textarea 등
   - `lastEditor`, `lastInputSelection`, `lastContentRange` 유지
   - `insertText` / `insertHtml` (contenteditable은 `execCommand('insertHTML')`)
   - 메시지: `aiJenaInsertIntoActivePage`, `aiJenaGetEditorState`
   - 포커스 시 `aiJenaEditorTouched` → background에 tabId·frameId 저장

2. **`background.js`**
   - `aiJenaEditorTouched` → `chrome.storage.session` `aiJenaLastEditorTarget`
   - `aiJenaResolveInsertTab` → 마지막 편집기 탭 우선, 없으면 `getLastFocused({ windowTypes: ['normal'] })` 활성 탭

3. **`ai-chat-answer-view.js`**
   - 모든 프레임에 `aiJenaGetEditorState` → `touchedAt` 최대 프레임에 삽입
   - 실패 시 `executeScript`로 bridge 재주입 후 재시도
   - 실패 시 `aiJenaPendingGlobalInsertV1`에 HTML 저장 → 대상 탭에서 **Ctrl+I**

4. **NotebookLM 전용** (`content.js`)
   - `ScholarAIChatEditorHooks.insertHtml` — 채팅/브리지 경로 보강

5. **`ai-chat-bridge.js`**
   - `insertIntoDocument(text, mode, options)` — `options.format === 'html'` 시 `insertHtml`

### 사용자 순서
1. 대상 웹페이지 **편집기 클릭** (커서·선택 위치 확정)
2. AI Jena 새창에서 **문서에 넣기** 선택
3. 실패 시 편집기 다시 클릭 후 **Ctrl+I**

### textarea 편집기
렌더 삽입 시 HTML 대신 **plain text**(렌더 결과의 텍스트) 삽입.

---

## 2026-07-27 — 기타 UI (같은 기간 작업)

### Research Assistant에서 AI Jena 버튼 제거
- `popup.html` / `popup.js` / `popup.css` — Assist 헤더의 Dock 토글 제거 (NotebookLM 쪽 AI Jena와 역할 분리)

### 폴더 목록 띠 상하 드래그
- `folder/folder-library-ui.js` — 접힌 사이드바 띠 `bandTopPx`, 드래그, `scholarFolderSidebarBandTop` 저장 (NotebookLM 폴더 UI, aiChat과 무관)

---

## 다른 앱 aiChat 이식 체크리스트

### 필수 모듈
- [ ] `ai-chat-markdown.js` + `marked.min.js`
- [ ] `ai-chat-answer-view.{html,js,css}`
- [ ] `ai-jena-page-bridge.js` (전역 http(s) content script, `all_frames: true`)

### 설정·상태
- [ ] `scholarAiChatSettingsV1.enabled` ↔ 로컬 enabled 플래그 동기화
- [ ] LM Studio: `discoverLmStudioBaseUrl` 또는 동등 API

### 삽입 API 계약
```js
// 원문 (채팅)
insertIntoDocument(markdown, mode);

// 렌더 (새창)
insertIntoDocument(plainFallback, mode, {
  format: 'html',
  html: renderedHtml,
  plainText: renderedPlain
});

// 또는 탭 메시지
{ action: 'aiJenaInsertIntoActivePage', format: 'html', html, plainText, mode }
```

### Background 메시지
- `aiJenaEditorTouched`
- `aiJenaResolveInsertTab`

### Storage 키
| 키 | 용도 |
|----|------|
| `scholarAiChatSettingsV1` | AI Jena·LM Studio 설정 |
| `ss_ai_chat_enabled` | 런타임 enabled (페이지 localStorage) |
| `aiChatAnswerViewLatest` | session, 새창 payload |
| `aiJenaLastEditorTarget` | session, 마지막 편집기 tabId/frameId |
| `aiJenaPendingGlobalInsertV1` | local, Ctrl+I 대기 삽입 |

### 테스트 시나리오
1. 설정 AI Jena off → 플로팅·Studio AI Jena 없음
2. LM Studio LAN 주소 자동 탐색 → 모델 확인
3. 채팅: MD raw/render 복사, 원문 문서에 넣기
4. 새창: PV 확인, 렌더 삽입 (NotebookLM + 외부 블로그 iframe)
5. 새창 열린 상태에서 삽입 → 뒤쪽 브라우저 탭 타깃
6. Ctrl+I 폴백

---

## 변경 파일 목록 (aiChat 중심)

```
AI_App/aiChat/
  ai-chat.js                 # enabled 동기화, 복사/새창/삽입 옵션
  ai-chat-bridge.js          # insertHtml 옵션
  ai-chat-markdown.js        # 신규
  ai-chat-answer-view.html   # 신규
  ai-chat-answer-view.js     # 신규
  ai-chat-answer-view.css    # 신규
  ai-chat-editor-adapter.js  # insertHtml
  ai-jena-page-bridge.js     # insertHtml, editor touch, isEditor
  ai-jena-app.js             # activeBrowserTab, insertHtml 브리지
  ai-jena-app.html           # marked + markdown 스크립트
  README.md

popup_setting/popup-settings.js
popup_setting/popup-settings.html

content.js                   # insertHtml hooks, Studio AI Jena gate
background.js                # editor touch, resolve insert tab
manifest.json                # 스크립트 순서, web_accessible_resources
```
