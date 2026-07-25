# MDproViewer 앱 폴더 트리

## 목표
전체 구조를 통해서 분석하고, inDB로 임시로 저장해서 사용하던 데이터를 sqlite로 저장관리하고, inDB는 자동저장, 음시저장을 통해서 앱을 안정적으롱유지하기 위한 것으로 사용한다. 그리고, sqqlite로 문서저장과 여러가 학술검색의 인용정보, 서지관리 정보, 프롬프트, 각종 다양한 세팅 정보를 로컬sqlite에 저장해서 활용한다. 특히 문서, aichat 내용 저장 등 다양한 정보를 저장하여 활용하려고 한다. 


대상 경로: `C:\CusorApps\md-viewerVscode\md_viewer`

이 문서는 앱 개발에 필요한 소스 구조를 중심으로 정리한다. `.git`, 에이전트 설정, 외부 라이브러리의 세부 파일, SQLite 실행 파일 목록은 간략하게 표시했다.

```text
md_viewer/
├── index.html                         # 메인 앱 화면과 모달·툴바·스크립트 로드
├── css/
│   └── style.css                      # 앱 공통 레이아웃과 테마
├── js/
│   ├── app.js                         # 앱 상태, 편집기, 설정, 저장, 주요 기능 통합
│   ├── command/
│   │   └── at-command-menu.js         # @ 명령 메뉴와 기능·사이트·양식 검색
│   ├── Markdown_bold.js               # Markdown 굵게 처리 보정
│   ├── md_long_equals.js              # 긴 등호 구문 처리
│   ├── md_notebooklm_equals_hr.js     # NotebookLM 형식 구분선 보정
│   ├── md_numeric_range.js             # 숫자 범위 Markdown 처리
│   ├── crop/
│   │   ├── crop.html                  # 이미지 자르기 화면
│   │   ├── crop-window.js             # Crop 창 제어
│   │   ├── crop-popup.js              # Crop 팝업 연결
│   │   └── img-crop-insert.js         # 자른 이미지 편집기에 삽입
│   ├── extendFiles/
│   │   └── extend-files.js            # 확장 파일 처리
│   ├── GenSlide/
│   │   ├── html2pptx.html             # GenSlide 진입 화면
│   │   ├── README.md
│   │   └── jenaEditor/
│   │       ├── index.html             # 슬라이드 편집기
│   │       ├── styles.css
│   │       ├── autoSlideMake.md
│   │       ├── js/
│   │       │   ├── main.js            # 슬라이드 앱 시작
│   │       │   ├── state.js           # 슬라이드 상태
│   │       │   ├── editor.js          # 슬라이드 편집
│   │       │   ├── controller.js      # 이벤트·기능 제어
│   │       │   ├── ui.js              # UI 연결
│   │       │   ├── save.js            # 저장
│   │       │   ├── export.js          # 내보내기 진입
│   │       │   ├── htmlcode.js        # HTML 코드 편집
│   │       │   ├── Edit/              # 개체·텍스트·레이어 편집
│   │       │   └── Export/            # 이미지·MPP·PPT 내보내기
│   │       ├── ui/                     # 편집기 화면 조각
│   │       └── Edit/                   # 편집 규칙 문서
│   ├── GithubData/
│   │   ├── github-app.js              # GitHub 앱 기능
│   │   ├── github-settings.js         # GitHub 설정 로직
│   │   └── github-settings-ui.html    # GitHub 설정 화면
│   ├── Html2pptx/
│   │   ├── html2pptx.html             # HTML → PPTX 기능
│   │   ├── README.md
│   │   └── jenaEditor/                # PPTX 편집·가져오기·내보내기
│   ├── Html2pptx_BACKUP/               # 이전 HTML2PPTX 구현 백업
│   ├── Imagetool/
│   │   └── link-image-modal.js         # 링크 이미지 삽입 모달
│   ├── math_render/
│   │   ├── math_render.js              # 수식 렌더링
│   │   ├── latex_render.js             # LaTeX 렌더링
│   │   ├── math_render_template.html
│   │   └── README.md
│   ├── MergeDoc/
│   │   ├── merge.js                    # 문서 합치기
│   │   └── merge-modal.html            # 문서 합치기 화면
│   ├── mermaid/
│   │   ├── mermaid_render.js           # Mermaid 렌더링
│   │   └── mermaid-editor/
│   │       ├── index.html
│   │       ├── app.js
│   │       ├── html-export.js
│   │       ├── style.css
│   │       └── README.md
│   ├── Scholarref/
│   │   ├── scholarref.js               # 참고문헌 관리
│   │   ├── scholarref.css
│   │   ├── scholarsearch-shell.js      # 학술검색 창
│   │   ├── scholarsearch-shell.html
│   │   ├── sync-fallback-from-html.js
│   │   └── README.md
│   ├── templates/
│   │   ├── templates.js                # 기본 양식 데이터
│   │   └── templates.html              # 양식 UI
│   ├── Tidy/
│   │   └── tidy-actions.js             # Markdown 정리 기능
│   ├── UI_PV/
│   │   ├── minipv.js                   # 미니 미리보기
│   │   ├── minipv.html
│   │   └── editpv.js                   # 편집·미리보기 연결
│   ├── viewmode/
│   │   └── viewmode-edit-input.js      # 보기 모드 편집 입력
│   └── webDAV/
│       └── storage/
│           ├── persistence.js          # 저장 계층 공통 처리
│           ├── autosave.js             # 자동 저장
│           ├── localfs.js              # 로컬 파일 시스템
│           ├── indb.js                 # IndexedDB 저장
│           ├── fm.js                   # 파일 관리자
│           ├── history-save.js         # 문서 이력 저장
│           ├── image-persist.js        # 이미지 영속 저장
│           ├── nas-webdav.js           # NAS/WebDAV 연결
│           ├── mdp-format.js           # MDP 형식
│           └── mdd-zip-format.js       # MDD 압축 형식
├── AI_App/
│   ├── ai_local/
│   │   ├── local-ai.js                 # 로컬 AI 연결
│   │   ├── scholar-ai-provider.js      # ScholarAI 공급자
│   │   ├── local-ai.config.example.js
│   │   ├── ailocal_dev.md
│   │   └── README.md
│   └── aiChat/
│       ├── ai-chat.js                  # AI Chat UI와 대화 처리
│       ├── ai-chat.css
│       ├── academic-search.js          # AI 학술검색
│       └── README.md
├── Apps/
│   └── fmaviewer/
│       ├── index.html                  # 파일·미디어 뷰어
│       ├── css/
│       │   └── styles.css
│       ├── js/
│       │   ├── app.js
│       │   ├── database.js
│       │   ├── fileHandlers.js
│       │   ├── gallery.js
│       │   ├── globals.js
│       │   ├── interaction.js
│       │   └── preview.js
│       └── doc/
│           └── js_manual.md
├── Setting/
│   ├── settings-ui.js                  # 설정 화면 공통 제어
│   └── user.js                         # 사용자 정보 삽입·저장
├── ShareSites/
│   ├── googleDocs.js                   # Google Docs 내보내기·연결
│   ├── googleDocs-settings.html
│   ├── googleDocs-toolbar.html
│   ├── Share/
│   │   ├── share.js                    # Share 대상과 공유 메뉴
│   │   ├── share.css
│   │   ├── share-settings.html
│   │   └── share-toolbar.html
│   └── sitesshow/
│       ├── sitesshow.js                # Sites 목록·사용자 사이트 관리
│       ├── sitesshow-panel.html
│       └── sitesshow-settings.html
├── sidebarAI/
│   ├── sidebar-ai.js                   # ScholarAI·sspimgAI 사이드바
│   ├── sidebar-ai.html
│   ├── sidebar-ai.css
│   ├── Scholarai_prompt.js             # ScholarAI 프롬프트
│   ├── insert.js                       # AI 결과 편집기 삽입
│   ├── config.example.js
│   ├── setting.md
│   ├── README.md
│   └── sketchpad/
│       ├── sketchpad.html
│       ├── sketchpad.css
│       └── ai-sketch-pad.js
├── sidebar_left/
│   └── sidebar-left.js                 # 좌측 파일·목차 사이드바
├── imageDB/
│   ├── imageDB.js                      # 이미지 IndexedDB
│   ├── image_insert.js                 # 이미지 삽입
│   ├── imageBB.html                    # imgBB 연결 화면
│   ├── imageDB_explain.md
│   └── components/
│       ├── image-upload-component.js
│       ├── image-upload-component.css
│       ├── image-upload-demo.html
│       └── README.md
├── trt/
│   ├── special_trt.js                  # 특수 Markdown 변환 규칙
│   ├── editorRule.js                   # 편집기 규칙
│   ├── editor_insert_blocks.js         # 블록 삽입
│   ├── macro.js                        # 매크로 기능
│   ├── view_mode_edit.js               # 보기 모드 명령 실행
│   └── ai-panel-avoid.js               # AI 패널 겹침 방지
├── hotkey/
│   ├── hotkey.js                       # 단축키 처리
│   └── hotkey.html                     # 단축키 안내
├── file_format/
│   └── file_format.js                  # 문서 형식 변환
├── HighLights/
│   └── Highlghts_index.html            # 하이라이트 도구
├── Docs/
│   ├── help.md                         # 도움말
│   ├── history.md                      # 변경 이력
│   ├── DocSync_구현설명.md
│   ├── sqlite-bridge-storage-scope.md
│   ├── StrongRule/                     # 인코딩 규칙
│   └── ...                             # 예제·연구 문서
├── scripts/
│   ├── embed/
│   │   └── inject-sidebar-embed.js     # 사이드바 삽입 스크립트
│   └── layout/
│       └── patch-header-responsive.js  # 헤더 반응형 패치
├── Icon/
│   └── mdproviewer.png                 # 앱 아이콘
├── vendor/
│   ├── pdfjs/                          # PDF.js 외부 라이브러리
│   └── pptxjs/                         # PPTX.js 외부 라이브러리
├── sqlite-dll-win-x64-3530100 (1)/     # Windows SQLite DLL
├── sqlite-tools-win-x64/               # Windows SQLite 도구
├── pdf-viewer.html                     # PDF 전용 뷰어
├── pptx-viewer.html                    # PPTX 전용 뷰어
├── run.py                              # 로컬 실행 서버
├── Privacy Policy
├── .vscode/
│   └── settings.json
└── .gitignore
```

