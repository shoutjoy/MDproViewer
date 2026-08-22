# 인터넷 검색 로직 이식 가이드

## 1. 문서 목적

이 문서는 DOCX Merge Studio와 AI Jena에 구현된 인터넷 검색 기능을 다른 앱에 적용하기 위한 설계·구현 지침이다.

목표는 특정 AI 제공자의 내장 검색 기능에 의존하지 않고, 앱이 직접 검색 근거를 수집한 뒤 LM Studio, LiteRT, Google AI Studio 등 어떤 모델에도 동일한 근거를 제공하는 것이다.

이 문서의 예시는 현재 Python 서버와 브라우저 JavaScript 구조를 기준으로 하지만, 동일한 책임 분리를 유지하면 다른 언어와 프레임워크에도 적용할 수 있다.

---

## 2. 핵심 설계 원칙

1. **검색과 답변 생성을 분리한다.**
   - 검색 서버가 외부 검색 결과를 수집한다.
   - AI 모델은 수집된 근거를 바탕으로 답변만 생성한다.
   - 모델마다 검색 결과가 달라지는 문제와 내장 검색 쿼터 의존을 줄인다.

2. **모든 AI 제공자에 같은 검색 경로를 사용한다.**
   - LM Studio, LiteRT, AI Studio 등 제공자별로 검색 로직을 나누지 않는다.
   - 제공자가 바뀌어도 검색 결과 형식과 인용 규칙은 동일하게 유지한다.

3. **주 검색 서비스와 앱 자체 폴백을 분리한다.**
   - 통합 검색 서비스가 실행 중이면 다중 채널 검색을 사용한다.
   - 통합 검색 서비스가 꺼졌거나 실패하면 현재 앱 서버가 최소 검색을 수행한다.

4. **검색 결과가 없으면 추측 답변을 만들지 않는다.**
   - 특히 인물, 소속, 경력, 학력, 직책, 날짜와 같은 외부 사실은 검색 근거가 없으면 생성하지 않는다.
   - 사용자에게 검색어를 더 구체화하도록 안내한다.

5. **검색 API 키는 서버에서만 보관한다.**
   - NAVER API HUB 등의 Client ID와 Secret을 브라우저로 반환하지 않는다.
   - 저장 시 암호화하고 화면에는 마스킹된 값 또는 설정 여부만 제공한다.

---

## 3. 전체 처리 흐름

```text
사용자가 인터넷 검색 옵션을 켜고 질문
        │
        ▼
브라우저가 검색 API 호출
GET /api/web-search/?q=...&count=10&mode=quick
        │
        ▼
통합 검색 서비스 호출 시도
예: http://127.0.0.1:8765/api/web-search/
        │
        ├─ 성공: 다중 엔진·다중 채널 결과 사용
        │
        └─ 실패: 현재 앱 서버의 DDGS 검색으로 폴백
        │
        ▼
URL 정규화 → 중복 제거 → 채널별 결과 혼합 → 개수 제한
        │
        ▼
검색 결과를 공통 Evidence 형식으로 변환
        │
        ▼
AI 요청의 시스템 지침에 Evidence 삽입
        │
        ▼
AI 제공자의 내장 인터넷 검색은 비활성화
        │
        ▼
답변 생성 → 실제 검색 출처 링크 보강 → 대화 기록에 검색 근거 저장
```

---

## 4. 권장 구성요소와 책임

### 4.1 브라우저 UI

담당 기능:

- 인터넷 검색 켜기/끄기
- 결과 개수 선택
- 빠른 답변(`quick`)과 심층 답변(`reasoning`) 선택
- 검색 중, 검색 완료, 폴백 사용, 검색 실패 상태 표시
- 검색 결과 및 검색 엔진 정보를 대화 기록에 저장

인터넷 검색과 학술 전용 검색이 별도 기능이라면 동시에 활성화하지 않는 것이 안전하다. 두 기능의 근거 형식과 검증 규칙이 다르기 때문이다.

### 4.2 브라우저 검색 어댑터

브라우저는 서버 위치를 직접 여러 곳에 하드코딩하지 않고 하나의 `webSearch()` 함수로 감싼다.

