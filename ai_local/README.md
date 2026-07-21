# Local AI / LM Studio 재사용 객체

이 폴더는 MDLive의 기존 코드를 이동하거나 교체하지 않고, LM Studio 기반 기능을 다른 앱에서 재사용할 수 있도록 `LocalAI` 객체로 별도 정리한 사본입니다. 파일을 로드하는 것만으로는 네트워크 요청, DOM 변경, `localStorage` 쓰기를 하지 않습니다.

## 포함 기능

| 객체 | 원본 기능 | 원본 파일 |
|---|---|---|
| `LocalAI.createClient()` | LM Studio 모델 조회, 연결 확인, 일반/스트리밍 채팅 | `js/core/ai-provider.js` |
| `LocalAI.features.deepResearch` | 질문, 학술검색, 자료조사, 에디터 명령, 로컬 심층연구 | `js/ai/deep-research.js` |
| `LocalAI.features.translator` | 긴 문서 분할 번역 | `js/ai/translator.js` |
| `LocalAI.features.citations` | APA 7 참고문헌 제안 | `js/cite/cite-ai-search.js` |
| `LocalAI.features.scholar` | 역할별 라이브 AI/학술 편집 | `js/ui/live-ai-integration.js` |

`LocalAI.prompts`에는 Deep Research 프리셋, 검증 규칙, 종합 규칙, 문체 규칙과 Scholar 역할 프롬프트가 객체로 보관되어 있습니다. `LocalAI.registry`는 기능과 원본 파일의 대응표입니다.

## LM Studio 준비

1. LM Studio에서 사용할 모델을 내려받고 로드합니다.
2. Local Server에서 OpenAI 호환 API 서버를 시작합니다.
3. 서버 주소와 포트를 `baseUrl`에 맞춥니다. 현재 MDLive 기본값은 `http://127.0.0.1:5678/v1`입니다.
4. LM Studio에 인증을 설정한 경우에만 `apiKey`를 입력합니다.
5. 브라우저 앱을 다른 origin에서 실행한다면 LM Studio 서버의 CORS 허용 설정을 확인합니다.

`client.listModels()`/`GET /v1/models`는 설치된 모델까지 포함할 수 있습니다. 현재 LM Studio에 실제로 로드된 모델은 `client.listLoadedModels()`이 `GET /api/v1/models`의 `loaded_instances`를 기준으로 반환합니다. ScholarAI는 이 값을 요청 직전에 다시 확인해 사용하므로 앱에서 LM Studio 모델을 별도로 선택하지 않습니다. 예시 파일은 [local-ai.config.example.js](./local-ai.config.example.js)입니다.

## 브라우저에서 사용

```html
<script src="./ai_local/local-ai.js"></script>
<script>
  const client = LocalAI.createClient({
    baseUrl: 'http://127.0.0.1:5678/v1',
    model: 'google/gemma-4-e4b'
  });

  async function ask() {
    const result = await client.complete({ prompt: '로컬 AI의 장점을 세 문장으로 설명해 줘.' });
    console.log(result.text);
  }
</script>
```

스트리밍 응답은 토큰 콜백으로 받을 수 있습니다.

```js
const result = await client.stream({
  prompt: '마크다운 편집기의 설계 원칙을 설명해 줘.',
  onToken(token, accumulatedText) {
    output.textContent = accumulatedText;
  }
});
```

## 기능 객체 사용

```js
const research = await LocalAI.features.deepResearch.academicSearch(client, {
  preset: 'systematic-review',
  topic: '교사의 조직몰입과 직무요구-자원 모형',
  years: '2020-2026',
  question: '일관된 결과와 상반된 결과를 구분해 줘.',
  tone: 'academic',
  // 다른 검색 모듈에서 검증한 논문 메타데이터/초록만 전달합니다.
  evidenceText: verifiedOpenAlexResults
});

const translated = await LocalAI.features.translator.run(client, {
  text: longDocument,
  prompt: 'Translate into formal academic Korean.',
  chunkSize: 8000,
  onProgress(done, total) {
    console.log(done + '/' + total);
  }
});

const references = await LocalAI.features.citations.suggest(client, {
  topic: 'human-AI collaboration in higher education'
});
```

로컬 모델은 실시간 웹이나 학술 데이터베이스를 자동 검색하지 않습니다. 신뢰할 수 있는 인용이 필요하면 OpenAlex/Crossref 등에서 확인한 결과를 `evidenceText`로 먼저 넣어야 하며, 모델이 생성한 DOI·저자·논문명은 반드시 별도로 검증해야 합니다.