## 주요 실행 흐름

```text
index.html
  ├─ css/style.css
  ├─ js/app.js
  │   ├─ 편집기와 미리보기
  │   ├─ IndexedDB·로컬 파일 저장
  │   ├─ 설정과 기능 표시
  │   └─ 각 하위 모듈의 전역 연결
  ├─ js/command/at-command-menu.js
  │   ├─ 앱 기능 검색
  │   ├─ Sites 등록 사이트 검색
  │   └─ 양식 검색·실행
  ├─ AI_App + sidebarAI
  ├─ ShareSites
  ├─ js/GenSlide + js/Html2pptx
  └─ js/webDAV/storage
```

## 기능별 위치

| 기능 | 주요 경로 |
|---|---|
| 메인 편집기·설정 | `index.html`, `js/app.js` |
| `@` 기능 검색 | `js/command/at-command-menu.js` |
| 사용자 정보 | `Setting/user.js` |
| 단축키 | `hotkey/hotkey.js` |
| ScholarAI·sspimgAI | `sidebarAI/`, `AI_App/ai_local/` |
| AI Chat·AI 학술검색 | `AI_App/aiChat/` |
| 일반 학술검색·참고문헌 | `js/Scholarref/` |
| Sites·Share·Google Docs | `ShareSites/` |
| 양식 | `js/templates/`, `js/app.js` |
| GenSlide·PPTX | `js/GenSlide/`, `js/Html2pptx/` |
| Mermaid | `js/mermaid/` |
| 이미지 | `imageDB/`, `js/Imagetool/`, `js/crop/` |
| 저장·WebDAV·문서 이력 | `js/webDAV/storage/` |
| 미니 미리보기 | `js/UI_PV/` |
| 매크로·TRT 규칙 | `trt/` |