권장 순서:

1. 통합 검색 서비스 호출
2. 네트워크 오류, 시간 초과 또는 비정상 응답이면 현재 앱의 동일 출처 API 호출
3. 두 경로가 모두 실패하면 사용자에게 명확한 오류 반환

```javascript
async function webSearch(query, count = 10, mode = 'quick') {
  const params = new URLSearchParams({
    q: String(query).trim(),
    count: String(Math.max(1, Math.min(Number(count) || 10, 50))),
    mode: mode === 'reasoning' ? 'reasoning' : 'quick'
  });

  try {
    return await requestIntegratedSearch(`/web-search/?${params}`);
  } catch (primaryError) {
    const response = await fetch(`/api/web-search/?${params}`, {
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.detail || '인터넷 검색에 실패했습니다.');
    }
    return payload;
  }
}
```

### 4.3 앱 검색 API

권장 엔드포인트:

```http
GET /api/web-search/?q={검색어}&count={1~50}&mode={quick|reasoning}
```

입력 규칙:

| 필드 | 규칙 | 권장 기본값 |
|---|---|---:|
| `q` | 공백 제거 후 필수, 최대 500자 | 없음 |
| `count` | 1~50 범위로 제한 | 10 |
| `mode` | `quick` 또는 `reasoning`만 허용 | `quick` |

이 API는 먼저 통합 검색 서비스에 요청하고, 결과가 없거나 서비스 연결이 실패하면 앱 자체의 DDGS 검색을 실행한다.

### 4.4 통합 검색 서비스

통합 검색 서비스는 여러 검색 작업을 병렬로 실행하되, 한 검색 엔진의 실패가 전체 검색을 중단시키지 않게 한다.

현재 구조에서 사용하는 검색 채널 예:

| 엔진/경로 | 채널 | 목적 |
|---|---|---|
| Google 또는 DuckDuckGo 일반 검색 | `general` | 일반 웹 문서 |
| 한국 블로그 도메인 제한 검색 | `blogs` | 국내 블로그·콘텐츠 |
| 학술 사이트 제한 검색 | `academic` | 학술 자료 단서 |
| 서점 사이트 제한 검색 | `bibliography` | 도서·서지 정보 |
| 인물·용어 사이트 제한 검색 | `people` | 인물 식별 근거 |
| NAVER API HUB 웹 검색 | `naver-web` | 국내 공식 검색 API 결과 |
| NAVER API HUB 블로그 검색 | `naver-blog` | 국내 블로그 검색 API 결과 |
| Bing RSS | `fallback` | 결과 부족 시 최종 폴백 |

`reasoning` 모드에서는 채널별 수집량과 전체 제한 시간을 늘릴 수 있다. 단, 단순히 결과 수만 늘리기보다 서로 다른 채널의 근거가 포함되도록 구성해야 한다.

---

## 5. 검색 결과 공통 데이터 계약

모든 검색 엔진 결과를 아래 형식으로 정규화한다.

```json
{
  "title": "문서 제목",
  "url": "https://example.com/article",
  "snippet": "검색 결과 요약",
  "date": "2026-08-22",
  "source": "Example",
  "kind": "text",
  "engine": "duckduckgo",
  "channel": "general",
  "queryUsed": "실제로 사용한 검색어"
}
```

필드 규칙:

- `title`: 최대 500자
- `url`: `http` 또는 `https`만 허용, 최대 2,000자
- `snippet`: HTML 태그를 제거한 평문, 최대 3,000자
- `date`: 검색 엔진이 제공한 날짜 문자열, 최대 80자
- `source`: 출처명, 최대 200자
- `kind`: `text`, `news` 등 검색 종류
- `engine`: 실제 검색 엔진 또는 API 이름
- `channel`: 검색 목적 분류
- `queryUsed`: 채널별 변형을 포함해 실제 실행한 검색어

성공 응답 예:

```json
{
  "ok": true,
  "engine": "multi-web",
  "query": "검색어",
  "results": [],
  "warnings": [],
  "fallbackUsed": false,
  "fallbackMessage": "",
  "naverApiHubUsed": true,
  "directSearchUrl": "https://search.naver.com/search.naver?query=..."
}
```

