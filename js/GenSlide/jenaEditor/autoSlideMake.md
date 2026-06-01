# Auto Slide Make 개발 계획 (JenaEditor 기준)

## 1) 목표 정의
- 긴 원고(텍스트/마크다운)를 입력하면:
  - 핵심 내용을 요약하고
  - 슬라이드 단위로 분할한 뒤
  - JenaEditor 슬라이드(`slides[]`)로 자동 생성
- 사용자는 생성 후 즉시:
  - 슬라이드별 수정/재생성
  - 개수 조정
  - 스타일(톤/길이/bullet 수) 재적용 가능

## 2) 현재 JenaEditor 구조 반영 포인트
- UI 조립:
  - `js/controller.js`가 `ui/*.html`을 로드하고 fallback inline UI를 가짐
  - 새 UI는 `ui/header.html` 또는 별도 `ui/autoSlideModal.html` + `controller.js` fallback에 동시 반영 필요
- 상태/데이터:
  - 슬라이드 데이터는 `js/state.js`의 `slides`, `cur` 중심
  - 생성 결과는 `slides.push(...)` 또는 기존 add 로직 재사용
- 편집 동기화:
  - 코드/에디터 동기화는 `js/main.js`, `js/editor.js` 경유
  - 자동 생성 반영 후 `loadCurrent()`, `renderSlides()`, `scheduleAutoSave(...)` 호출 필요
- 저장/내보내기:
  - 기존 `mpp Export`, `inDB Save` 흐름을 그대로 활용
  - autoslide 생성 메타는 별도 `slide.meta` 또는 app-level 설정으로 저장

## 3) 기능 범위 (MVP → 확장)

### MVP
- 입력:
  - 텍스트 붙여넣기
  - 파일 불러오기 (`.md`, `.txt`, `.pdf`)
- 옵션:
  - 슬라이드 수(예: 5~30)
  - 슬라이드당 bullet 수(예: 3~5)
  - 언어(ko/en)
  - 요약 강도(보수/균형/강요약)
- 결과:
  - `[{title, bullets[], note}]` 구조 생성
  - 각 항목을 JenaEditor HTML 템플릿으로 변환 후 슬라이드 생성
- 조작:
  - `새로 생성(기존 유지)` / `기존 교체 후 생성`

### 확장 1
- `문단 기반 자동 분할` + `주제 클러스터링`
- 슬라이드별 재생성(해당 슬라이드만)
- 발표자 노트 자동 생성

### 확장 2
- 레이아웃 추천(텍스트 중심/2단 비교/요약+핵심숫자)
- 시각 요소 힌트(이미지 키워드, 차트 후보)
- 템플릿 스타일 프리셋

## 4) 아키텍처 제안

### 4.1 모듈 분리
- `js/ai/autoSlide.js` (신규)
  - 입력 정규화
  - 파일 로더/텍스트 추출기
  - chunk 분할
  - 프롬프트/모델 호출
  - 응답 JSON 검증/정리
  - 슬라이드 HTML 변환기
- `js/main.js`
  - 버튼 이벤트 바인딩
  - 모달 open/close
  - 생성 결과 적용 트리거
- `ui/*.html`
  - Auto Slide 모달 마크업

### 4.2 데이터 스키마 (내부 표준)
```json
{
  "sourceMeta": {
    "language": "ko",
    "summaryLevel": "balanced",
    "targetSlides": 10
  },
  "slides": [
    {
      "title": "슬라이드 제목",
      "bullets": ["핵심 1", "핵심 2", "핵심 3"],
      "note": "발표자 노트(선택)",
      "keywords": ["선택", "확장용"]
    }
  ]
}
```

### 4.3 HTML 변환 규칙
- 기본 템플릿:
  - `<div class="slide"><h1>...</h1><ul><li>...</li></ul></div>`
- bullet 수 초과 시:
  - 자동 2슬라이드 분할 또는 tail bullets를 다음 슬라이드로 이월
- XSS 방지:
  - title/bullet/note 텍스트 escape 필수
- 도표/그래프 자동 변환:
  - 숫자 비교/추세/구성비가 감지되면 텍스트 대신 `chart spec` 생성
  - 렌더링은 JS 기반(`Chart.js` 또는 SVG 생성 함수)으로 수행
  - 슬라이드에는 `<canvas data-chart-spec="...">` 또는 `<svg ...>` 형태로 삽입
  - 편집기 로드시 spec을 파싱해 차트를 재렌더링(리사이즈/테마 반영)

## 5) LLM 연동 전략

### 5.1 호출 방식
- 옵션 A: 상위 앱(parent window)의 기존 AI 라우팅 사용 (권장)
  - `postMessage`로 요청 전달
  - 장점: 키/모델 설정 재사용 가능
- 옵션 B: jenaEditor 내부 직접 호출
  - 키 관리/오류 처리 별도 구현 필요