## 주요 기능과 저장하는 데이터 종류

앱의 데이터는 한곳에만 저장되지 않는다. 문서와 이미지처럼 크거나 구조화된 데이터는 `IndexedDB`에, 화면 상태와 간단한 옵션은 `localStorage`에 저장한다. 사용자가 직접 내보낸 파일은 PC 파일 시스템에 저장되며, GitHub·Google Docs·WebDAV 같은 외부 서비스 데이터는 사용자가 해당 기능을 실행할 때 전송된다.

### 기능별 데이터 정리

| 주요 기능 | 저장하는 데이터 | 기본 저장 위치 | 관련 코드 |
|---|---|---|---|
| 문서 편집·inDB 저장 | 문서 ID, 제목, Markdown 본문, 소속 폴더, 수정 시각 | `MarkdownProDB` → `documents` | `js/app.js` |
| 문서 폴더 | 폴더 ID, 폴더 이름 | `MarkdownProDB` → `folders` | `js/app.js` |
| 자동 저장 | 현재 제목, 편집 중인 본문, 저장 시각 | `localStorage`의 `mdpro_v7`; 일부 이전 자동 저장 데이터는 `MarkdownProDB` → `autosave` | `js/webDAV/storage/autosave.js`, `js/app.js` |
| 열린 탭 복원 | 탭 ID, 제목, 본문, 파일 경로·종류, GitHub 경로·브랜치·SHA, 활성 탭 | `localStorage`의 `mdpro_tabs_v1` | `js/webDAV/storage/persistence.js` |
| 내부 이미지 | 이미지 ID, `Blob`, 파일명, MIME 형식, 생성 시각 | `MarkdownProDB` → `images` | `imageDB/imageDB.js`, `imageDB/image_insert.js` |
| 참고문헌 | 참고문헌 ID, 제목, 저자·연도·URL 등 검색 또는 입력한 서지 정보 | `MarkdownProDB` → `scholar_refs` | `js/Scholarref/scholarref.js` |
| 앱·AI 설정 | AI 기능 표시 여부, 공급자와 모델, GitHub 연결값, Sites 목록, 양식 목록, 사용자 정보 등 | `MarkdownProDB` → `ai_settings`; 실패 시 `localStorage` 폴백 | `js/app.js` |
| 사용자 정보 | 이름, 학번, 전공, 연락처, 이메일, 항목명 접두어 사용 여부 | `ai_settings.userInfo` | `Setting/user.js` |
| Google 캘린더 | 캘린더 버튼 사용 여부만 저장 | `ai_settings.googleCalendarEnabled`, `localStorage`의 `md_viewer_google_calendar_enabled` | `js/app.js` |
| Sites | 기본 사이트 목록과 사용자가 추가·수정한 사이트 이름·URL | `ai_settings.sitesList` | `ShareSites/sitesshow/sitesshow.js` |
| 양식 | 기본 양식은 소스에 포함, 사용자 양식은 이름·설명·본문 등을 저장 | 기본값: `js/templates/templates.js`; 사용자 값: `ai_settings.templateCustomList` | `js/templates/`, `js/app.js` |
| Share | 공유 대상 표시 여부, 네이버 블로그 ID 등 공유 설정 | `ai_settings` | `ShareSites/Share/share.js` |
| Google Docs | 기능 사용 여부, 툴바 표시 여부, 연결·내보내기 설정 | `ai_settings` | `ShareSites/googleDocs.js` |
| GitHub | 사용 여부, 토큰, 저장소, 브랜치, 기본 Push 경로와 문서별 GitHub 메타데이터 | `ai_settings`, 문서·탭 레코드 | `js/GithubData/`, `js/app.js` |
| AI 연결 | Gemini API 키, LM Studio 주소·키·모델, ScholarAI 공급자·모델 | `ai_settings`, `localStorage` | `AI_App/ai_local/`, `js/app.js` |
| AI Chat | 대화 ID·제목, 사용자/AI 메시지, 생성·수정 시각, 공급자와 응답 설정 | `md_viewer_ai_chat` → `conversations` | `AI_App/aiChat/ai-chat.js` |
| AI Chat 화면 상태 | 기능 사용 여부, 공급자, 모델, 응답 방식, 창 배치·크기, 현재 대화 ID | `localStorage` | `AI_App/aiChat/ai-chat.js` |
| imgBB 이미지 업로드 | API 키와 키 검증 상태 | `ai_settings`, `localStorage` | `js/app.js`, `imageDB/` |
| 로컬 폴더 열기 | 폴더 이름, 파일 수, 동기화 시각, 상대 경로, 파일명·확장자·본문·수정 시각 | `mdpro-fm-v3` → `meta`, `files` | `js/webDAV/storage/fm.js` |
| inDB 파일 저장소 | 가상 파일 경로와 파일 본문, 저장소 메타데이터 | `mdpro-indb-v1` → `meta`, `files` | `js/webDAV/storage/indb.js` |
| 문서 히스토리 | 저장 시각, 메모, 열린 탭, 본문, 파일·GitHub 정보, Undo 상태, 폴더 백업 | `mdpro_history_v1` → `state` | `js/webDAV/storage/history-save.js` |
| NAS·WebDAV | 서버 주소, 사용자 이름, 비밀번호, 잠긴 폴더 목록 | `localStorage`; Web Crypto 사용 가능 시 연결 정보 AES-GCM 암호화 | `js/webDAV/storage/nas-webdav.js` |
| 테마·화면 설정 | 다크/라이트 테마, 편집기 색, 미니 미리보기, 사이드바·설정 접힘 상태, 편집기 위치 | `localStorage` | `js/app.js`, `js/UI_PV/` |
| 단축키·편집 옵션 | Enter 처리, 선택 영역 감싸기, 보기 모드 편집 사용 여부 등 | `localStorage`와 일부 `ai_settings` | `hotkey/`, `js/app.js` |
| 현재 PC 날짜·시간 | 앱이 실행되는 PC의 `Date` 값을 삽입할 때 사용하며, 캘린더 일정 자체는 저장하지 않음 | 실행 시 메모리; 형식 옵션을 제공하는 경우 설정 저장소 사용 | `js/app.js`, 설정 UI |
| GenSlide·PPTX | 슬라이드 편집 상태와 내보내기 대상 HTML/PPTX/이미지 | 편집 중 메모리, 사용자가 내보낸 PC 파일 | `js/GenSlide/`, `js/Html2pptx/` |
| Mermaid | Mermaid 원문, 렌더링 결과와 내보낸 HTML·이미지 | 편집 중 메모리, 현재 문서 또는 사용자가 내보낸 PC 파일 | `js/mermaid/` |