검색 결과가 없을 때는 빈 성공 응답을 반환하지 말고 `404`와 사용자용 메시지를 반환한다.

```json
{
  "ok": false,
  "error": "검증 가능한 검색 결과가 없습니다. 추측 답변을 생성하지 않습니다.",
  "warnings": [],
  "directSearchUrl": "https://search.naver.com/search.naver?query=..."
}
```

---

## 6. 검색 수집 로직

### 6.1 개별 검색 엔진 격리

각 검색 작업은 자체 예외 처리를 가져야 한다.

```python
def search_one_engine(query, limit, engine, channel):
    try:
        raw_items = provider.search(query=query, max_results=limit)
        return [normalize(item, engine, channel, query) for item in raw_items]
    except Exception as exc:
        return [], f"{engine}:{channel} 검색 실패: {str(exc)[:180]}"
```

한 엔진이 시간 초과되더라도 다른 엔진 결과는 정상 반환한다. 실패 정보는 `warnings`에 기록해 진단에 사용하되, 내부 예외 전체나 비밀값을 사용자에게 노출하지 않는다.

### 6.2 병렬 검색

서로 독립적인 검색 채널은 제한된 작업자 수로 병렬 실행한다.

```python
with ThreadPoolExecutor(max_workers=min(7, len(jobs) + 1)) as executor:
    futures = {
        executor.submit(search_one_engine, query, size, engine, channel): f"{engine}:{channel}"
        for engine, query, channel, size in jobs
    }
```

각 외부 요청에는 약 10~15초 수준의 개별 제한 시간을 두고, 전체 API에도 모드별 제한 시간을 둔다. 현재 앱은 빠른 검색 약 30초, 심층 검색 약 55초를 기준으로 사용한다.

### 6.3 URL 정규화와 중복 제거

중복 판단은 제목이 아니라 URL을 기준으로 한다.

권장 정규화:

- `http`와 `https` 외 스킴 제거
- 호스트명 소문자화
- URL fragment 제거
- 경로 끝의 불필요한 `/` 정리
- `utm_*`, `fbclid`, `gclid` 같은 추적 파라미터 제거
- 정규화된 URL이 같은 결과는 최초 한 건만 유지

리다이렉트 URL이나 검색 엔진 추적 URL을 그대로 모델에 제공하지 않도록 주의한다.

### 6.4 채널 균형 혼합

수집 순서대로 자르면 한 엔진의 일반 검색 결과가 전체 목록을 차지할 수 있다. 결과를 채널별 버킷으로 나눈 뒤 라운드 로빈 방식으로 한 건씩 선택한다.

권장 채널 우선순위:

```text
naver-web → naver-blog → general → blogs → academic
→ bibliography → people → fallback
```

우선순위는 앱의 목적에 맞게 바꿀 수 있다. 연구 앱은 `academic`을 앞에, 쇼핑 앱은 공식 제품·판매처 채널을 앞에 배치한다.

### 6.5 결과 부족 시 폴백

1차 병렬 검색을 정규화·중복 제거한 뒤 결과가 요청 개수보다 적으면 Bing RSS 같은 독립 경로로 부족분만 보충한다.

폴백 사용 여부는 `fallbackUsed`와 `fallbackMessage`로 응답하여 UI와 로그에서 확인할 수 있게 한다.

---

## 7. AI 답변 생성과 검색 근거 결합

### 7.1 검색을 AI 호출보다 먼저 수행

```javascript
let internetEvidence = '';

if (internetSearchActive) {
  const search = await webSearch(userText, resultCount, responseMode);
  const sources = Array.isArray(search.results) ? search.results : [];

  if (!sources.length) {
    throw new Error(
      '검증 가능한 근거를 찾지 못했습니다. 검색어를 소속·직책 등과 함께 다시 입력하세요.'
    );
  }

  internetEvidence = formatInternetEvidence(sources);
  pendingUser.internetSources = sources;
  pendingUser.internetSearchEngine = search.engine || 'multi-web';
  saveHistory();
}
```