### 5.2 프롬프트 설계 핵심
- 출력은 반드시 JSON
- 길이 제한 명시:
  - 제목 1줄
  - bullet 1개당 최대 N자
- 금지사항:
  - 근거 없는 수치 생성 금지
  - 반복 문장 금지

### 5.2.1 프롬프트 설계 상세 체크리스트 (강조)
- [ ] 프롬프트를 단일 문장 지시가 아닌 `역할/목표/제약/출력형식/검증규칙` 5단 구조로 설계한다.
- [ ] 슬라이드 구성 규칙을 명시한다:
  - 슬라이드당 `title 1개 + bullet N개 + (선택)note 1개`
  - `도입-본론-결론` 흐름 유지
  - 중복 슬라이드/유사 제목 금지
- [ ] 양식(스타일) 규칙을 명시한다:
  - 제목 톤(학술형/실무형/강의형)
  - bullet 종결 방식(명사형/서술형) 통일
  - 숫자/단위/약어 표기 규칙 통일
- [ ] 요약 방식 규칙을 명시한다:
  - 압축률(원문 대비 %) 범위 지정
  - 핵심어 우선순위(결론 > 근거 > 사례)
  - 불확실/추정 표현 라벨링(예: "추정", "가설")
- [ ] 내용 신뢰성 규칙을 명시한다:
  - 원문에 없는 사실 추가 금지
  - 수치/연도/인명은 원문 근거가 있을 때만 사용
  - 근거 부족 항목은 `검증 필요` 태그
- [ ] 시각화(차트) 규칙을 명시한다:
  - 차트는 `비교/추세/구성비` 데이터가 있을 때만 생성
  - 데이터 불충분 시 차트 대신 bullet fallback
- [ ] 출력 스키마를 엄격히 고정한다:
  - 허용 키 외 출력 금지
  - 문자열 길이 상한, 배열 길이 상한 명시
  - 파싱 실패 방지를 위해 코드블록/설명문 출력 금지
- [ ] 자동 자기검증 단계를 프롬프트에 포함한다:
  - 생성 후 체크: 길이/중복/근거/형식 규칙 위반 여부
  - 위반 시 모델이 자체 수정 후 최종 JSON만 반환
- [ ] 재생성(rewrite) 지시 프롬프트를 별도로 설계한다:
  - "더 짧게", "더 학술적으로", "초급자용" 같은 변형 지시 템플릿 분리
  - 전체 재생성/슬라이드 단건 재생성 프롬프트 분리
- [ ] 언어별 프롬프트 정책을 분리한다:
  - 한국어/영어 각각 문체 규칙과 길이 기준 별도 지정
  - 혼합 언어 입력 시 출력 목표 언어 고정

### 5.3 실패 복구
- JSON 파싱 실패 시:
  - 1차: lightweight repair (trailing comma 제거 등)
  - 2차: 재요청
- 타임아웃/네트워크 실패 시:
  - 생성 중단 + 재시도 버튼

### 5.5 차트 생성 규칙 (LLM + JS 렌더)
- LLM 출력에 `visual` 필드 추가:
```json
{
  "title": "분기별 매출 추이",
  "bullets": ["핵심 요약..."],
  "visual": {
    "type": "chart",
    "chartType": "bar|line|pie",
    "labels": ["Q1","Q2","Q3","Q4"],
    "datasets": [{"label":"Sales","data":[12,18,17,25]}]
  }
}
```
- 검증 로직:
  - `labels.length === data.length` 확인
  - 숫자 파싱 실패/결측 시 chart 생성 취소하고 bullet 모드로 fallback
- 렌더링 로직:
  - `js/ai/autoSlide.js`에서 chart spec을 HTML로 변환
  - `js/editor.js` 또는 신규 `js/chart-render.js`에서 iframe 내부 렌더
  - export 시 canvas 이미지를 고정 캡처하거나 SVG 유지 전략 선택

## 5.4 파일 입력 처리 전략 (md/pdf 포함)
- 공통:
  - 업로드 후 내부 표준 텍스트로 변환한 뒤 동일 파이프라인 사용
  - 최대 파일 크기 제한(예: 20MB) + 텍스트 길이 제한(예: 20만자)
- `.md` / `.txt`:
  - `FileReader.readAsText(..., "utf-8")`
  - front-matter/코드블록/링크 처리 옵션 제공
- `.pdf`:
  - 1차: `pdf.js` 기반 클라이언트 텍스트 추출
  - 2차(옵션): 추출 품질 낮은 경우 OCR 경고/대체 업로드 안내
  - 페이지 구분자(`\n\n--- page N ---\n\n`)를 넣어 chunk 경계 품질 개선
- 에러 처리:
  - 읽기 실패/암호화 PDF/스캔본(텍스트 없음) 감지 시 명확한 안내
  - "텍스트 추출 결과 미리보기" 단계에서 사용자 확인 후 생성

## 6) UI/UX 설계

### 6.1 진입점
- 상단 버튼 추가: `Auto Slide`
- 위치: 현재 헤더 액션 버튼군(`header.html`) 우측