### IndexedDB 구성

브라우저 개발자 도구의 **Application → IndexedDB**에서 다음 저장소를 확인할 수 있다.

```text
MarkdownProDB (version 4)
├── documents       # 앱 안에 저장한 Markdown 문서
├── folders         # 문서 분류 폴더
├── autosave        # 이전 방식의 자동 저장·복구 데이터
├── ai_settings     # 앱 기능, 연결, 사용자 설정
├── images          # internal:// 주소로 참조하는 이미지 Blob
└── scholar_refs    # 참고문헌 데이터

mdpro-fm-v3
├── meta            # 열었던 로컬 폴더의 메타데이터
└── files           # 로컬 폴더 파일의 앱 내부 캐시

mdpro-indb-v1
├── meta            # inDB 파일 저장소 메타데이터
└── files           # 가상 경로별 파일 데이터

mdpro_history_v1
└── state           # 날짜별 문서·탭·Undo 스냅샷

md_viewer_ai_chat
└── conversations   # AI Chat 대화 기록
```

`internal://이미지ID` 형식은 실제 인터넷 주소가 아니다. Markdown 본문은 이 주소만 가지고 있고, 앱이 미리보기를 만들 때 `MarkdownProDB/images`에서 해당 이미지 Blob을 찾아 임시 URL로 변환한다. 따라서 문서 본문만 복사하면 내부 이미지가 다른 PC에서 보이지 않을 수 있다.