검색 근거와 사용 엔진은 답변이 끝난 뒤가 아니라 검색 직후 대화 기록에 저장한다. 모델 호출이 실패하더라도 어떤 검색이 수행됐는지 복구할 수 있기 때문이다.

### 7.2 모델 내장 검색 비활성화

앱이 근거를 직접 수집했다면 AI 요청에는 다음과 같이 내장 검색을 끈다.

```javascript
const result = await ai.complete({
  provider,
  model,
  internetSearch: false,
  systemInstruction: buildSystemInstruction(internetEvidence),
  messages
});
```

이 원칙은 Google AI Studio의 검색 grounding 쿼터와 로컬 모델의 검색 기능 차이에 답변 품질이 종속되는 것을 방지한다.

### 7.3 근거 프롬프트 규칙

시스템 지침에는 최소한 다음 규칙을 포함한다.

- 최신 외부 사실은 제공된 검색 근거 안에서만 답한다.
- 사실 주장에는 클릭 가능한 출처 링크를 붙인다.
- 중요 정보는 가능하면 서로 독립적인 출처로 교차 확인한다.
- 게시 날짜와 실제 사건 날짜를 구분한다.
- 동명이인은 이름만으로 합치지 않는다.
- 인물 통합은 소속, 직책, 학력, 연구 주제, 활동 시기 등 독립 속성 두 개 이상이 명시적으로 연결될 때만 허용한다.
- 근거가 충돌하거나 부족하면 `확인되지 않음`으로 표시한다.
- 제공되지 않은 URL, 경력, 날짜, 통계를 추측해 만들지 않는다.

근거 텍스트 예:

```text
[1] 제목
URL: https://example.com/a
출처: Example / 날짜: 2026-08-22
요약: 검색 결과에서 추출한 설명
엔진: naver-api-hub / 채널: people
```

검색 결과는 신뢰할 수 없는 외부 입력이다. 검색 결과 본문에 포함된 “이전 지시를 무시하라” 같은 문장을 명령으로 취급하지 말고 인용 대상 데이터로만 취급해야 한다.

### 7.4 답변 후 출처 보강

모델이 일부 출처를 빠뜨릴 수 있으므로, 답변 생성 뒤 사용된 검색 결과의 링크 목록을 별도 출처 섹션으로 보강한다.

주의 사항:

- 모델이 생성한 존재하지 않는 URL을 허용하지 않는다.
- 출처 링크는 검색 결과에 실제 존재하는 URL만 사용한다.
- 같은 URL은 한 번만 표시한다.
- 사용자 클릭으로 외부 페이지를 열 때 `noopener`, `noreferrer`를 적용한다.

---

## 8. 보안 요구사항

### 8.1 API 자격 증명

- 검색 API의 Client ID와 Secret은 서버에서만 사용한다.
- 데이터베이스에는 암호화하여 저장한다.
- 설정 조회 API는 원문 대신 `configured`, `clientIdMasked`, `clientSecretMasked`만 반환한다.
- 로그, 오류 메시지, 검색 결과에 자격 증명이 포함되지 않도록 한다.
- 계정별 설정을 지원할 경우 요청의 계정 식별자를 서버에서 정규화하고 다른 계정 설정과 분리한다.

### 8.2 URL과 외부 콘텐츠

- `http`와 `https` URL만 허용한다.
- 검색 결과 HTML을 제거하고 텍스트로 정규화한다.
- 결과를 화면에 넣을 때 HTML 문자열을 직접 주입하지 않는다.
- 서버가 검색 결과 URL의 본문을 추가 수집한다면 SSRF 방지를 위해 사설 IP, loopback, link-local 주소와 비허용 포트를 차단한다.
- 브라우저에서 외부 링크를 열 때 새 창 권한과 opener 접근을 제한한다.

### 8.3 남용 방지

- 검색어 길이와 결과 개수를 제한한다.
- 사용자·계정·IP 단위 요청 속도 제한을 둔다.
- 동일 검색어의 짧은 TTL 캐시를 사용해 외부 검색 서비스 부하를 줄인다.
- 무제한 병렬 요청을 만들지 않는다.
- 운영 환경에서는 허용된 앱 출처만 API에 접근하도록 CORS와 인증 정책을 설정한다.

