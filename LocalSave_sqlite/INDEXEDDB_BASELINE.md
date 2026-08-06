# IndexedDB 기준선과 회귀 시나리오

기준일: 2026-08-06  
적용 작업: Work 027 / Phase 0

## 대상 저장소

| DB | 현재 확인 버전 | 주요 store | 기준 백업 |
|---|---:|---|---|
| `MarkdownProDB` | 5 | `documents`, `folders`, `ai_settings`와 기능별 store | `baselines/indexeddb_sample_backup.json` |
| `mdpro-indb-v1` | 1 | `files`, `meta` | 같은 기준 백업의 `databases.mdpro-indb-v1` |

기준 백업은 실제 API Key나 사용자 문서를 복사하지 않은 합성 fixture다. 실제 사용자 IndexedDB는 이 단계에서 읽기 전용 원본으로 유지하며 삭제하거나 schema를 변경하지 않는다.

## IndexedDB 문서 회귀 순서

1. `indb` 모드에서 ROOT 폴더와 하위 폴더를 조회한다.
2. 한글·이모지 본문의 문서를 ROOT에 생성하고 다시 열어 본문이 같은지 비교한다.
3. 제목·본문을 수정하고 `updatedAt` 및 본문을 다시 읽는다.
4. 문서를 하위 폴더로 이동한 뒤 목록과 단건 조회의 `folderId`가 같은지 확인한다.
5. 제목 검색어로 같은 문서 ID가 반환되는지 확인한다. 현재 IndexedDB 좌측 검색은 제목 기준이며 본문 FTS는 SQLite 모드의 확장 기능이다.
6. 문서를 삭제하고 목록·검색·단건 열기에서 사라졌는지 확인한다.

이 흐름은 `test-indexeddb-adapter-crud.js`의 생성·열기·수정·이동·삭제·제목 검색, `test-indexeddb-migration.js`의 두 DB 읽기/정규화/checksum 계약과 기존 앱의 `saveToDB`, `loadFromDB`, `moveDocToFolder`, `deleteFromDB`, `renderDBList` 호출 경로로 고정한다.

## 문서 레코드의 실제 필드

기본 필드:

- `id`, `title`, `content`, `folderId`, `createdAt`, `updatedAt`

선택 필드:

- `googleDocId`: Google Docs에 연결된 현재 IndexedDB 문서에만 존재하며 연결 해제 시 필드 자체를 제거한다.
- GitHub 저장소·branch·기본 push path는 문서 레코드 필드가 아니라 `ai_settings`의 workspace 설정이다.
- GitHub pull cache와 마지막 pull 시각은 장치/일시 상태이므로 SQLite 안전 설정과 기준 백업의 공유 대상에서 제외한다.

SQLite 문서 정규화는 현재 기본 필드와 본문 SHA-256만 이관한다. `googleDocId`는 외부 계정 연결 식별자이므로 자동 공유하지 않고 새 PC에서 다시 연결하는 정책을 유지한다.

## 완료 판정

- 합성 두 DB fixture를 읽어 문서·폴더·파일 수와 본문 SHA-256이 고정된다.
- `googleDocId`가 실제 선택 필드로 기록되고 GitHub 설정과 구분된다.
- 민감 설정이 fixture와 SQLite 이관 batch에 포함되지 않는다.
- 기존 IndexedDB adapter와 SQLite adapter의 회귀 테스트가 함께 통과한다.
