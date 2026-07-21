# ScholarAI LM Studio 연동 개발 방향

## 1. 목표

현재 ScholarAI의 텍스트 생성은 `js/app.js`의 `SidebarAIConfig.callbacks.callGemini()`를 통해 Google AI Studio(Gemini) API만 호출한다. 이를 다음 구조로 확장한다.

- 사용자가 ScholarAI에서 `자동: LM Studio → AI Studio`, `LM Studio`, `AI Studio`를 선택할 수 있다.
- AI Studio의 기존 동작과 저장값은 그대로 유지한다.
- LM Studio는 `ai_local/local-ai.js`의 OpenAI 호환 클라이언트를 재사용한다.
- ScholarAI의 선택 문장, 사전 프롬프트, 문체, 결과 탭, 히스토리, 문서 삽입, 중지 기능은 공급자와 무관하게 동일하게 동작한다.
- LM Studio가 꺼져 있거나 설정이 잘못된 경우 원인을 구분해 안내하고, AI Studio 설정에는 영향을 주지 않는다.

이번 작업은 **ScholarAI 텍스트 생성**을 우선 대상으로 한다. `sspimgAI` 이미지 생성은 Gemini 이미지 API에 종속되어 있으므로 LM Studio 전환 대상에 포함하지 않는다.

범위 확정: 기존 AI 기능의 검증, 표시, 이미지 생성 및 저장 규칙은 변경하지 않는다. ScholarAI에 공급자/모델 선택만 추가하며, `sspimgAI`는 기존 AI Studio 이미지 생성 경로로 계속 동작한다.

UI 위치 변경: 연결 주소, API Key, 생성 옵션, 모델 조회 및 연결 테스트는 앱의 `설정 → AI 연동 설정`에서 관리한다. ScholarAI 패널에는 AI Studio/LM Studio 공급자 선택과 공급자별 모델 선택만 표시한다.

## 2. 현재 구조와 확인된 연결 지점

### 현재 ScholarAI 호출 흐름

```text
index.html의 ScholarAI 패널
  -> sidebarAI/sidebar-ai.js의 scholarAIRun()
  -> SidebarAIConfig.callbacks.callGemini()
  -> js/app.js의 Gemini generateContent 요청
```

현재 결합 지점은 다음과 같다.

- `sidebarAI/sidebar-ai.js`
  - `scholarAIRun()`이 이름부터 Gemini 전용인 `callGemini` 콜백을 직접 얻는다.
  - 모델 선택 목록이 Gemini 모델로 고정되어 있다.
  - 중지 버튼은 `abortCurrentTask` 콜백을 사용하므로 공급자 공통 취소로 확장할 수 있다.
- `js/app.js`
  - `callGemini()` 안에 URL, 요청 본문, 응답 파싱이 직접 구현되어 있다.
  - `getScholarAIModelId()`와 `setScholarAIModelId()`는 단일 Gemini 모델 값만 저장한다.
  - 공용 `window._abortController`를 사용한다.
- `index.html`
  - 실제 ScholarAI 패널의 모델 목록이 Gemini 값으로 고정되어 있다.
  - `ai_local/local-ai.js`는 아직 로드하지 않는다.
- `sidebarAI/sidebar-ai.js` 내부 HTML 템플릿
  - 독립/팝업 사용을 위한 ScholarAI 마크업에도 같은 Gemini 모델 목록이 중복되어 있다.

### 재사용할 `ai_local` 기능

`ai_local/local-ai.js`는 이미 다음 기능을 제공한다.

- `LocalAI.createClient(config)`
- `client.listModels()` / `client.testConnection()`
- `client.complete()` / `client.stream()`
- OpenAI 호환 `/v1/models`, `/v1/chat/completions` 호출
- `systemInstruction`, 모델 오버라이드, 생성 옵션 전달
- 외부 `AbortSignal`과 요청 시간 제한
- `LocalAI.loadConfig()` / `saveConfig()` 및 MDLive 설정 호환 함수

따라서 LM Studio 요청 코드를 ScholarAI에 다시 작성하지 않고 이 객체를 공급자 계층에서 사용한다.

## 3. 권장 설계

### 3.1 공급자 공통 인터페이스

기존 `callGemini`를 ScholarAI가 직접 호출하지 않도록 아래 의미의 공통 콜백을 추가한다.

```js
callScholarAI({
  provider,          // "aistudio" | "lmstudio"
  prompt,
  systemInstruction,
  model,
  useSearch,
  signal
}) -> Promise<{ provider, model, text }>
```

호환성을 위해 전환 기간에는 `callScholarAI`가 없을 때 기존 `callGemini`로 폴백할 수 있다. 최종적으로 ScholarAI 코어는 특정 API의 요청 형식을 알지 않으며 공통 결과의 `text`만 처리한다.