### 6.2 모달 구성
- 입력:
  - 원고 textarea
  - 파일 업로드 버튼 (`md/txt/pdf`)
  - 업로드 파일명/크기/추출 상태 표시
  - 슬라이드 수, bullet 수, 언어, 요약강도
- 액션:
  - `미리보기 생성`
  - `슬라이드로 적용`
  - `취소`
- 결과 미리보기:
  - 생성된 슬라이드 제목 목록
  - 슬라이드 클릭 시 bullets 확인

### 6.3 적용 모드
- `append`: 기존 슬라이드 유지 + 뒤에 추가
- `replace`: 전체 교체
- `insertAfterCurrent`: 현재 슬라이드 다음에 삽입

## 7) 구현 체크리스트

### 7.1 UI
- [ ] `ui/header.html`에 Auto Slide 버튼 추가
- [ ] Auto Slide 모달 마크업 추가
- [ ] 파일 업로드 input/드래그앤드롭 영역 추가 (`accept=".md,.txt,.pdf"`)
- [ ] `styles.css`에 모달/프리뷰 스타일 추가
- [ ] `controller.js` inline fallback UI 동기 반영

### 7.2 로직
- [ ] `js/ai/autoSlide.js` 신규 생성
- [ ] 입력 정규화 함수 구현 (공백/줄바꿈/불필요 기호 정리)
- [ ] 파일 로더 구현 (`readAsText`, pdf 추출)
- [ ] PDF 텍스트 추출 유틸(`pdf.js`) 연결
- [ ] chunk 분할기 구현 (길이 기반 + 문단 경계 우선)
- [ ] 모델 호출 어댑터 구현 (parent bridge 우선)
- [ ] 응답 JSON schema validator 구현
- [ ] slide HTML builder 구현
- [ ] chart spec schema + validator 구현
- [ ] chart renderer(JS) 구현 및 슬라이드 삽입 연동
- [ ] chart 실패시 bullet fallback 구현

### 7.3 에디터 통합
- [ ] 생성 결과를 `slides[]`에 반영하는 apply 함수 구현
- [ ] 반영 후 `cur`, `loadCurrent()`, 목록 렌더 갱신
- [ ] undo checkpoint 추가 (대량 변경 전)

### 7.4 품질
- [ ] 매우 긴 원고(예: 2만자) 성능 테스트
- [ ] 한/영 혼합 텍스트 테스트
- [ ] `.md` heading/list/codeblock 포함 문서 테스트
- [ ] `.pdf` 텍스트형/스캔형 샘플 테스트
- [ ] 특수문자/HTML 태그 포함 텍스트 안전성 테스트
- [ ] 생성 실패/취소/중복 클릭 방지 테스트
- [ ] 차트 데이터 이상치/빈 데이터/음수 데이터 렌더 테스트
- [ ] 테마 변경(light/dark) 시 차트 색상 가독성 테스트

### 7.5 저장/복구
- [ ] 마지막 입력 옵션 localStorage 저장 (`jena_auto_slide_opts_v1`)
- [ ] 임시 draft 저장 (`jena_auto_slide_draft_v1`)

## 8) 기술 리스크 및 대응
- 리스크: 모델 응답이 스키마를 벗어남
  - 대응: strict validator + auto-repair + retry
- 리스크: 긴 입력에서 지연/비용 증가
  - 대응: 2단계 요약(Chunk 요약 → 전체 재요약)
- 리스크: 슬라이드 과다 생성으로 품질 저하
  - 대응: max slides 상한, bullet 길이 강제
- 리스크: 기존 편집 흐름과 충돌
  - 대응: 적용 전 confirm, undo checkpoint

## 9) 개발 순서 (권장)
1. UI 버튼/모달 추가
2. 더미 데이터로 슬라이드 생성/적용 파이프라인 완성
3. LLM 연동(요약 + JSON 출력)
4. Validator/Retry/오류 UX
5. 옵션 저장/복구
6. 성능 튜닝/품질 테스트

## 10) 완료 기준 (Definition of Done)
- 원고 1건 입력 후 10장 내외 슬라이드 자동 생성 가능
- 생성 후 즉시 편집/저장/export 정상 동작
- 실패 케이스(네트워크/파싱)에서 UI가 멈추지 않고 재시도 가능
- 기존 기능(수동 편집, mpp export, inDB save) 회귀 없음

## 11) 다음 구현 시 바로 만들 파일
- `Apps/GenSlide/jenaEditor/js/ai/autoSlide.js` (신규)
- `Apps/GenSlide/jenaEditor/ui/autoSlideModal.html` (신규, 또는 index 내 모달)
- `Apps/GenSlide/jenaEditor/js/main.js` (이벤트 바인딩/적용)
- `Apps/GenSlide/jenaEditor/styles.css` (모달 스타일)
- `Apps/GenSlide/jenaEditor/js/controller.js` (fallback 동기화)