## MDLive 설정 재사용

현재 앱은 `mdpro_ai_provider_settings_v1`에 다음 필드를 저장합니다.

```js
{
  lmStudioBaseUrl: 'http://127.0.0.1:5678/v1',
  lmStudioModel: 'google/gemma-4-e4b',
  lmStudioApiKey: '',
  lmStudioConfigured: true
}
```

같은 origin에서 실행되는 코드라면 기존 값을 바로 읽을 수 있습니다.

```js
const client = LocalAI.createFromMdliveSettings(localStorage);
```

별도 앱의 저장 키를 쓰려면 다음처럼 명시적으로 저장하고 불러옵니다.

```js
LocalAI.saveConfig(localAIConfig, localStorage);
const client = LocalAI.createClient(LocalAI.loadConfig(localStorage));
```

API 키가 포함된 설정을 동기화하거나 외부로 내보낼 때는 평문 노출에 주의하세요. `client.getConfig({ redactApiKey: true })`를 사용하면 표시용 사본에서 키가 가려집니다.

## Node / Electron에서 사용

```js
const LocalAI = require('./ai_local/local-ai.js');
const client = LocalAI.createClient(require('./ai_local/local-ai.config.example.js'));

const result = await LocalAI.features.scholar.run(client, {
  role: 'editor',
  text: '다듬을 원문'
});
console.log(result.text);
```

## 공개 API 요약

- 설정: `defaults`, `settingsSchema`, `endpoints`, `normalizeConfig()`, `loadConfig()`, `saveConfig()`
- MDLive 호환: `compatibility.mdlive`, `loadMdliveConfig()`, `createFromMdliveSettings()`
- 클라이언트: `createClient()`, `getConfig()`, `configure()`, `listModels()`, `listLoadedModels()`, `testConnection()`, `complete()`, `stream()`
- 프롬프트: `prompts`, `builders`
- 기능: `features.deepResearch`, `features.translator`, `features.citations`, `features.scholar`

다른 MDLive 기능은 계속 `js/core/ai-provider.js`와 각 기능 파일을 사용합니다. 현재 MD Viewer의 ScholarAI 연동은 `index.html`에서 `local-ai.js`와 아래 공급자 어댑터를 명시적으로 로드합니다.

## ScholarAI에서 LM Studio 사용

MD Viewer의 ScholarAI에는 `scholar-ai-provider.js`가 연결되어 있어 `자동: LM Studio → AI Studio`, `LM Studio만 사용`, `AI Studio만 사용` 모드를 선택할 수 있습니다. 공급자 선택값이 없는 경우 자동 모드가 기본값입니다.

1. LM Studio에서 모델을 로드하고 Local Server를 시작합니다.
2. 앱의 `설정 → AI 연동 설정 → ScholarAI : LM Studio 설정`에서 Base URL, 필요시 API Key와 Temperature/Max tokens/Timeout/Top P를 입력합니다.
3. 같은 설정 카드에서 `현재 로드 모델 확인` 또는 `LM 연결 테스트`를 실행합니다. 모델 변경과 Load는 LM Studio에서 수행합니다.
4. ScholarAI를 열고 `모델선택`을 누릅니다.
5. AI Studio에서는 Gemini 모델을 선택합니다. LM Studio에서는 현재 로드 모델이 읽기 전용으로 표시되고 그 모델이 자동 사용됩니다.

ScholarAI 기본 LM Studio URL은 `http://127.0.0.1:5678/v1`이며 OpenAI 호환 `/v1/chat/completions`를 사용합니다. 공급자 선택 기록이 아직 없고 두 공급자가 모두 설정되어 있으면 LM Studio를 먼저 호출하고, 중지 이외의 오류가 발생하면 AI Studio로 재시도합니다. 사용자가 ScholarAI에서 공급자를 직접 선택한 뒤에는 선택한 공급자를 사용합니다.

- [LM Studio 다운로드](https://lmstudio.ai/download)
- [Ollama 다운로드](https://ollama.com/download)
- [Ollama 모델 찾기](https://ollama.com/search)

연결할 수 없다는 메시지가 나오면 LM Studio 서버 실행 여부, 포트, CORS 허용 설정을 확인하세요. ScholarAI의 LM Studio 선택은 텍스트 생성에만 적용되며 `sspimgAI` 이미지 생성은 계속 AI Studio API를 사용합니다.