### 저장 위치별 역할

#### 1. IndexedDB

- 문서, 폴더, 이미지, 참고문헌, AI 대화처럼 구조가 있거나 용량이 큰 데이터를 저장한다.
- 앱의 **inDB** 기능은 브라우저 또는 데스크톱 앱 프로필 안의 IndexedDB를 사용한다.
- 브라우저 데이터 삭제, 앱 프로필 초기화, 저장소 손상 시 함께 사라질 수 있다.

#### 2. localStorage

- 테마, 패널 표시 상태, 최근 탭, 자동 저장 본문, 단축키 관련 옵션처럼 작은 값을 저장한다.
- Gemini·imgBB 키와 WebDAV 연결 정보 등 민감할 수 있는 값도 포함될 수 있다.
- WebDAV 자격 증명은 Web Crypto를 사용할 수 있을 때 AES-GCM으로 암호화하지만, 암호화 키도 같은 기기에 있으므로 기기 자체가 노출된 경우까지 완전히 보호하지는 못한다.

#### 3. PC 파일

- `.md`: 일반 Markdown 문서
- `.mdp`: 탭 또는 폴더 구조와 문서를 묶은 앱 백업
- `.mdd`: 문서와 관련 리소스를 묶는 압축 문서 형식
- `.mset`: 앱·AI 설정과 선택된 `localStorage` 값을 담는 설정 백업
- `.html`, `.pptx`, 이미지: 미리보기·GenSlide·Mermaid 등에서 내보낸 결과

PC 파일은 앱 내부 저장소와 별개이므로, 내보낸 뒤 사용자가 정한 폴더에서 직접 관리한다.

#### 4. 외부 서비스

| 서비스 | 앱에서 전달하거나 읽는 데이터 |
|---|---|
| GitHub | 저장소·브랜치의 문서, 경로, 커밋에 필요한 인증 토큰 |
| Google Docs | 사용자가 내보내거나 동기화하도록 선택한 현재 문서 |
| Google Calendar | `https://calendar.google.com/calendar/u/0/r`을 새 창으로 열며, 앱은 일정 데이터를 저장하지 않음 |
| WebDAV/NAS | 서버의 문서와 폴더 목록, 업로드·다운로드하는 파일 |
| Gemini·LM Studio | 사용자가 실행한 프롬프트, 선택 문서 또는 대화 문맥 |
| imgBB | 사용자가 업로드하도록 선택한 이미지 |
| Sites·Share | 등록 URL 열기 또는 사용자가 선택한 공유 대상에 전달하는 문서 |

### 데이터 흐름

```text
편집기 입력
  ├─ localStorage 자동 저장 ────────────────┐
  ├─ 열린 탭 상태 저장 ────────────────────┤ 앱 재실행 시 복원
  ├─ inDB 저장 → MarkdownProDB/documents ──┘
  ├─ 내부 이미지 → MarkdownProDB/images
  ├─ 히스토리 저장 → mdpro_history_v1/state
  ├─ 파일 내보내기 → PC의 .md/.mdp/.mdd
  └─ 사용자가 연결 기능 실행
      ├─ GitHub
      ├─ Google Docs
      ├─ WebDAV/NAS
      └─ AI·이미지 서비스
```

