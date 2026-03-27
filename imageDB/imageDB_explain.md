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
