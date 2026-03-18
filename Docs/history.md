# 작업 ഹി스토리 (Work History)

## 2026년 3월 14일 23:46
**작업 내용:** 단일 HTML 파일에서 HTML, CSS, JS 분리

* **변경 사항 요약:**
  * **`index.html`**: 내부에 있던 `<style>` 및 `<script>` 요소를 제거하고, 외부 리소스로 불러오도록 링크 코드(`css/style.css`, `js/app.js`)를 갱신 및 추가했습니다.
  * **`css/style.css`**: `index.html` 내부에 있던 스타일 및 디자인 요소를 모두 분리하여 저장하는 폴더 및 파일 생성.
  * **`js/app.js`**: `index.html` 하단에 있던 애플리케이션 핵심 로직(IndexedDB, 마크다운 파싱, 사이드바 처리, 문서 관리 등) 전체를 분리하여 생성.
* **목적:** 코드 가독성 증대, 유지보수성 향상 및 프론트엔드 모듈화.

## 2026년 3월 13일
* **AI 설정:** 「인공지능 사용」체크 시 인증번호 입력 영역으로 스크롤·포커스.
* **API 키:** Google AI Studio 형식(AIza…, 길이) 검증 — 맞으면 초록, 틀리면 빨강 + 안내 문구; 저장 시 형식 오류면 토스트.
* **인증번호:** 성공 시 입력란·안내 초록색; 오류 시 빨강. ScholarAI/sspimgAI 체크 + 인공지능 사용 ON + 인증 완료 시 헤더 AI 버튼 표시(`aiMasterEnabled` 저장).
* **AI 사이드바:** 헤더 ScholarAI/sspimgAI 버튼을 눌렀을 때만 우측 패널 표시; 설정에서 켠 항목만 해당 버튼 노출.
* **인증 UI:** 「인증이 완료되었습니다」·초록 테두리는 올바른 인증번호 저장 직후에만; 설정 열 때는 입력란 비우고 중립 표시.
* **인증 유지:** 닫기 시 ScholarAI·sspimgAI 선택을 IndexedDB에 저장; 인증 완료 후에만 체크박스·헤더 AI 버튼 사용 가능.
* **AI 사이드바 표시:** 열릴 때 `position:fixed` 우측 패널로 표시(플렉스에 가려지지 않음); HTML 로드 재시도·실패 토스트.
* **ScholarAI/sspimgAI:** 각 버튼이 해당 패널만 토글, 둘 다 켜면 나란히 표시; 헤더 버튼 활성 링 표시.
* **AI 패널 본문:** `sidebar-ai.html` 마크업을 `index.html`에 인라인 삽입(fetch 없이 동작); `generateImage`는 config.example 형식; `body.theme-light`로 사이드바 라이트 테마 동기화.
* **AI 패널 레이아웃:** 우측 AI 영역을 `position:fixed` 대신 메인과 같은 flex 행에 두어 편집창이 자동으로 좁아짐; ScholarAI 모델 선택은 `getCallback`으로 초기화해 드롭다운이 동작.
* **sspimgAI:** `generateImages` 대신 공식 `:generateContent`(Gemini 이미지)·`:predict`(Imagen)로 호출해 브라우저에서 API 키만으로 생성 가능.
* **선택 연동:** 본문(#viewer·편집 textarea)에서 드래그 선택 시 ScholarAI 지문·SSP 프롬프트에 자동 반영.
* **SSP 이미지:** 기본 학술·논문용 스타일; 「단순 이미지」체크 시 텍스트 없는 이미지 전용 지시.
* **편집창 라이트:** 툴바 버튼으로 편집창만 라이트/다크 전환, 설정 유지.
* **AI 설정:** 사용자 정보 블록을 「인공지능 사용」밖(API 키 아래)으로 분리.
* **userIn:** 각 줄 끝 공백 2칸(마크다운 줄바꿈), 이메일 필드·인증 메일 본문 반영.
* **사용자 정보 삽입:** 편집창 `userIn` 버튼 또는 Ctrl+Alt+A로 커서 위치에 이름·학번·전공·연락처 삽입.
* **sspimgAI:** imgBB 새 창 버튼, 이미지 URL 마크다운 삽입 필드.
