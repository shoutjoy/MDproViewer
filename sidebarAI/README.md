# sidebarAI 모듈

ScholarAI(텍스트 AI)와 SSPAI(이미지 생성) 사이드바를 호스트 앱에 통합하기 위한 **이식 가능한 모듈**입니다.

sidebarAI 폴더가 생성되었고 .gitignore에 추가되었습니다.

생성된 sidebarAI/ 구조
파일	설명
sidebar-ai.css	ScholarAI·SSPAI 사이드바 스타일, 전체화면 오버레이
sidebar-ai.html	ScholarAI·SSPAI HTML 조각
sidebar-ai.js	ScholarAI·SSPAI 로직 (의존성 주입 방식)
config.example.js	호스트 앱 콜백 예시 (host 또는 callbacks)
README.md	한국어 통합 가이드
.gitignore 반영
# sidebarAI 모듈 (로컬/배포용 분리 시)
sidebarAI/
sidebarAI/ 폴더는 GitHub push 대상에서 제외됩니다.

다른 앱에서 사용하는 방법
폴더 복사: sidebarAI/ 전체를 새 앱 프로젝트로 복사합니다.
설정: window.SidebarAIConfig로 API 콜백을 지정합니다.
옵션 A: host: window.opener — 부모 창의 callGemini, generateImage 등 사용
옵션 B: callbacks — callGemini, generateImage, getApiKey 등 직접 구현
로드 순서: CSS → config → JS 순으로 로드합니다.
HTML 삽입: sidebar-ai.html 내용을 뷰어 레이아웃에 넣습니다.
자세한 연동 방법은 sidebarAI/README.md를 참고하면 됩니다.

## 개요

- **sidebar-ai.css**: ScholarAI·SSPAI 사이드바 스타일
- **sidebar-ai.html**: ScholarAI·SSPAI HTML 조각
- **sidebar-ai.js**: 핵심 로직 (호스트 콜백 사용)
- **config.example.js**: 호스트 앱 콜백 예시

호스트 앱은 `window.SidebarAIConfig`로 API 콜백을 제공합니다.

## 통합 방법

### 1. 파일 로드 순서

```html
<link rel="stylesheet" href="sidebarAI/sidebar-ai.css">
<!-- ... 뷰어 레이아웃 ... -->
<script src="sidebarAI/config.example.js"></script>  <!-- 또는 자체 config -->
<script src="sidebarAI/sidebar-ai.js"></script>
```

### 2. SidebarAIConfig 설정

뷰어 창/iframe에 `sidebar-ai.js`가 로드되기 **전에** `window.SidebarAIConfig`를 설정해야 합니다.

#### 옵션 A: host 사용 (팝업 창)

```javascript
window.SidebarAIConfig = {
  host: window.opener,  // 부모 창
  cropEditorBase: './'  // crop-editor.html 경로 (선택)
};
```

`host`가 있으면 `host.callGemini`, `host.generateImage` 등이 자동으로 호출됩니다.

#### 옵션 B: callbacks만 사용 (독립 실행)

```javascript
window.SidebarAIConfig = {
  host: null,
  cropEditorBase: './',
  callbacks: {
    callGemini: async (prompt, sys, useSearch, modelId) => { /* ... */ },
    generateImage: async (prompt, options) => { /* ... */ },
    getApiKey: () => 'YOUR_API_KEY',
    getScholarAISystemInstruction: () => '...',
    setScholarAISystemInstruction: (text) => { /* ... */ },
    getScholarAIModelId: () => 'gemini-2.5-pro',
    setScholarAIModelId: (id) => { /* ... */ },
    getImageModelId: () => 'gemini-3.1-flash-image-preview',
    abortCurrentTask: () => { /* ... */ },
    setViewerContent: (text, type) => { /* ... */ },
    getViewerRenderedContent: (text) => { /* ... */ }
  }
};
```

### 3. HTML 삽입

`sidebar-ai.html`의 내용을 뷰어의 `main-with-sidebar`(또는 유사한 컨테이너) 안에 넣습니다.

### 4. 툴바 버튼

```html
<button onclick="toggleScholarAI()">ScholarAI</button>
<button onclick="toggleViewerSSP()">sspAI</button>
```

### 5. 초기화

뷰어가 준비된 후:

```javascript
if (typeof window.sidebarAIInit === 'function') window.sidebarAIInit();
```

## 필수 콜백

| 콜백 | 설명 |
|------|------|
| `callGemini` | `(prompt, systemInstruction, useSearch, modelOverride) => Promise<{text}>` |
| `generateImage` | `(prompt, options) => Promise<dataURL>` — options: `seedImage`, `modelId`, `aspectRatio`, `noText` |
| `getApiKey` | `() => string` — Gemini API 키 |
| `getScholarAISystemInstruction` | `() => string` |
| `setScholarAISystemInstruction` | `(text) => void` |
| `getScholarAIModelId` | `() => string` |
| `setScholarAIModelId` | `(id) => string` |
| `getImageModelId` | `() => string` |
| `abortCurrentTask` | `() => void` |
| `setViewerContent` | `(text, type) => void` — 편집 내용 저장 |
| `getViewerRenderedContent` | `(text) => string` — 마크다운→HTML |

## 선택 콜백

- `setViewerContent`, `getViewerRenderedContent`: 문서 편집·저장 기능이 있을 때만 필요
- `cropEditorBase`: 자르기 기능 사용 시 `crop-editor.html` 경로

## ScholarSlide와의 연동

ScholarSlide의 `getTextViewerWindowHtml`에서 생성하는 뷰어 창은 기본적으로 `window.opener`를 host로 사용합니다.  
`config.example.js`를 로드하지 않고 `viewer-standalone.js`만 사용하면 기존 `window.opener` 방식으로 동작합니다.

sidebarAI 모듈을 사용하려면:

1. `getTextViewerWindowHtml`에서 `sidebar-ai.css` 링크 추가
2. `sidebar-ai.html` 조각을 뷰어 HTML에 포함
3. `config.example.js` 또는 자체 config를 `viewer-standalone.js` **앞에** 로드
4. `viewer-standalone.js` 대신 `sidebar-ai.js` 로드 (또는 둘 다 로드 시 `sidebar-ai.js`가 ScholarAI/SSPAI 함수를 덮어씀)

## 라이선스

ScholarSlide 프로젝트와 동일합니다.