공급자 어댑터는 `ai_local/scholar-ai-provider.js`로 분리한다.

- `aistudio` 어댑터: 현재 `js/app.js`의 Gemini 텍스트 호출 로직을 보존한다.
- `lmstudio` 어댑터: `LocalAI.createClient()`와 `client.complete()`를 사용한다.
- 공통 책임: 공급자 선택, 설정 검증, AbortController 관리, 오류 메시지 정규화, `{ provider, model, text }` 반환.

### 3.2 설정 모델

공급자별 설정과 모델 선택을 분리해 저장한다.

```js
{
  provider: "aistudio",
  aistudio: {
    model: "gemini-2.5-pro"
  },
  lmstudio: {
    baseUrl: "http://127.0.0.1:5678/v1",
    model: "",
    apiKey: "",
    timeoutMs: 90000
  }
}
```

권장 저장 키:

- 공급자: `ss_scholar_ai_provider`
- AI Studio 모델: 기존 `ss_scholar_ai_model` 유지
- LM Studio 설정: `LocalAI.storageKey` 사용
- 기존 MDLive 설정 `mdpro_ai_provider_settings_v1`이 있으면 최초 기본값으로 읽을 수 있으나, 어느 저장소를 최종 원본으로 삼을지는 구현 시 하나로 통일한다.

마이그레이션 원칙:

- 저장된 공급자가 없으면 두 설정을 확인해 LM Studio를 먼저 시도하고 AI Studio로 폴백한다.
- 기존 `ss_scholar_ai_model`은 변경하거나 삭제하지 않는다.
- AI Studio의 마지막 선택 모델은 기억하고, LM Studio 모델은 매번 실제 `loaded_instances`와 동기화한다.
- API 키는 화면 표시나 로그에 노출하지 않는다.

### 3.3 ScholarAI UI

앱의 `설정 → AI 연동 설정`에 다음 항목을 둔다.

1. LM Studio 설정
   - Base URL
   - 현재 로드 모델(읽기 전용)
   - API Key(선택)
   - Temperature / Max tokens / Timeout / Top P
   - `현재 로드 모델 확인`
   - `연결 테스트`
   - 연결 상태/오류 표시
2. Gemini 모델 목록 불러오기와 LM Studio 현재 로드 모델 확인

ScholarAI의 `모델선택` 패널에는 다음 항목만 표시한다.

1. 공급자 선택: `LM Studio` / `AI Studio`
2. AI Studio 선택 시 Gemini 모델 선택
3. LM Studio 선택 시 현재 로드 모델 읽기 전용 표시

UI 동작 기준:

- AI Studio 선택 시 기존 Gemini 모델 목록을 표시한다.
- LM Studio 모델 목록은 앱 설정에서 `GET /v1/models`로 불러와 ScholarAI에서 선택한다.
- 서버가 꺼져 있어도 앱 설정에서 이전에 저장한 모델명을 직접 입력하거나 확인할 수 있게 한다.
- 모델 조회 중, 성공, 빈 목록, 연결 거부, CORS, 시간 초과를 서로 구분해 표시한다.
- `useSearch`는 AI Studio에서만 활성화한다. LM Studio에서는 웹 검색을 수행한 것처럼 처리하지 않는다.
- `sspimgAI`의 모델 및 이미지 API UI에는 영향을 주지 않는다.

상세 설정은 `index.html`의 앱 설정 모달에 두고, `sidebarAI/sidebar-ai.js`는 공급자/모델 선택 UI만 동적으로 생성한다.

### 3.4 요청과 중지 처리

- 실행 시 선택된 공급자 설정을 스냅샷으로 읽는다.
- 요청마다 새 `AbortController`를 만든다.
- ScholarAI의 `중지` 버튼이 현재 텍스트 요청만 취소하도록 전용 컨트롤러를 관리한다.
- LM Studio 요청에는 컨트롤러의 `signal`을 `client.complete()`에 전달한다.
- 사용자 취소는 일반 실패와 구분하여 `중지됨`으로 표시하고 히스토리에 실패 결과를 저장하지 않는다.
- 요청 완료 또는 실패 후 컨트롤러 참조와 실행 상태를 반드시 정리한다.
- 1차 구현은 기존 동작과 같은 비스트리밍 `complete()`를 사용한다. 안정화 후 `client.stream()`으로 결과를 점진 표시하는 기능을 별도 단계로 추가한다.

### 3.5 오류 처리

사용자 메시지는 최소한 다음 상황을 구분한다.

