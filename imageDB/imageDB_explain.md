# imageDB 설계/기능 설명

## 목표
- 이미지 파일을 외부 URL(imgBB) 대신 **IndexedDB 내부(images 스토어)** 에 저장한다.
- 문서 본문에는 `internal://<imageId>` 형태의 내부 링크를 삽입한다.
- 렌더링 시 내부 링크를 Blob URL로 변환하여 실제 이미지가 보이게 한다.
- 내보내기 시 내부 이미지 포함 문서는 ZIP으로 내보낼 수 있도록 한다.
- ZIP 불러오기 시 `images/*` 파일을 다시 IndexedDB `images` 스토어에 복원하고 문서 링크를 `internal://` 로 되돌린다.

## 폴더 구조
- `md_viewer/imageDB/imageDB.js`
  - 내부 이미지 저장/조회
  - internal 링크 파싱/검사
  - 렌더링용 internal 링크 해석
  - ZIP 내보내기/불러오기

## 내부 링크 규칙
- 저장 링크: `internal://img_<timestamp>_<random>`
- 문서 삽입 예시:
  - `![image](internal://img_1712345678901_ab12cd)`

## IndexedDB 구조
- 기존 DB에 `images` 스토어를 추가 사용
  - keyPath: `id`
  - 레코드 예시:
    - `id`
    - `blob`
    - `name`
    - `mime`
    - `createdAt`

## 저장 흐름
1. 이미지 업로드/붙여넣기
2. `문서내부저장` 버튼 클릭
3. `ImageDB.saveDataUrl(...)` 또는 `ImageDB.saveBlob(...)` 호출
4. 반환된 `internal://...` 링크를 URL 입력칸에 세팅
5. Markdown/HTML 삽입 버튼으로 문서에 링크 삽입

## 렌더링 흐름
1. 문서 렌더 직전 markdown 문자열 검사
2. `internal://` 링크 추출
3. `images` 스토어에서 blob 조회
4. Blob URL 생성 후 markdown 내부 링크 치환
5. `marked` 렌더링

## 내보내기/불러오기
- 내부 이미지가 없는 문서:
  - `.md` 그대로 저장
- 내부 이미지가 있는 문서:
  - 사용자에게 ZIP 저장 여부 확인
  - ZIP 저장 시:
    - `doc.md`
    - `images/<id>` 파일들
  - `doc.md` 안의 `internal://id` 는 `images/id` 로 치환하여 저장

- ZIP 불러오기 시:
  - `doc.md`와 `images/*`를 읽어 `images` 스토어에 복원
  - markdown 내 `images/id`를 `internal://id`로 복구

## 제한/주의
- Object URL은 렌더링 중 생성되므로 필요 시 revoke 처리 필요
- Electron 파일 저장 경로에서는 ZIP 저장 API 연동이 별도 필요할 수 있음
- 외부 링크 이미지(`https://...`)는 기존과 동일하게 그대로 동작


# 개발 과정
핵심은 imageDB 모듈을 새로 만들고, 내부 링크(internal://...) 기반으로 저장/렌더/내보내기/불러오기를 연결한 것입니다.

변경 파일:

imageDB.js
imageDB_explain.md
index.html
app.js
적용 내용:

imageDB 폴더 신설
imageDB/imageDB.js에 기능 모음:
내부 링크 생성/파싱
이미지 IndexedDB 저장/조회
markdown 내 internal:// 링크를 Blob URL로 해석
ZIP 내보내기 (doc.md + images/*)
ZIP 불러오기 후 images/*를 DB로 복원 및 링크 복구
DB 구조 확장
DB_VERSION을 3으로 올리고 images objectStore 추가
이미지 레코드: id, blob, name, mime, createdAt
IMG 모달에 “문서내부저장” 버튼 추가
버튼: 문서내부저장
클릭 시 현재 이미지(data URL)를 images 스토어에 저장
저장 후 img-insert-url에 internal://... 링크 자동 세팅
기존 Markdown/HTML 삽입 버튼으로 문서에 바로 넣을 수 있음
렌더링 시 내부 이미지 표시
renderMarkdown() 및 프리뷰 팝업 렌더에서
internal:// 링크를 Blob URL로 변환 후 렌더
Object URL 정리(revoke)도 추가
저장/내보내기 옵션 (내부 이미지 감지)
웹 저장(saveCurrentFile, saveFileAs)에서:
내부 이미지가 있으면 확인창 표시
확인(OK): ZIP 내보내기
취소(Cancel): MD 저장
내부 이미지 없으면 기존처럼 MD 저장
불러오기 ZIP 지원
파일 열기에서 .zip 감지 시:
ZIP에서 markdown + images 읽기
images를 IndexedDB에 저장
markdown 링크를 internal://...로 복구 후 문서 로드
설명 문서 작성
imageDB/imageDB_explain.md에 구조/흐름/주의사항 정리
추가 반영:

파일 선택 accept에 .zip 추가
index.html에 imageDB/imageDB.js 스크립트 연결
검증:

node --check md_viewer/js/app.js 통과
참고:

이번 구현은 웹(브라우저) 저장 플로우 기준으로 ZIP 옵션을 붙였습니다.
Electron의 native 저장 다이얼로그로 ZIP 저장까지 완전 통합하려면 ipcRenderer 쪽 추가 연동이 필요합니다. 원하시면 다음 단계로 바로 이어서 붙여드릴게요.