### 백업과 보안 주의사항

1. 중요한 문서는 inDB에만 두지 말고 정기적으로 `.md`, `.mdp` 또는 `.mdd` 파일로 내보낸다.
2. 앱 설정을 옮길 때는 `.mset`을 사용한다. 이 파일에는 AI·GitHub·이미지 업로드 연결값 등 민감한 설정이 들어갈 수 있으므로 공개 저장소에 커밋하거나 다른 사람에게 전달하지 않는다.
3. 내부 이미지를 사용한 문서는 이미지까지 포함하는 백업 형식을 선택하거나, 이미지를 외부 파일·URL로 별도 보관한다.
4. 브라우저의 사이트 데이터나 데스크톱 앱 프로필을 지우기 전에 문서와 설정을 먼저 내보낸다.
5. GitHub 토큰, Gemini·imgBB API 키, WebDAV 비밀번호는 화면 공유·로그·백업 파일을 통해 노출되지 않도록 관리한다.

### 기능 수정 시 함께 확인할 데이터

| 수정 대상 | 함께 확인할 항목 |
|---|---|
| 문서 저장 방식 | `documents`, 자동 저장, 탭 복원, 히스토리, 내보내기 형식 |
| 이미지 삽입 방식 | `images` 저장소, `internal://` 치환, MDD/MDP 포함 여부 |
| 설정 항목 추가 | 설정 모달, `getAiSettings()`·`setAiSettings()`, 폴백, `.mset` 내보내기·가져오기 |
| 날짜·캘린더 기능 | PC 시간대, 날짜 형식 설정, 단축키 충돌, 캘린더 사용 여부와 버튼 표시 |
| 외부 연결 추가 | 연결값 저장 위치, 비밀정보 노출 방지, 실패·로그아웃·초기화 처리 |
| `@` 명령 추가 | 명령 검색어·설명, 실행 함수, 설정에 따른 표시 여부 |
| 새 IndexedDB 저장소 추가 | DB 버전 증가, `onupgradeneeded`, 기존 사용자 마이그레이션, 상태 화면·삭제 기능 |



----

# 참고용 자료 

아래는 **처음부터 로컬 SQLite로 개발 → 나중에 Cloudflare D1/KV로 전환**하는 것을 전제로 한 **정밀한 프로젝트 구조, 코드, 마이그레이션 절차, D1 최적화된 스키마**와 **완전 통합 템플릿**이다.  
모든 코드는 Next.js(앱 라우트) 기준이며, 로컬 개발과 Cloudflare 배포 시 **DB 추상화 계층**만 바꿔도 동작하도록 설계했다.

---

### 개요
- **목표**: mdproviewer를 로컬 SQLite로 빠르게 개발하고, 배포 시 Cloudflare D1(관계형 메타데이터) + Cloudflare KV 또는 R2(원문/첨부)로 전환.
- **원칙**: DB 접근은 추상화하여 `useLocalSQLite` ↔ `useD1` 전환만으로 마이그레이션 가능하게 설계.
- **권장 아키텍처**:  
  - **D1**: 문서 메타데이터, 목록, 태그, 검색 인덱스(간단)  
  - **KV**: 원문 Markdown 저장(빠른 읽기/쓰기), 버전 관리, 캐시  
  - **R2**: 이미지/첨부 파일 저장(선택)

---

## 프로젝트 구조 제안
```
mdproviewer/
├─ app/
│  ├─ api/
│  │  └─ docs/
│  │     └─ [id]/route.ts
│  ├─ editor/page.tsx
│  └─ viewer/page.tsx
├─ lib/
│  ├─ db/
│  │  ├─ index.ts         ← DB 추상화 레이어
│  │  ├─ sqlite.ts        ← 로컬 SQLite 구현
│  │  └─ d1.ts            ← Cloudflare D1 구현
│  └─ storage/
│     ├─ kv.ts            ← Cloudflare KV wrapper
│     └─ r2.ts            ← R2 wrapper (선택)
├─ migrations/
│  ├─ schema.sql
│  └─ seed.sql
├─ scripts/
│  ├─ migrate-to-d1.sh
│  └─ dump-sqlite.sh
├─ wrangler.toml
├─ package.json
└─ next.config.js
```

---