- LM Studio 서버 미실행 또는 주소/포트 오류
- 브라우저 CORS 차단
- 모델 미선택 또는 모델이 서버에 로드되지 않음
- 인증 실패
- 요청 시간 초과
- 사용자가 중지함
- 빈 응답 또는 OpenAI 호환 형식이 아닌 응답

상세 오류 객체나 API 키를 결과창에 그대로 출력하지 않는다. 개발 로그가 필요하면 비밀값을 제거한 공급자, URL, 상태 코드 정도만 기록한다.

## 4. 예상 변경 파일

### `ai_local`에서 개발할 파일

- `ai_local/local-ai.js`
  - 기본적으로 기존 공개 API를 재사용한다.
  - ScholarAI 연동 중 실제 호환성 문제가 확인될 때만 최소 수정한다.
- `ai_local/scholar-ai-provider.js` (신규)
  - 공급자 공통 인터페이스와 AI Studio/LM Studio 어댑터
  - 설정 읽기/저장, 모델 조회, 연결 확인, 요청, 취소, 오류 정규화
- `ai_local/README.md`
  - ScholarAI 연결 방법과 설정 예시 추가
- `ai_local/ailocal_dev.md`
  - 본 개발 방향 및 진행 체크 문서

### 호스트 앱의 최소 연결 변경

- `index.html`
  - `local-ai.js`, `scholar-ai-provider.js`를 `app.js`보다 먼저 로드
  - ScholarAI 공급자/LM Studio 설정 UI 추가
- `js/app.js`
  - `SidebarAIConfig.callbacks.callScholarAI`와 공급자 설정 콜백 연결
  - 기존 Gemini 텍스트 호출을 어댑터로 이동하거나 래핑
  - 이미지 생성용 `generateImage`는 기존 Gemini 경로 유지
- `sidebarAI/sidebar-ai.js`
  - `scholarAIRun()`을 공급자 공통 콜백으로 변경
  - 공급자별 모델 UI 초기화와 저장 처리
  - 중지 및 공급자별 오류 표시 보완
  - 내부 휴대용 HTML 템플릿 동기화

핵심 구현은 `ai_local`에 두되, ScholarAI가 이를 로드하고 호출하기 위한 호스트 파일 변경은 불가피하다.

## 5. 단계별 개발 순서

### 1단계: 공급자 어댑터 작성 — 완료

- [x] `ai_local/scholar-ai-provider.js` 공개 API 정의
- [x] 현재 Gemini 텍스트 요청을 AI Studio 어댑터로 이동/래핑
- [x] `LocalAI.createClient()` 기반 LM Studio 어댑터 구현
- [x] 설정 검증과 오류 메시지 정규화
- [x] 공급자 공통 취소 처리

완료 기준: UI 없이 개발자 콘솔 수준에서 동일한 프롬프트가 두 공급자 중 선택한 곳으로 전송되고 공통 결과 형식으로 반환된다.

### 2단계: ScholarAI 연결 — 완료

- [x] `local-ai.js`와 공급자 어댑터 로드 순서 설정
- [x] `callScholarAI` 콜백을 `SidebarAIConfig`에 연결
- [x] `scholarAIRun()`의 Gemini 직접 의존 제거
- [x] 기존 `callGemini` 폴백으로 호환성 유지
- [x] 중지/오류/히스토리 코드 경로 유지

완료 기준: 기존 AI Studio 동작에 회귀 없이 LM Studio로 텍스트 결과를 받을 수 있다.

### 3단계: 설정 및 모델 UI — 완료

- [x] 공급자 선택 UI 추가
- [x] LM Studio Base URL/API Key 입력 및 저장
- [x] LM Studio `loaded_instances` 기반 현재 로드 모델 조회 및 읽기 전용 표시
- [x] ScholarAI 실행 직전 현재 로드 모델 자동 동기화(앱의 LM 모델 선택 제거)
- [x] 연결 테스트와 상태 표시
- [x] 실제 패널과 휴대용 템플릿에 공통으로 적용되는 동적 UI 사용

완료 기준: AI Studio는 Gemini 모델을 선택할 수 있고, LM Studio는 앱에서 모델을 지정하지 않은 채 LM Studio에 현재 로드된 모델을 표시하고 자동 사용한다.

### 4단계: 안정화 및 선택 기능 — 일부 완료

- [ ] LM Studio 스트리밍 출력 검토 및 적용
- [x] 연속 실행과 중지 후 재실행이 가능하도록 요청별 컨트롤러 적용
- [x] CORS/서버 종료/모델/인증/시간 초과 오류 메시지 정규화
- [x] README 사용법 및 문제 해결 항목 보완

