# Crossref 동시검색 및 MD/PV 편집 기능

## 개요

상단의 `학술검색` 기능에서 기존 Google Scholar 검색과 별도로 Crossref 공개 API를 선택적으로 함께 검색한다. Crossref 검색 결과는 외부 탭이 아닌 앱 내부의 MD/PV 미러 편집창으로 표시된다.

Crossref 검색은 기본적으로 꺼져 있다. 사용자가 `Crossref 동시검색`을 체크한 경우에만 실행한다.

## 화면 동작

학술검색 옵션에는 다음 항목이 있다.

- `Crossref 동시검색`: 기본값은 해제 상태이다.
- 결과 개수 선택: 10, 15, 20, 30, 40, 50건을 선택할 수 있다.
- 직접 입력: 숫자 입력칸에서 1~50건 사이의 값을 입력할 수 있다.
- 기본 결과 개수: Crossref를 활성화할 경우 15건이다.
- 검색 기간: 기존 `Any time`, 최근 1년, 5년, 10년 설정을 Crossref에도 적용한다.
- `Review/Survey only`: 활성화하면 Crossref 검색어에도 review/survey 조건을 추가한다.

검색 버튼을 누르면 Google Scholar 검색은 기존 방식으로 실행된다. Crossref가 체크되어 있으면 Crossref API 검색도 동시에 시작된다.

## 내부 결과 편집창

Crossref 검색이 완료되면 앱 내부에 `Crossref 검색 결과 · MD/PV 미러 편집` 창을 연다.

- 왼쪽 사이드바 `목차`: Markdown의 1~3단계 제목을 자동으로 나열하며, 클릭하면 PV의 해당 제목으로 이동한다.
- 가운데 `MD 편집`: 검색 결과 Markdown 원문을 직접 수정한다.
- 오른쪽 `PV 편집 · 미리보기`: 렌더링된 내용을 직접 수정할 수 있으며 변경 내용은 Markdown과 목차에 반영된다.
- `전체`, `MD만 보기`, `PV만 보기`: 편집 영역 표시 방식을 전환한다. 목차 사이드바는 모든 모드에서 유지된다.
- 목차 영역은 Crossref의 저자, 연도, 제목, 학술지, 권·호, 페이지, DOI 정보를 이용해 APA 참고문헌 목록으로 표시한다.
- 각 APA 항목의 `복사` 버튼으로 개별 복사할 수 있고, `전체 복사`로 모든 항목을 빈 줄로 구분해 복사할 수 있다.
- `문헌관리로 보내기`는 APA 목록을 문헌관리의 `APA 형식 참고문헌 붙여넣기` 입력란으로 보내고 `빈 줄 구분` 방식을 선택한다.
- `MD 복사`: 편집된 Markdown 전체를 클립보드에 복사한다.
- `MD 저장`: 현재 수정된 Markdown을 검색어 기반 파일명의 `.md` 파일로 내려받는다.
- `GitHub 공유`: 설정에 저장된 PAT로 접근 가능한 저장소를 선택하고, 브랜치·폴더·파일명을 지정해 현재 MD를 생성하거나 갱신한다.
- `폴더 생성`: GitHub 저장소에 빈 폴더를 직접 저장할 수 없는 제약 때문에 선택한 경로에 `.gitkeep` 파일을 생성한다.
- 공유가 끝나면 `GitHub에서 열기` 링크로 업로드된 파일을 새 탭에서 확인할 수 있다.
- `현재 문서로 열기`: 편집된 결과를 메인 Markdown 편집기로 옮긴다.
- 현재 문서에 기존 내용이 있으면 교체 전에 확인한다.
- 결과창 제목 표시줄을 드래그해 창을 이동할 수 있다.
- 결과창 바깥은 차단하지 않으므로 원래 문서를 계속 클릭하고 편집할 수 있다.
- APA 참고문헌·MD 편집·PV 미리보기 사이의 세로 구분자를 드래그해 각 영역 너비를 조절할 수 있다.

## 검색 결과 형식

각 결과는 다음 순서로 생성한다.

```markdown
## 1. 논문 제목

저자·연도: 저자명 (연도)

학술지: 학술지명

DOI: https://doi.org/...

메타데이터: Crossref

### 초록

Crossref가 제공한 공개 초록
```

Crossref가 초록을 제공하지 않는 문헌은 `Crossref 공개 메타데이터에서 초록을 제공하지 않음`으로 표시한다.

## 처리 흐름

1. `scholarsearch-shell.js`가 검색어, 결과 개수, 기간, Review/Survey 조건을 읽는다.
2. Google Scholar 검색을 기존 방식으로 연다.
3. Crossref가 체크되어 있으면 `ScholarCrossrefSearch.search()`를 호출한다.
4. 우선 공개 초록이 있는 문헌을 검색한다.
5. 결과가 요청 개수보다 적으면 Crossref 서지정보 검색으로 부족한 결과를 보충한다.
6. DOI 또는 정규화된 제목을 기준으로 중복을 제거한다.
7. `ScholarCrossrefSearch.formatMarkdown()`이 결과를 Markdown으로 변환한다.
8. 내부 MD/PV 미러 편집창에서 결과를 표시한다.

## 파일 구성

- `crossref/search.js`
  - Crossref API 요청
  - 기간 필터 적용
  - 초록 우선 검색과 서지정보 보충
  - DOI·제목 기반 중복 제거
  - 결과 Markdown 변환
- `ui/scholarsearch-shell.html`
  - Crossref 체크박스와 개수 입력 UI
  - 내부 MD/PV 결과 편집창 구조
- `ui/scholarsearch-shell.js`
  - 검색 UI 제어
  - Google Scholar와 Crossref 동시 실행
  - 결과 편집창과 실시간 PV 미러 처리
  - 메인 Markdown 문서로 결과 전달
- `tools/sync-fallback-from-html.js`
  - HTML UI를 JavaScript 내장 폴백 템플릿과 동기화

## 전역 API

`crossref/search.js`는 다음 API를 제공한다.

```javascript
window.ScholarCrossrefSearch.search(query, count, options)
window.ScholarCrossrefSearch.formatMarkdown(results, query)
```

`search()` 옵션:

- `periodYears`: 최근 검색 기간. `0`이면 전체 기간이다.
- `reviewOnly`: Review/Survey 검색어 조건 적용 여부이다.
- `signal`: 선택적인 `AbortSignal`이다.
- `onProgress(message)`: 검색 진행 메시지 콜백이다.

## 제한사항

- Google Scholar 결과 페이지는 Google 정책과 브라우저 제약 때문에 기존처럼 외부 브라우저에서 연다.
- 내부 편집창에는 Crossref 공개 API 결과가 표시된다.
- 초록 제공 여부와 메타데이터 완전성은 Crossref 등록기관의 데이터에 따라 달라진다.
- 결과 개수는 최대 50건으로 제한한다.

## 검사

다음 명령으로 Crossref API 응답 변환과 출력 형식을 네트워크 없이 검사할 수 있다.

```powershell
node scripts\test-academic-search-crossref.js
```
