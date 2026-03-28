# MDproViewer 도움말

## 1) 전체 메뉴 설명

### 상단 메뉴
- `새파일`: 새 문서 시작
- `열기`: 파일 열기 (`.md`, `.txt`, `.mpv`, `.json`, `.zip`, `.mdd`)
- `내보내기`: 문서 내보내기(MD/MDD/ZIP)
- `저장`: 내부 저장소(inDB, IndexedDB)에 저장
- `프린트`: 렌더링 문서 인쇄
- `설정`: API/AI/사용자 정보/옵션 설정
- `학술검색`: Scholar Search 창 열기

### 편집 툴바
- 제목/목록/링크/이미지/각주/찾기/정리/Tidy 등 문서 편집 기능
- `IMG`: 이미지 삽입 팝업
- `ENTER`: 설정값에 따라 줄바꿈 삽입 (`<br>` 또는 일반 개행 방식)
- `ID`: 내부 이동용 앵커 삽입

### 좌측 사이드 메뉴
- 폴더/문서 트리 보기
- 문서 열기/이동/삭제
- 폴더 생성
- `merge`: 여러 문서를 하나로 합치기

---

## 2) 설정의 API Key 설명 (찾아서 입력)

설정 창에서 입력합니다.

### AI Studio API Key
- 위치: `AI Studio API Key`
- 버튼: `API 키 저장`
- 링크: `API 키 발급`
- 용도: ScholarAI, sspimgAI 등 AI 기능

### imgBB API Key
- 위치: `imgBB API Key`
- 버튼: `저장`
- 링크: `https://api.imgbb.com/`
- 용도: 이미지 삽입 팝업의 `[imgBB] Upload`

---

## 3) 이미지 삽입/저장 방법

`IMG` 버튼으로 이미지 삽입 창을 엽니다.

### 입력 방법
- 파일 업로드(드래그 앤 드롭)
- 붙여넣기(`Ctrl+V`)
- `Crop` 후 사용

### 저장 방식
1. `imgBB Upload`
- 외부(imgBB) 업로드 후 URL 삽입

2. `문서내부저장`
- IndexedDB 내부 저장
- `internal://...` 링크로 문서에 삽입

3. `Gallery`
- 내부 이미지 목록 확인/선택
- 크게보기 연동
- `ZIP 전체다운로드` 지원

주의:
- 내부 이미지가 있는 문서를 `MD`로만 저장하면 이미지가 같이 저장되지 않습니다.
- 이미지 포함 문서는 `MDD` 또는 `ZIP` 저장 권장

---

## 4) 참고문헌 삽입/정리/서지 관리

`학술검색` > `Reference management`

### ① 참고문헌 추가
- 텍스트 붙여넣기 후 저장
- 구분 방식: `빈 줄 구분` / `엔터 구분`

### ② 인용 삽입
- 인라인/서술형 선택
- 옵션:
  - `문서 끝 References(APA) 추가`
  - `번호(링크)로 삽입`

삽입 규칙:
- `References 추가`만 체크: 참고문헌 본문만 추가 (항목 사이 한 줄 공백)
- 둘 다 체크: `<div id="schref-..."></div>` + 본문 형식으로 추가, 번호 링크와 연결

### ④ 저장된 목록
- 참고문헌 섹션 삽입
- TXT 다운로드 / MD 다운로드
- MD 불러오기(References 섹션 추출)
- 새창목록 / 전체 삭제

---

## 5) 사이드메뉴에서 파일 하나로 합치기 (merge)

1. 좌측 `merge` 버튼 클릭
2. 합칠 문서 선택
3. 순서 조정
4. 새 묶음 이름 입력
5. 확인 → 선택 문서가 하나로 합쳐져 저장

---

## 6) 저장 포맷 안내

### MD
- 텍스트만 저장
- 내부 이미지(IndexedDB) 미포함

### MDD
- 문서 + 내부 이미지 통합 번들
- 이미지 포함 문서 이동/백업에 적합

### ZIP
- 문서 + images 폴더 형태 저장
- 복원/이관에 적합

### MPV/JSON
- 프로젝트(문서/폴더 구조) 백업용

---

## 7) 인공지능 기능 (ScholarAI, sspimgAI)

### 사용 준비
1. 설정에서 `AI Studio API Key` 저장
2. 필요 시 검증 정보 저장
3. `ScholarAI`, `sspimgAI` 활성화

### ScholarAI
- 학술 텍스트 생성/요약/정리
- 모델/문체/프롬프트 설정
- 결과 문서 삽입 및 히스토리 저장

### sspimgAI
- 이미지 생성/편집 보조
- 생성 결과 삽입/다운로드

---

## 8) 핫키(단축키) 안내 (`hotkey/hotkey.js` 기준)

### 모드/화면
- `Alt + 1`: Edit mode
- `Alt + 2`: View mode
- `Alt + 4`: Theme toggle
- `Alt + S`: Scholar search

### 문서 서식/삽입
- `Ctrl + Alt + 1`: Heading H1
- `Ctrl + Alt + 2`: Heading H2
- `Ctrl + Alt + 3`: Heading H3
- `Ctrl + Alt + 4`: Heading H4
- `Ctrl + Alt + 5`: Heading H5
- `Alt + 5`: Bullet list
- `Alt + 6`: Number list
- `Alt + 7`: Pattern to table
- `Ctrl + B`: Bold
- `Ctrl + I`: Italic
- `Ctrl + Alt + E`: Insert footnote
- `Shift + Alt + A`: Insert user info
- `Ctrl + Shift + Enter`: Insert `<br>`
- `Ctrl + Shift + Space`: Insert `&nbsp;`

### 변환/정리/찾기
- `Shift + Alt + H`: MD to HTML
- `Ctrl + Alt + T`: Tidy
- `Ctrl + H`: Find/Replace
- `Alt + L`: Text style modal

### 편집 이동/복제
- `Alt + ArrowUp`: Move line up
- `Alt + ArrowDown`: Move line down
- `Shift + Alt + ArrowDown`: Copy line down

### 실행 취소/다시 실행
- `Ctrl + Z`: Undo
- `Ctrl + Shift + Z` 또는 `Ctrl + Y`: Redo

### 배율/폰트 (핫키 코드에 추가 구현됨)
- `Ctrl + 7`: 페이지 축소
- `Ctrl + 8`: 페이지 확대
- `Ctrl + 9`: 폰트 축소
- `Ctrl + 0`: 폰트 확대