구현일: 2026-07-21. 정적 구문 검사, 모의 OpenAI 호환 API 테스트, 요청 취소 테스트를 통과했다. 로컬 LM Studio의 `/v1/models`에는 설치 모델 12개가 반환되지만 `/api/v1/models`의 `loaded_instances`에는 실제 로드된 `google/gemma-4-e4b`만 존재함을 확인했다. ScholarAI는 후자를 요청 직전에 조회해 `/v1/chat/completions`에 전달한다. 실제 ScholarAI 화면 조작은 호스트 앱에서 최종 확인한다.

## 6. 검증 계획

### 정적 검증

- 변경 JavaScript 파일에 `node --check` 실행
- 중복 ID 및 로드 순서 확인
- API 키가 코드, URL, 콘솔, 오류 메시지에 포함되지 않는지 확인

### 수동 기능 검증

1. 기존 설정만 있는 상태에서 기본 공급자가 AI Studio인지 확인
2. AI Studio의 기존 Gemini 모델로 ScholarAI 실행/중지/히스토리/문서 삽입 확인
3. LM Studio 서버를 켜고 현재 로드 모델 표시 및 연결 테스트
4. LM Studio에서 모델을 교체한 뒤 앱 표시와 실제 요청 모델이 자동 변경되는지 확인
5. 실행 중 중지 후 다시 실행되는지 확인
6. 서버 종료, 잘못된 포트, 잘못된 모델, CORS 차단, 시간 초과 메시지 확인
7. 공급자를 여러 번 전환해도 각 모델 선택이 유지되는지 확인
8. `sspimgAI` 이미지 생성이 계속 Gemini 경로로 동작하는지 확인

### LM Studio 테스트 조건

- 기본 URL: `http://127.0.0.1:5678/v1`
- LM Studio Local Server 실행
- OpenAI 호환 API 제공 및 사용할 모델 로드
- 브라우저 origin에 대한 CORS 허용
- 인증 사용 시에만 API Key 입력

## 7. 독립 AI Chat 확장 — 완료

- [x] `aiChat` 폴더에 ScholarAI와 분리된 LM Studio/AI Studio 멀티턴 Chat 구현
- [x] 즉시응답/추론 모드와 응답 대기 상태 표시
- [x] 이동·크기 조절 팝업, 본문을 미는 우측 Dock, 전체화면 배치 구현
- [x] IndexedDB 대화방 저장, 전체화면 왼쪽 기록 목록, 선택·삭제 구현
- [x] 기존 단일 localStorage 대화 기록의 최초 1회 IndexedDB 이전
- [x] 답변 체크리스트와 최종 답변 분리 및 개별 복사 구현
- [x] AI Chat에 Gemini 3.x 텍스트 모델과 Nano Banana 이미지 모델 선택 추가
- [x] Nano Banana 생성 이미지를 채팅/IndexedDB에 저장·표시하고 파일 저장 지원
- [x] sspimgAI의 Nano Banana Preview ID를 공식 Stable ID로 이전

AI Chat의 UI 및 대화 저장은 `aiChat/ai-chat.js`, `aiChat/ai-chat.css`에서 담당하며, 공급자 호출은 `js/app.js`의 `AIChatBridge`를 통해 기존 `ai_local` 설정을 공유한다.

## 8. 범위 밖 및 주의사항

- LM Studio 자체 설치, 모델 다운로드, 모델 로드는 앱이 자동 수행하지 않는다.
- 로컬 모델은 Google Search 도구나 실시간 학술 검색을 자동 제공하지 않는다.
- LM Studio가 OpenAI 호환 API를 제공하더라도 모델별 컨텍스트 길이와 지원 생성 옵션은 다를 수 있다.
- 이미지 생성의 LM Studio 지원과 모델 자동 다운로드는 포함하지 않는다.
- 자동 모드는 LM Studio를 먼저 사용하고 실패 시 AI Studio로 재시도한다. 따라서 자동 모드를 선택하면 로컬 요청 실패 시 같은 요청 내용이 외부 AI Studio로 전송될 수 있음을 UI와 문서에 명시한다.

## 9. 최종 완료 조건

- ScholarAI 텍스트 생성에서 AI Studio와 LM Studio를 명시적으로 선택할 수 있다.
- 기존 AI Studio 기능과 설정이 유지된다.
- LM Studio 모델 조회, 연결 확인, 실행, 중지가 동작한다.
- 공급자별 모델과 설정이 독립적으로 저장·복원된다.
- 이미지 생성은 기존 AI Studio 경로에서 회귀 없이 동작한다.
- 오류가 공급자와 원인에 맞게 표시되며 민감 정보가 노출되지 않는다.
- 변경 파일의 정적 검사와 핵심 수동 시나리오가 통과한다.