## 1. SQLite 개발용 코드 (로컬 개발 환경)
### package.json (핵심 의존)
```json
{
  "name": "mdproviewer",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "migrate:local": "node scripts/dump-sqlite.js"
  },
  "dependencies": {
    "next": "14.x",
    "react": "18.x",
    "sqlite3": "^5.1.6",
    "better-sqlite3": "^8.4.0"
  }
}
```

### lib/db/sqlite.ts
```ts
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), "data.sqlite");
const db = new Database(DB_PATH);

export async function getDocById(id: string) {
  const row = db.prepare("SELECT id, title, created_at, updated_at FROM docs WHERE id = ?").get(id);
  return row;
}

export async function upsertDocMeta(id: string, title: string) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO docs (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
  `).run(id, title, now, now);
}

export async function listDocs(limit = 50, offset = 0) {
  return db.prepare("SELECT id, title, updated_at FROM docs ORDER BY updated_at DESC LIMIT ? OFFSET ?").all(limit, offset);
}
```

### migrations/schema.sql (SQLite 스키마 예시)
```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS doc_tags (
  doc_id TEXT,
  tag_id INTEGER,
  PRIMARY KEY (doc_id, tag_id),
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_docs_updated_at ON docs(updated_at);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
```

### API Route 예시 (로컬 개발)
`/app/api/docs/[id]/route.ts`
```ts
import { NextResponse } from "next/server";
import * as sqlite from "@/lib/db/sqlite";

export async function GET(request: Request, { params }) {
  const id = params.id;
  const meta = await sqlite.getDocById(id);
  // 원문은 파일 또는 KV에서 읽음. 로컬 개발에서는 파일 시스템에서 읽을 수 있음.
  const content = await Deno.readTextFile(`./data/docs/${id}.md`).catch(()=>null);
  return NextResponse.json({ meta, content });
}

export async function POST(request: Request) {
  const { id, title, content } = await request.json();
  await sqlite.upsertDocMeta(id, title);
  await Deno.writeTextFile(`./data/docs/${id}.md`, content);
  return NextResponse.json({ ok: true });
}
```
> **주의**: Next.js 환경에서 `Deno` 대신 Node 파일 API(`fs/promises`) 사용. 위는 개념 예시.

---

## 2. DB 추상화 레이어 설계
`lib/db/index.ts` — 로컬과 D1 구현을 런타임에서 선택
```ts
import * as sqlite from "./sqlite";
import * as d1 from "./d1";

const USE_D1 = process.env.USE_D1 === "true";

export const db = USE_D1 ? d1 : sqlite;

export type DB = typeof db;
```
이제 앱은 `import { db } from "@/lib/db";`로 호출만 하면 됨.

---

## 3. Cloudflare D1 구현 코드
`lib/db/d1.ts` (Cloudflare Worker 환경에서 `env.DB` 사용)
```ts
// This file runs in Cloudflare Worker environment
export async function getDocById(id: string, env: any) {
  const row = await env.DB.prepare("SELECT id, title, created_at, updated_at FROM docs WHERE id = ?")
    .bind(id)
    .first();
  return row;
}

export async function upsertDocMeta(id: string, title: string, env: any) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO docs (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
  `).bind(id, title, now, now).run();
}

export async function listDocs(limit = 50, offset = 0, env: any) {
  const rows = await env.DB.prepare("SELECT id, title, updated_at FROM docs ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all();
  return rows;
}
```
**사용법**: Next.js API Route에서 `db` 대신 `d1`을 호출하고 `env`를 전달.

---

## 4. D1 마이그레이션 절차 및 스크립트
### 1) 로컬에서 스키마 덤프
`scripts/dump-sqlite.sh`
```bash
#!/bin/bash
sqlite3 data.sqlite .schema > migrations/schema.sql
```

### 2) Cloudflare에 마이그레이션 적용
- **권장**: `wrangler d1 migrations` 사용
- 예시:
```bash
# wrangler.toml에 d1 binding 설정 필요
wrangler d1 migrations apply mdproviewer-db --file=migrations/schema.sql
```
- 또는 `wrangler d1 execute`로 SQL 실행:
```bash
wrangler d1 execute mdproviewer-db --file=migrations/schema.sql
```

### 3) 데이터 이전(선택)
- 소규모 데이터: `sqlite3`로 CSV 추출 후 D1에 INSERT 스크립트 실행
- 예시 CSV 추출:
```bash
sqlite3 -header -csv data.sqlite "SELECT id,title,created_at,updated_at FROM docs;" > docs.csv
```
- D1에 삽입 스크립트 생성 후 `wrangler d1 execute`로 실행.

---

## 5. D1 최적화된 스키마 권장사항
- **단순 타입 사용**: TEXT, INTEGER, REAL 사용. D1은 SQLite 기반이므로 복잡한 PRAGMA나 확장 기능은 피함.
- **인덱스 명시**: 자주 조회하는 컬럼에 인덱스 추가 (`updated_at`, `title`).
- **FTS(Full Text Search)**: D1에서 FTS 가용성은 제한적일 수 있으므로, 대규모 텍스트 검색은 **외부 검색 서비스(Algolia, Meilisearch)** 또는 **KV에 원문 저장 + 간단 토큰 인덱스 테이블** 방식 권장.
- **원문 저장 전략**: 원문(Markdown)은 **KV**에 저장하고, D1에는 `id, title, excerpt, updated_at` 등 메타만 저장하면 읽기 성능과 비용 효율이 좋음.

### 권장 스키마 (D1 최적화)
```sql
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT,
  excerpt TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS doc_tags (
  doc_id TEXT,
  tag_id INTEGER,
  PRIMARY KEY (doc_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_docs_updated_at ON docs(updated_at);
CREATE INDEX IF NOT EXISTS idx_docs_title ON docs(title);
```

---

## 6. Cloudflare KV 사용 패턴 (원문 저장)
`lib/storage/kv.ts`
```ts
export async function getDocContent(id: string, env: any) {
  return await env.DOCS.get(id);
}

export async function putDocContent(id: string, content: string, env: any) {
  await env.DOCS.put(id, content);
}
```
- **장점**: 읽기 빠름, 전 세계 엣지 캐시, 버전 관리(키에 타임스탬프 추가) 가능.
- **권장 키 네이밍**: `doc:{id}:v1` 또는 `doc:{id}:latest`

---

## 7. Next.js API Route 통합 예시 (D1 + KV 지원)
`/app/api/docs/[id]/route.ts`
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as kv from "@/lib/storage/kv";

export async function GET(request: Request, { params, env }) {
  const id = params.id;
  // D1에서 메타 조회
  const meta = await db.getDocById(id, env);
  // KV에서 원문 조회
  const content = await kv.getDocContent(id, env);
  return NextResponse.json({ meta, content });
}

export async function POST(request: Request, { env }) {
  const { id, title, content } = await request.json();
  await db.upsertDocMeta(id, title, env);
  await kv.putDocContent(id, content, env);
  return NextResponse.json({ ok: true });
}
```
> **로컬 개발**: `env` 대신 로컬 sqlite 모듈과 파일 시스템을 사용하도록 `db` 구현을 분기 처리.

---

## 8. wrangler.toml 예시
```toml
name = "mdproviewer"
compatibility_date = "2026-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mdproviewer-db"
database_id = "YOUR_D1_DATABASE_ID"

[[kv_namespaces]]
binding = "DOCS"
id = "YOUR_KV_NAMESPACE_ID"
```

---

## 9. 배포 파이프라인 요약
1. **로컬 개발**: `USE_D1=false` 환경에서 SQLite로 개발, `migrations/schema.sql` 유지.
2. **스키마 준비**: `scripts/dump-sqlite.sh`로 스키마 업데이트.
3. **Cloudflare 설정**: wrangler.toml에 D1/KV 바인딩 추가.
4. **마이그레이션 적용**: `wrangler d1 migrations apply` 또는 `wrangler d1 execute`.
5. **환경 변수**: Cloudflare Pages에서 `USE_D1=true` 설정, Next.js 빌드 시 D1 모드로 동작.
6. **배포**: GitHub → Cloudflare Pages 자동 배포.

---

## 10. 테스트 및 검증 체크리스트
- [ ] 로컬에서 CRUD 동작 확인 (SQLite + 파일 원문)
- [ ] 스키마 덤프 후 D1에 적용 성공 확인
- [ ] D1에서 메타 조회, KV에서 원문 조회 통합 테스트
- [ ] 동시 쓰기 시 충돌 시나리오 테스트 (KV 충돌 정책 확인)
- [ ] 백업 전략: D1 스키마 덤프 + KV 백업(주기적 스냅샷)
- [ ] 모니터링: Cloudflare Logs / Pages 배포 로그 확인

---

## 11. 추가 권장 사항
- **충돌 방지**: 여러 기기에서 동시 편집 가능성을 줄이려면 간단한 **낙관적 잠금(optimistic lock)** 구현 권장 (`updated_at` 비교 후 덮어쓰기).
- **버전 관리**: KV에 `doc:{id}:v{n}` 형태로 버전 저장하면 롤백 쉬움.
- **검색**: 단순 검색은 D1 `LIKE`로 가능하지만 성능 한계. 고급 검색은 Meilisearch/Algolia 연동 권장.
- **보안**: API는 인증 필요. Cloudflare Access 또는 JWT 기반 인증 적용.

---