---

## 9. 오류 처리와 사용자 피드백

| 상황 | 서버 동작 | 사용자 표시 |
|---|---|---|
| 검색어 없음 | `400` | 검색어 입력 안내 |
| 일부 엔진 실패 | 성공 결과 반환 + `warnings` | 결과는 표시하고 일부 경로 실패 안내 가능 |
| 주 검색 서비스 중단 | 앱 자체 검색으로 폴백 | 폴백 검색 사용 표시 |
| 모든 검색 결과 없음 | `404` | 근거가 없어 답변을 만들지 않았다고 안내 |
| 외부 검색 서비스 장애 | `502` 또는 폴백 | 잠시 후 재시도 안내 |
| 검색 시간 초과 | 요청 중단 후 다른 경로 시도 | 어느 단계에서 재시도 중인지 표시 |
| AI 답변 생성 실패 | 검색 근거는 기록 유지 | 다시 답변 생성 가능하도록 복구 버튼 제공 |

내부 네트워크 예외 전체를 사용자에게 그대로 보여주지 않는다. 진단 로그에는 엔진, 채널, 경과 시간, 상태 코드만 남기고 비밀값과 검색 결과의 민감 정보는 제외한다.

---

## 10. 다른 앱에 적용하는 순서

### 1단계: 공통 검색 계약 구현

- `GET /api/web-search/` 추가
- 입력 검증과 성공/실패 JSON 형식 확정
- 결과 정규화 함수 작성

### 2단계: 최소 검색 경로 구현

- DDGS 등 API 키가 필요 없는 경로 하나를 먼저 연결
- 시간 초과, 빈 결과, 중복 제거 처리
- 실제 외부망 요청으로 결과 확인

### 3단계: 통합 검색 서비스 연결

- 주 서비스 우선 호출
- 현재 앱 서버 폴백 연결
- 두 서비스가 서로를 다시 호출해 무한 순환하지 않도록 역할을 명확히 구분

### 4단계: 다중 채널 검색 추가

- 일반, 국내, 블로그, 학술, 서지, 인물 등 앱 목적에 맞는 채널 정의
- 병렬 실행과 채널 균형 혼합 적용
- Bing RSS 등 독립 폴백 추가

### 5단계: AI 연결

- 검색을 모델 호출 전에 실행
- 검색 근거를 시스템 지침에 삽입
- 모델의 내장 검색 옵션 비활성화
- 답변에 실제 검색 URL만 인용되도록 보강

### 6단계: 설정과 보안

- 검색 API 자격 증명 암호화 저장
- 설정 조회 시 마스킹
- 속도 제한, 캐시, CORS, 인증 적용

### 7단계: 기록과 복구

- 질문 레코드에 `internetSources`, `internetSearchEngine`, 경고를 저장
- AI 생성 실패 후 같은 근거로 재생성 가능하게 구성
- 앱을 닫았다 다시 열어도 출처가 유지되는지 확인

---

## 11. 필수 검증 체크리스트

### 자동 테스트

- [ ] 빈 검색어가 `400`을 반환한다.
- [ ] `count`가 허용 범위를 벗어나지 않는다.
- [ ] `mode`가 `quick` 또는 `reasoning`으로 정규화된다.
- [ ] 통합 검색 서비스가 성공하면 그 결과를 우선 사용한다.
- [ ] 통합 검색 서비스가 실패하면 앱 자체 검색을 사용한다.
- [ ] 한 검색 엔진의 예외가 전체 검색을 중단시키지 않는다.
- [ ] 추적 파라미터를 제거한 동일 URL이 중복 제거된다.
- [ ] 비 HTTP URL이 제거된다.
- [ ] 채널별 결과가 한 엔진에 편중되지 않고 혼합된다.
- [ ] 결과가 없으면 AI 호출이 실행되지 않는다.
- [ ] 외부 근거를 제공할 때 AI 요청의 내장 검색 값이 `false`이다.
- [ ] API 키 원문이 설정 조회 응답과 로그에 포함되지 않는다.

### 실제 사용자 경로 테스트

- [ ] 통합 검색 서비스가 실행 중일 때 실제 검색 결과가 표시된다.
- [ ] 통합 검색 서비스를 종료해도 앱 자체 폴백이 동작한다.
- [ ] 인터넷이 끊겼을 때 무한 대기하지 않고 오류 안내가 표시된다.
- [ ] LM Studio와 AI Studio가 같은 검색 근거로 답변한다.
- [ ] 답변의 링크가 실제 검색 결과 URL과 일치하고 열 수 있다.
- [ ] 동명이인 질문에서 서로 다른 인물이 잘못 합쳐지지 않는다.
- [ ] 검색 결과가 없는 질문에서 모델이 외부 사실을 추측하지 않는다.
- [ ] 앱 재실행 후 이전 답변의 검색 출처가 다시 표시된다.
- [ ] 빠른 모드와 심층 모드의 제한 시간 및 결과량 차이가 UI에 반영된다.

자동 테스트에서 검색 함수를 mock한 성공은 코드 경로만 검증한다. 외부 검색이 실제로 되는지 확인하려면 배포 환경 또는 사용자 환경에서 DuckDuckGo, Google, Bing, NAVER API HUB에 실제 요청을 보내 별도로 검증해야 한다.

---

## 12. 현재 프로젝트의 참고 위치

다른 앱으로 이식할 때 전체 파일을 복사하지 말고 아래 책임 단위만 참고하여 대상 앱 구조에 맞게 다시 연결한다.

| 책임 | 현재 참고 파일 |
|---|---|
| 앱 서버 검색 API와 DDGS 폴백 | `web/app.py` |
| 브라우저의 주 서비스 → 앱 서버 폴백 | `web/AI_App/aiChat/ai-jena-local-api.js` |
| 검색 실행, 근거 저장, AI 요청 결합 | `web/AI_App/aiChat/ai-chat.js` |
| 다중 채널 검색, URL 정규화, NAVER/Bing 폴백 | `web/AI_App/local_backend/conversations/views.py` |
| 통합 검색 URL 라우팅 | `web/AI_App/local_backend/conversations/urls.py` |
| 서버 API 테스트 | `web/tests/test_editing.py` |
| 통합 검색·자격 증명 테스트 | `web/AI_App/local_backend/conversations/tests.py` |
| Python 검색 의존성 | `web/requirements.txt`, `web/pyproject.toml` |

현재 프로젝트의 서비스 역할은 다음처럼 구분되어 있다.

- DOCX Merge Studio FastAPI: 현재 앱과 자체 검색 폴백
- AI Jena Django `127.0.0.1:8765`: 다중 채널 통합 검색과 검색 설정
- DMerger Django `127.0.0.1:8766`: 문서 저장 전용이며 인터넷 검색과 무관

다른 앱에서는 포트와 프레임워크를 그대로 복제할 필요가 없다. 중요한 것은 **검색 서비스**, **현재 앱 폴백**, **AI 답변 생성**의 책임을 섞지 않는 것이다.

---

## 13. 구현 완료 기준

다음 조건을 모두 만족하면 인터넷 검색 기능을 이식 완료로 본다.

1. AI 제공자와 무관하게 동일한 검색 API를 사용한다.
2. 주 검색 서비스 장애 시 현재 앱의 검색 폴백이 동작한다.
3. 검색 결과가 정규화되고 URL 기준으로 중복 제거된다.
4. 서로 다른 목적의 검색 채널이 결과에 균형 있게 포함된다.
5. 검색 근거가 없는 경우 AI가 외부 사실을 추측하지 않는다.
6. 모델에는 수집된 근거가 전달되고 모델 내장 검색은 비활성화된다.
7. 답변 링크는 실제 수집된 URL만 사용한다.
8. 검색 API 자격 증명이 서버 밖으로 노출되지 않는다.
9. 검색 근거와 사용 엔진이 대화 기록에 저장되고 재실행 후 복원된다.
10. mock 테스트뿐 아니라 실제 외부망 검색과 사용자 클릭 흐름을 검증한다.
