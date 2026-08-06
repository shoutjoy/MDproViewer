# MD Viewer 로컬 SQLite 저장 전환 계획

작성일: 2026-08-06  
대상: `C:\CusorApps\md-viewerVscode\md_viewer`  
상태: Phase 7B-1 fmaviewer 저장 대상 분류·AI Jena 참고 세팅 SQLite 저장 완료

진행 현황:

- Phase 0: 코드 기준선·복구 스냅샷 완료, 실제 브라우저 IndexedDB 샘플 백업은 Phase 2 전 수행 예정
- Phase 1: SQLite 서버 코어 구현 및 자동·HTTP 검증 완료
- Phase 2A: 저장 파사드·세션 보호·서버 상태 UI 완료
- Phase 2B/3A: SQLite 문서·폴더 repository/API와 프런트 adapter CRUD 완료
- Phase 2C: `app.js` 핵심 CRUD·좌측 목록·폴더 작업·자동저장 호출을 저장 파사드에 연결
- Phase 3B: IndexedDB 복구 초안·pending operation·재연결 자동 재시도 완료
- Phase 3C: SQLite trigram FTS5 제목·본문 검색, 1~2글자 fallback, 검색 debounce 완료
- Hotfix 3C-1: 다른 origin/file 주소에서 SQLite 선택이 되돌아갈 때 현재 주소와 정상 로컬 앱 링크 표시
- Phase 3D: SQLite 문서 카드의 GitHub push 버튼과 SQLite 본문·폴더 읽기 연결 완료
- Phase 3E: 서버본·로컬 복구본 비교와 서버본 유지·로컬 새 버전·복구 문서 생성 선택 완료
- Phase 4A: IndexedDB 문서·폴더 정규화 batch와 SQLite 신규·중복·충돌·제외 미리보기 완료
- Phase 4B: 이관 전 online backup, checkpoint, idempotent 문서·폴더 실제 이관과 검증 완료
- Phase 4B-1: 설정의 `SQLite보기`에서 문서·폴더·버전·백업·이관 기록 읽기 전용 탐색 완료
- Phase 4C: `mdpro-indb-v1/files`를 `workspace_sources`·`file_entries`로 안전 이관하고 파일 탐색 연결 완료
- Phase 5: `ai_settings` 허용 목록, 비밀값 이중 차단, 범위 우선순위, SQLite 설정 API·복원·탐색 완료
- Phase 6A: SQLite online backup과 연결 자산을 manifest·checksum으로 묶은 `.mdpbackup` 생성·검증·다운로드 완료
- Phase 6B: 선택한 `.mdpbackup`을 격리 staging에서 검증하고 복원 데이터 수량을 미리보는 UI/API 완료
- Phase 6C: 검증된 staging만 현재 전체 백업 후 DB/assets로 교체하고 실패 시 자동 rollback하는 실제 복원 완료
- Phase 6A 선행 기반: 실행 중 DB를 단순 복사하지 않는 SQLite online backup 코어와 무결성 검증 완료
- `storageModeActivation=true`: 설정과 좌측 SQLite 탭에서 실제 저장 모드 전환 가능
- 완료 단계: Phase 7B-1 fmaviewer 저장 대상 분류와 AI Jena 참고 세팅 SQLite 저장·검색·불러오기
- 다음 단계: Phase 7B-2 AI Jena 사용자 포즈·마스크 다각형 preset SQLite 설정 컬렉션 adapter

## 1. 목표

- 현재 IndexedDB 저장 기능을 제거하지 않는다.
- 설정에서 `Sqlite 사용`을 켠 경우 문서·폴더·검색·비민감 설정의 기준 저장소를 로컬 SQLite로 전환한다.
- 브라우저는 SQLite 파일을 직접 열지 않고, MD Viewer와 함께 실행되는 로컬 서버의 제한된 API를 통해 저장한다.
- 앱이 다시 열리면 같은 SQLite 파일의 문서와 폴더를 좌측 사이드바에서 불러온다.
- 저장 중 장애와 강제 종료에 대비하여 IndexedDB를 초안·복구·재시도 큐로 유지한다.
- 다른 PC에서는 일관된 백업 파일을 가져와 복원하거나, 명시적으로 선택한 SQLite 데이터 파일을 단독으로 열 수 있게 한다.
- SQLite FTS5를 이용해 문서부터 시작하여 참고문헌·프롬프트·AI 대화까지 검색 범위를 확장한다.

## 2. 현재 코드에서 확인한 사실

- `index.html`에 `sqlite-enabled` 체크박스가 이미 있다.
- 체크 상태는 현재 `MarkdownProDB/ai_settings`의 `sqliteEnabled` 값으로만 저장되며 실제 저장 경로는 바뀌지 않는다.
- 메인 문서와 폴더는 `js/app.js` 및 `sidebar_left/sidebar-left.js`가 `MarkdownProDB`의 `documents`, `folders`를 직접 읽고 쓴다.
- `performAutoSave()`는 현재 열려 있는 IndexedDB 문서 본문을 직접 갱신한다.
- 별도의 가상 파일 백업인 `mdpro-indb-v1`, 파일 관리자 캐시인 `mdpro-fm-v3`, 문서 이력, 이미지, 참고문헌, AI Chat, GenSlide 등도 각각 IndexedDB를 사용한다.
- `run.py`는 정적 파일과 이미지 프록시만 제공하고 SQLite API는 없다. 현재 기본 소켓은 모든 네트워크 인터페이스에 바인딩된다.
- `sqliatemake/MDpro_SQLite_schema_v3.sql`에는 57개 논리 테이블, FTS5 가상 테이블 5개, 마이그레이션·백업·검색 구조가 이미 설계되어 있다.
- 제공된 빈 DB는 SQLite 3.53.1에서 `integrity_check=ok`, FTS 테이블 5개로 확인했다.
- 현재 Python 3.10.11의 내장 SQLite 3.40.1에서도 v3 스키마 전체를 메모리 DB에 생성하고 `integrity_check=ok`를 확인했다.
- `js/app.js`에는 같은 이름의 `saveToDB()` 구현이 두 번 있어, 저장소 분기 전에 최종 유효 구현을 파사드로 단일화해야 한다.

## 3. 확정할 저장 원칙

| 데이터 | SQLite 모드 | IndexedDB 모드/보조 역할 |
|---|---|---|
| 문서·폴더 | SQLite가 기준원장 | 기존 방식 유지 또는 마이그레이션 원본 |
| 편집 중 초안 | SQLite 확정 저장 전 임시 상태 | `mdpro-working-buffer`에 저장 |
| SQLite 실패 작업 | 서버 복구 후 재처리 | `pending_operations` 큐 |
| 문서 버전 | SQLite `document_versions` | 복구 초안과 별도 |
| 비민감 앱 설정 | SQLite `settings` | 부트스트랩/장애 폴백만 로컬에 유지 |
| 저장소 선택값 | `localStorage`에 `indb/sqlite` 부트스트랩 값 저장, SQLite에도 미러링 | 앱 시작 전에 읽을 수 있어야 함 |
| API 키·토큰·비밀번호 | SQLite 평문 저장 금지 | 초기 단계에서는 기존 저장 위치 유지, 이후 OS 자격 증명 저장소로 이관 |
| 이미지·첨부 대용량 원본 | 파일 시스템 | 임시 Blob과 복구 데이터만 IndexedDB |
| UI 접힘·창 크기·일시적 화면 상태 | 저장하지 않음 | `localStorage` 유지 |

중요: SQLite 서버가 끊겼을 때 기존 `documents` IndexedDB에 조용히 저장소를 바꾸면 같은 문서의 두 버전이 생긴다. 따라서 SQLite 모드에서는 초안과 작업 큐에만 보관하고, 화면에 `연결 끊김/동기화 대기` 상태를 표시한 뒤 서버가 돌아오면 버전 검사를 거쳐 재처리한다.

## 4. 권장 구조

```text
브라우저 UI
  -> MDPStorage 파사드
       -> IndexedDbAdapter       (기존 모드)
       -> SqliteApiAdapter       (SQLite 모드)
       -> RecoveryBuffer         (초안·pending operation)
  -> 동일 출처 로컬 HTTP API
       -> 요청 검증/크기 제한/로컬 접근 정책
       -> Repository + Transaction
       -> mdpro.sqlite (WAL)
       -> assets/
       -> backups/
```

예상 파일 배치:

```text
LocalSave_sqlite/
├── server/
│   ├── api.py
│   ├── database.py
│   ├── repositories.py
│   ├── migrations.py
│   └── backup.py
├── migrations/
│   └── 001_initial_v3.sql
├── data/                 # Git 제외
│   ├── mdpro.sqlite
│   ├── assets/
│   └── backups/
└── SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md

js/storage/
├── storage-service.js
├── indexeddb-adapter.js
├── sqlite-api-adapter.js
├── recovery-buffer.js
└── indexeddb-migration.js
```

초기 구현은 Python 표준 라이브러리의 `sqlite3`와 현재 `run.py`를 사용한다. 별도의 SQLite 프로그램 설치는 필수 조건으로 두지 않는다. 추후 Electron/Tauri 패키징 시에도 프런트 저장 파사드는 유지하고 전송 어댑터만 IPC로 교체할 수 있게 한다.

## 5. 로컬 API 범위

프런트엔드가 SQL 문자열이나 테이블 이름을 전달하지 않도록 업무 단위 API만 제공한다.

### 상태·초기화

- `GET /api/sqlite/health`: 서버, DB 경로, 스키마 버전, 읽기/쓰기 가능 여부
- `GET /api/sqlite/bootstrap`: 기본 프로필·워크스페이스·루트 폴더와 기능 상태
- `GET /api/sqlite/explorer?q=&limit=`: 본문을 제외한 문서·폴더·버전·백업·이관 checkpoint 읽기 전용 요약
- `GET /api/sqlite/explorer/files/{id}`: 선택한 SQLite file entry의 본문을 읽기 전용으로 조회
- `POST /api/sqlite/maintenance/integrity-check`: 무결성 검사

### 문서·폴더

- `GET /api/sqlite/documents?workspaceId=&folderId=&q=&limit=&cursor=`
- `GET /api/sqlite/documents/{id}`
- `POST /api/sqlite/documents`
- `PUT /api/sqlite/documents/{id}`: `expectedVersion`을 이용한 낙관적 잠금
- `DELETE /api/sqlite/documents/{id}`: 우선 soft delete
- `GET /api/sqlite/documents/{id}/versions`
- `POST /api/sqlite/documents/{id}/restore/{version}`
- `GET /api/sqlite/folders/tree`
- `POST /api/sqlite/folders`
- `PATCH /api/sqlite/folders/{id}`
- `DELETE /api/sqlite/folders/{id}`

### 설정·검색·이관·백업

- `GET/PUT /api/sqlite/settings`: 허용 목록에 포함된 비민감 설정만 처리
- `GET /api/sqlite/search?q=&types=&limit=`: 3글자 이상 FTS5, 짧은 검색어는 `LIKE` 폴백
- `POST /api/sqlite/migrations/indexeddb/preview`: 개수·중복·충돌 미리보기
- `POST /api/sqlite/migrations/indexeddb/apply`: idempotent batch 이관
- `POST /api/sqlite/backups`: SQLite online backup과 manifest 생성
- `GET /api/sqlite/backups/{id}/download`
- `POST /api/sqlite/restore/validate`
- `POST /api/sqlite/restore/apply`: 현재 DB 자동 백업 후 복원

공통 응답에는 `ok`, `data`, `error.code`, `error.message`, `requestId`를 사용하고, 쓰기 요청은 본문 크기 제한과 타입 검증을 적용한다.

## 6. 구현 단계와 체크리스트

### Phase 0. 기준선과 회귀 테스트 고정

- [x] 현재 IndexedDB 모드에서 문서 생성·열기·수정·이동·삭제·검색 동작을 기록한다.
- [x] 현재 `MarkdownProDB`, `mdpro-indb-v1`의 샘플 백업을 만든다.
- [x] 중복된 `saveToDB()` 중 실제 사용되는 최종 구현과 호출 경로를 확정한다.
- [x] 문서 레코드의 실제 선택 필드(`googleDocId`)와 문서 밖 설정으로 관리되는 GitHub 저장소·브랜치·경로를 구분해 기록한다.
- [x] 기존 테스트와 `node --check`, `python -m py_compile` 실행 기준을 정한다.
- [x] 이 단계에서 사용자 데이터 삭제나 IndexedDB 스키마 변경을 하지 않는다.

완료 조건: 기존 저장 흐름을 재현할 수 있고, 마이그레이션 전후 비교에 쓸 기준 데이터가 준비됨.

### Phase 1. SQLite 서버 코어

- [x] `run.py`를 정적 서버와 SQLite API를 함께 제공하는 구조로 분리한다.
- [x] 기본 바인딩을 `127.0.0.1`로 제한하고 LAN 공개는 별도 명시 옵션으로만 허용한다.
- [x] 실행 DB 경로를 절대 경로로 확정하고 허용 디렉터리 밖 경로를 거부한다.
- [x] `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`을 적용한다.
- [x] 스키마 checksum과 `schema_migrations`를 검증한다.
- [x] 최초 실행 시 기본 profile/workspace/root folder를 트랜잭션으로 만든다.
- [x] 서버에서 prepared statement만 사용하고 임의 SQL API는 만들지 않는다.
- [x] 쓰기 작업을 짧은 트랜잭션으로 직렬화한다.
- [x] health/bootstrap API와 구조화된 오류 응답을 구현한다.
- [x] 데이터 디렉터리와 실제 DB/백업 파일을 Git에서 제외한다.

완료 조건: 빈 PC 환경에서 `run.py` 한 번으로 서버와 DB가 시작되고, 재시작 뒤 같은 DB 및 스키마 버전을 읽음.

### Phase 2. 저장 파사드와 설정 전환

- [x] `MDPStorage` 인터페이스와 현재 활성 adapter 조회 기능을 정의한다.
- [x] 기존 IndexedDB 문서·폴더 CRUD를 `IndexedDbAdapter`로 감싸되 기존 앱 동작은 바꾸지 않는다.
- [x] `SqliteApiAdapter`의 health/bootstrap/session/integrity 및 문서·폴더 CRUD 호출을 구현한다.
- [x] `app.js`의 핵심 문서·폴더 CRUD 직접 호출을 저장 파사드 호출로 교체한다.
- [x] 저장소 선택 부트스트랩 값을 `localStorage`에 별도로 둔다.
- [x] `Sqlite 사용`을 켤 때 health와 server capability 검사 성공 후에만 활성화한다.
- [x] 활성화 실패 또는 미완성 capability이면 체크를 되돌리고 원인을 UI에 표시한다.
- [x] 같은 출처가 아닌 주소에서 연결 실패 시 현재 주소와 `127.0.0.1:8765` 로컬 앱 열기 링크를 표시한다.
- [x] 저장소 전환 시 좌측 목록을 새 어댑터로 다시 로드한다.
- [x] 좌측 탭에 `SQLite`를 추가하고 `inDB`, `SQLite`, `github`의 출처를 명확히 표시한다.
- [x] 설정 화면에 `서버 연결`, DB 상대 경로, schema, WAL, 현재 inDB 유지 상태를 표시한다.
- [x] 사이드바에 `연결됨`, `복구 버퍼 저장`, `동기화 대기`, `충돌` 상태를 표시한다.
- [x] 현재 SQLite 설치 다운로드 링크를 로컬 서버 상태·데이터 경로 UI로 교체한다.
- [x] 설정 하단 `SQLite보기`에서 문서·폴더·버전·백업·이관 기록을 읽기 전용으로 탐색한다.
- [x] SQLite 탐색 목록은 본문을 제외하고 문서를 선택했을 때만 단건 본문과 버전 기록을 읽는다.
- [x] 이관된 `workspace_sources`·`file_entries`를 파일 탭에 표시하고 선택한 파일 본문만 단건 조회한다.
- [x] 설정 화면에 백업·무결성 검사 실행 버튼을 연결한다.

완료 조건: 체크 해제 시 기존 IndexedDB가 그대로 동작하고, 체크 시 서버 연결 상태와 SQLite 빈 목록이 정확히 표시됨.

### Phase 3. 문서·폴더 CRUD, 자동저장, 검색

- [x] 문서 생성과 최초 버전을 하나의 트랜잭션으로 저장한다.
- [x] 문서 수정 시 `expectedVersion` 불일치를 충돌로 반환한다.
- [x] 폴더 생성·이름 변경·이동·삭제와 루트 보호를 구현한다.
- [x] 폴더 삭제 시 문서를 ROOT로 이동하고 하위 폴더를 재배치한다.
- [x] 기존 외부 호환 ID를 유지하면서 저장소·버전을 포함한 `currentDocumentRef`를 도입한다.
- [x] 입력 중 초안을 `mdpro-working-buffer/document_drafts`에 debounce 저장한다.
- [x] idle 또는 명시적 저장 때 SQLite에 확정하고 버전을 생성한다.
- [x] 서버 장애 시 pending operation에 넣고 자동 재시도한다.
- [x] 재시도 전 SQLite 버전·checksum을 비교한다.
- [x] 문서 제목·본문 검색을 FTS5로 연결한다.
- [x] 1~2글자 한글 검색은 `LIKE` 폴백, 결과 제한과 debounce를 적용한다.
- [x] 목록 조회에서는 문서 본문을 제외하고 문서 열기 때만 본문을 조회한다.
- [x] SQLite 문서 카드에서 기존 GitHub 설정과 push 확인 흐름을 사용해 Markdown을 전송한다.
- [x] version 충돌 시 서버본과 로컬 복구본을 비교하고 서버본 유지·로컬 새 버전·복구 문서 생성을 선택한다.

완료 조건: SQLite 모드에서 생성·열기·수정·이동·삭제·재시작 복원·검색이 동작하고, 서버 중단 중 입력한 내용도 복구 가능함.

### Phase 4. 기존 IndexedDB 데이터 이관

- [x] 브라우저가 IndexedDB를 읽어 정규화한 batch JSON만 서버로 보낸다.
- [x] `MarkdownProDB/documents`를 `documents`와 최초 `document_versions`로 이관한다.
- [x] `MarkdownProDB/folders`의 관계와 루트 폴더를 보존한다.
- [x] `mdpro-indb-v1/files`는 `workspace_sources`와 `file_entries`로 이관한다.
- [x] 이관 전에 SQLite online backup을 자동 생성한다.
- [x] preview 화면에서 원본 수, 신규, 중복, 충돌, 제외 수를 보여준다.
- [x] batch별 checkpoint를 저장하여 중단 후 재개할 수 있게 한다.
- [x] 동일 ID 재실행이 중복 레코드를 만들지 않게 한다.
- [x] 문서 본문 SHA-256, 레코드 수, 폴더 관계를 비교한다.
- [x] 성공 후에도 기존 IndexedDB를 자동 삭제하지 않고 이관 과정에서는 readonly 원본으로 다룬다.
- [x] 사용자가 별도로 확인하기 전에는 정리 버튼을 제공하지 않는다.

완료 조건: 샘플 및 실제 백업 데이터에서 문서 수·본문 checksum·폴더 관계가 일치하고 재실행도 안전함.

### Phase 5. 비민감 설정 이관

- [x] `ai_settings`의 키를 민감/비민감/일시 UI 상태로 분류한다.
- [x] 기능 표시, 편집 옵션, 사이트 목록, 양식 목록, 비밀이 아닌 연동 기본값만 `settings`에 저장한다.
- [x] GitHub 토큰, AI API Key, imgBB Key, Google Picker Key, 비밀번호·인증 해시는 SQLite 이관 대상에서 제외한다.
- [x] 설정 범위(global/profile/workspace/feature/document)의 우선순위를 구현한다.
- [x] SQLite online backup을 별도 DB 인스턴스로 열어 비민감 설정이 재현되는지 확인한다.
- [x] 비밀값 누락은 정상 상태로 안내하고 새 PC에서 다시 입력하게 한다.

구현 범위 메모: 현재 테마와 기본 AI 모델은 `ai_settings`가 아니라 `localStorage`의 별도 키로 관리된다. Phase 5는 계획의 기준 저장소인 `MarkdownProDB/ai_settings`를 대상으로 완료했으며, 장치 부트스트랩용 `localStorage` 값은 기존 로컬 동작을 유지한다.

완료 조건: 공유·복원된 DB에서 일반 설정은 유지되지만 비밀값은 평문으로 포함되지 않음.

### Phase 6. 다른 PC 공유, 백업, 복원

- [x] 열려 있는 DB 파일을 단순 복사하지 않고 SQLite online backup으로 일관된 사본을 만든다.
- [x] `manifest.json`, `mdpro.sqlite`, `assets/`, checksum을 묶은 `.mdpbackup` 형식을 구현한다.
- [x] 설정 화면에서 백업을 생성하고 검증 결과·포함 범위를 확인한 뒤 다운로드한다.
- [x] `.mdpbackup` 복원 파일 선택과 복원 미리보기 UI를 제공한다.
- [x] 복원 전 스키마 버전, SHA-256, `integrity_check`, `foreign_key_check`를 검사한다.
- [x] 복원 전에 현재 DB와 자산 전체의 자동 `.mdpbackup` 및 SQLite online backup을 만든다.
- [ ] 다른 PC에서 복원 후 문서·폴더·검색·설정·자산 경로를 검증한다.
- [x] 직접 DB 경로 열기는 서버 시작 옵션으로만 허용하고, 한 시점에 한 앱 인스턴스만 쓰도록 lock을 둔다.
- [x] OneDrive/NAS/공유 폴더의 SQLite 파일을 여러 PC가 동시에 쓰는 방식은 지원하지 않는다고 UI와 문서에 명시한다.
- [x] 실시간 다중 PC 사용이 필요해지면 별도의 상시 실행 호스트 서버, 인증, TLS, 사용자별 충돌 정책을 다음 단계로 분리한다.
완료 조건: PC A의 백업을 PC B에서 복원하여 같은 데이터를 검색·편집할 수 있고, 손상된 백업은 적용 전에 차단됨.

#### Phase 6A-1. 빠진 유지보수 UI와 단일 인스턴스 안전장치

- [x] 설정 화면의 백업 기능, integrity API, DB 경로 시작 옵션과 현재 서버 시작 흐름을 조사한다.
- [x] 작업 전 코드 스냅샷과 최근 전체 `.mdpbackup`·checksum을 복구 지점으로 기록한다.
- [x] 설정 화면에 세션 보호된 SQLite 무결성 검사 버튼과 integrity/FK 결과를 표시한다.
- [x] `MDPStorage`에서 무결성 검사를 명시적으로 호출하고 연결 실패·검사 실패를 복구 가능한 문구로 표시한다.
- [x] 같은 SQLite data root를 사용하는 두 번째 `run.py` 프로세스가 쓰기 서버로 시작하지 못하도록 OS file lock을 유지한다.
- [x] 직접 DB 경로는 `run.py` 시작 전 환경 옵션으로만 받고 브라우저 API/UI에서 임의 경로를 받지 않는다.
- [x] OneDrive/NAS/공유 폴더의 DB 동시 쓰기를 지원하지 않으며 다른 PC 공유는 `.mdpbackup`으로 수행한다고 UI·문서에 표시한다.
- [x] 실시간 다중 PC는 상시 호스트·인증·TLS·충돌 정책이 필요한 별도 후속 구조임을 문서화한다.
- [x] integrity UI/API, lock 획득·중복 차단·해제 후 재획득과 기존 SQLite 회귀 테스트를 통과한다.
- [x] 완료 코드 스냅샷·전체 `.mdpbackup`과 작업일지에 복구 방법을 기록한다.

Phase 6A-1 완료 조건: 사용자가 설정에서 현재 DB 무결성을 직접 검사할 수 있고, 동일 DB를 두 로컬 앱 프로세스가 동시에 쓰지 않으며, 공유 폴더 동시 쓰기 비지원 범위를 화면에서 확인할 수 있음.

### Phase 7. 기능별 데이터 확장

아래 항목은 문서 저장이 안정화된 뒤 하나씩 이관한다. 한 번에 전체 IndexedDB를 바꾸지 않는다.

#### Phase 7A. SQLite 작업파일 보관함과 fmaviewer 연결

- [x] FMA v3 ZIP, FMA(WebP 압축), FME 프로젝트, fmaviewer SaveDB의 현재 저장·불러오기 경로와 파일 형식을 조사한다.
- [x] 기존 파일 다운로드와 IndexedDB SaveDB를 제거하지 않고 SQLite 저장을 선택 기능으로 추가하는 호환 원칙을 확정한다.
- [x] 작업 전 코드 스냅샷과 전체 `.mdpbackup`을 생성하고 checksum·무결성을 기록한다.
- [x] 임의 경로를 받지 않는 범용 작업파일 repository를 구현한다.
- [x] 원본 파일은 `data/assets/workfiles/`에 checksum 기반으로 저장하고 SQLite `assets`·`workspace_sources`·`file_entries`에 검색용 메타데이터를 기록한다.
- [x] 동일 원본은 asset을 중복 저장하지 않고 각 저장 시점의 논리 file entry는 별도로 보존한다.
- [x] FMA ZIP의 manifest·경로·버전과 FME JSON의 format·version을 서버에서 검증하고 잘못된 파일을 저장 전에 차단한다.
- [x] 세션 보호된 작업파일 저장·목록·검색·단건 다운로드 API와 health capability를 구현한다.
- [x] fmaviewer에서 `SQLite에 FMA 저장`, `SQLite에 FMA(WebP) 저장`, `SQLite 작업파일 열기`를 제공한다.
- [x] 이미지 편집기에서 FME를 SQLite에 저장하고 목록에서 선택해 다시 불러온다.
- [x] 현재 fmaviewer 상태를 SQLite SaveDB 스냅샷으로 저장하고 FMA와 같은 검증 경로로 복구한다.
- [x] 파일명·파일 형식·앱 이름 검색과 원본 파일 다운로드를 제공한다.
- [x] FMA/FMA(WebP)/FME 원본 바이트와 checksum 왕복, 중복 asset, 검색, 잘못된 형식 차단을 자동 검증한다.
- [x] 생성된 작업파일이 기존 `.mdpbackup`의 `assets/`에 포함되고 복원 검증 대상이 되는지 확인한다.
- [x] 기존 FMA/FME 다운로드·열기와 IndexedDB SaveDB 회귀 테스트를 통과한다.
- [x] 구현 완료 코드 스냅샷·전체 `.mdpbackup`과 작업일지에 복구 방법을 기록한다.

Phase 7A 완료 조건: SQLite 모드에서 FMA 원본·FMA WebP 압축본·FME·SaveDB 스냅샷을 저장하고 이름/형식으로 검색해 원본 그대로 다시 열 수 있으며, 기존 다운로드와 IndexedDB 저장도 유지됨.

#### Phase 7A-1. 배경 제거 ONNX 모델 SQLite 저장

- [x] 현재 앱 폴더·원격 다운로드·수동 선택·IndexedDB 모델 저장과 ONNX 세션 연결 순서를 조사한다.
- [x] 176MB 모델을 Python 메모리에 한 번에 복사하지 않고 SQLite `asset_blobs`에 분할 저장하는 구조를 확정한다.
- [x] 작업 전 코드 스냅샷과 전체 `.mdpbackup`을 생성하고 checksum·무결성을 기록한다.
- [x] ONNX 모델을 고정 크기 chunk asset/blob으로 한 트랜잭션에 저장하고 전체 크기·SHA-256·순서를 `file_entries`에 기록한다.
- [x] 업로드 중단·크기 불일치·잘못된 확장자·최소/최대 크기를 차단하고 실패 시 부분 chunk를 남기지 않는다.
- [x] 기존 모델 교체 성공 후 이전 chunk를 같은 트랜잭션에서 정리한다.
- [x] 세션 보호된 모델 상태·업로드·SQLite BLOB 다운로드 API와 `modelAssets` capability를 구현한다.
- [x] SQLite 모드에서는 앱 폴더 다음으로 SQLite 모델을 먼저 확인하고, 없을 때 기존 IndexedDB·원격 다운로드 순서를 유지한다.
- [x] 자동 다운로드 또는 수동 선택 모델을 SQLite에 저장하고 다음 실행에서 SQLite 모델로 자동 연결한다.
- [x] SQLite 저장 실패 시 현재 실행과 기존 IndexedDB 저장 경로를 사용할 수 있게 폴백한다.
- [x] 설정 UI에 `SQLite 저장 모델` 상태·크기·checksum을 표시한다.
- [x] chunk 왕복 SHA-256·교체·중단 rollback·세션 차단·HTTP 다운로드를 자동 검증한다.
- [x] SQLite online backup과 `.mdpbackup` 내부 DB에 모델 BLOB이 포함되는지 검증한다.
- [x] 기존 앱 폴더·IndexedDB·원격·수동 선택과 ONNX 세션 캐시 회귀 테스트를 통과한다.
- [x] 구현 완료 코드 스냅샷·전체 `.mdpbackup`과 작업일지에 복구 방법을 기록한다.

Phase 7A-1 완료 조건: SQLite 모드에서 준비한 ONNX 모델 원본이 SQLite DB 내부에 저장되고, 앱 재실행 시 외부 재다운로드 없이 같은 SHA-256 모델을 불러오며 기존 경로도 폴백으로 유지됨.

#### Phase 7A-2. SQLite 탐색기 FMA 내용·경량 갤러리

- [x] 현재 SQLite 탐색기 파일 목록·상세 API와 저장된 FMA v3 manifest/media 구조를 조사한다.
- [x] 사용자 FMA 원본은 변경하지 않고 manifest와 제한된 썸네일만 읽는 원칙을 확정한다.
- [x] 작업 전 코드 스냅샷과 전체 `.mdpbackup`을 생성하고 checksum·무결성을 기록한다.
- [x] FMA 상세에서 갤러리 항목 수·고유 미디어 수·이미지·영상·기타와 MIME/확장자별 개수를 계산한다.
- [x] 이미지 항목은 최대 24개만 반환하고 원본 경로·바이트·본문 JSON은 응답에 노출하지 않는다.
- [x] Pillow 사용 가능 시 최대 240px WebP로 만들고, 미설치 시 브라우저 지원 이미지 중 2MB 이하만 제한 전송한다.
- [x] 생성 썸네일은 checksum별 재생성 가능한 cache에 두고 `.mdpbackup` 사용자 자산에는 포함하지 않는다.
- [x] 영상·미지원 이미지 형식은 원본 전체를 내려받지 않고 종류·파일명·크기 placeholder로 표시한다.
- [x] 세션 보호된 FMA summary·thumbnail API와 경로·ZIP entry·크기 제한을 구현한다.
- [x] 탐색기 파일 상세에서 종류별 요약 카드, MIME 분포, 경량 갤러리와 표시 개수 안내를 제공한다.
- [x] 일반 Markdown/텍스트 파일의 기존 `파일 내용` 표시를 유지한다.
- [x] FMA manifest 오류·누락 미디어·경로 이탈·지원하지 않는 파일은 안전한 안내로 처리한다.
- [x] 실제 저장된 FMA에서 summary와 썸네일 크기 제한·cache 재사용을 자동 검증한다.
- [x] SQLite explorer/API/storage service와 fmaviewer 저장 회귀 테스트를 통과한다.
- [x] 구현 완료 코드 스냅샷·전체 `.mdpbackup`과 작업일지에 복구 방법을 기록한다.

Phase 7A-2 완료 조건: SQLite 탐색기에서 FMA를 선택하면 파일 종류별 개수와 최대 24개의 경량 미리보기를 확인할 수 있고, 대용량 원본은 상세 화면 로딩에 사용하지 않음.

#### Phase 7A-3. 도구 설정 통합 보기와 암호화 API 키 보관함

- [x] ScholarAI, sspimgAI, AI Jena, imgBB와 공용 AI 공급자의 현재 키·모델·프롬프트 저장 위치를 조사한다.
- [x] API 키 원문과 사용자가 정한 보관함 비밀번호는 SQLite·서버·로그에 평문으로 저장하지 않는 원칙을 확정한다.
- [x] 작업 전 코드 스냅샷과 최근 전체 `.mdpbackup`·checksum을 복구 지점으로 기록한다.
- [x] PBKDF2-SHA256과 AES-GCM을 사용하는 브라우저 암호화 보관함을 구현한다.
- [x] SQLite에는 salt·반복 횟수·IV·ciphertext와 키별 설정 여부·끝 4자리만 저장한다.
- [x] 새 보관함 생성, 잠금 해제, 잠금, 비밀번호 변경과 잘못된 비밀번호 차단을 구현한다.
- [x] 잠금 해제된 키는 브라우저 메모리에서만 유지하고 ScholarAI·sspimgAI·AI Jena·imgBB의 키 조회 경로에 연결한다.
- [x] 도구별 활성 상태·공급자·모델·시스템 프롬프트·일반 옵션을 비민감 설정 카탈로그로 SQLite에 동기화한다.
- [x] SQLite 탐색기 설정 탭의 가운데 상세 화면에 도구별 설정 카드와 마스킹된 키 상태를 표시한다.
- [x] 암호문·metadata 형식, 크기, 허용 도구 ID를 서버에서 검증하고 임의 중첩 데이터와 평문 비밀값을 차단한다.
- [x] 암호화 왕복·오류 비밀번호·tamper·키 마스킹·검색·기존 도구 폴백 회귀 테스트를 통과한다.
- [x] 구현 완료 코드 스냅샷·전체 `.mdpbackup`과 작업일지에 복구 방법을 기록한다.

Phase 7A-3 완료 조건: SQLite 탐색기에서 주요 AI/이미지 도구의 모델·프롬프트·설정과 마스킹된 키 상태를 한 화면에서 확인하고, 사용자가 정한 비밀번호 없이는 SQLite에 저장된 API 키 원문을 복호화하거나 사용할 수 없음.

#### Phase 7A-4. SQLite 백업 내용 탐색과 복구 가능한 삭제

- [x] 현재 `backup_history` 목록, online backup 파일 경로와 탐색기 백업 탭 구조를 조사한다.
- [x] 현재 DB·임의 경로는 열거나 삭제하지 않고 `data/backups/`의 등록된 SQLite backup만 대상으로 하는 원칙을 확정한다.
- [x] 작업 전 코드 스냅샷과 현재 전체 `.mdpbackup`·checksum을 복구 지점으로 기록한다.
- [x] 백업 카드를 선택하면 무결성·schema·checksum·테이블별 개수와 문서·폴더·파일·설정 목록을 읽기 전용으로 표시한다.
- [x] 백업 DB는 SQLite readonly/immutable 연결로 열고 본문·설정값·암호문은 상세 응답에 포함하지 않는다.
- [x] 세션 보호된 백업 상세 조회와 삭제 API를 구현한다.
- [x] 삭제 전 backup ID 확인을 요구하고 파일은 `data/backups/trash/`로 원자 이동한 뒤 목록 record를 제거한다.
- [x] 경로 이탈·현재 DB·미등록 파일·이중 삭제·잘못된 확인값을 차단한다.
- [x] 탐색기 상세 화면에 내용 보기, 복구 가능 삭제 안내, 확인 대화상자와 삭제 후 목록 새로고침을 연결한다.
- [x] 상세 개수·비밀값 누락·세션 차단·trash 이동·목록 제거·회귀 테스트를 통과한다.
- [x] 구현 완료 스냅샷·전체 `.mdpbackup`과 작업일지에 복구 방법을 기록한다.

Phase 7A-4 완료 조건: 백업 카드를 눌러 저장 내용과 무결성을 확인할 수 있고, 명시적으로 확인한 백업만 관리 휴지통으로 이동하여 목록에서 제거하며 필요하면 파일을 수동 복구할 수 있음.

#### Phase 7B. 앱별 작업파일 형식 확장

##### Phase 7B-1. fmaviewer 저장 대상 분류와 AI Jena 참고 세팅

- [x] FMA/FME/SaveDB·레이어/텍스트/주석·AI Jena 참고 세팅·마스크 프리셋·내보내기 이력을 저장 성격별로 분류한다.
- [x] 형식·MIME·최대 크기·기존 불러오기 함수와 후속 저장 위치를 분류 문서에 기록한다.
- [x] 작업 전 코드 스냅샷과 현재 전체 `.mdpbackup`을 복구 기준점으로 기록한다.
- [x] `ai_jena_preset` JSON을 범용 작업파일 repository에서 엄격히 검증하고 checksum 기반으로 저장한다.
- [x] 기존 JSON/IndexedDB 기능을 유지하면서 AI Jena 패널에 SQLite 저장·목록·불러오기를 추가한다.
- [x] SQLite 작업파일 검색창에서 AI Jena 참고 세팅을 검색·적용·원본 다운로드할 수 있게 한다.
- [x] 유효/변조/과대 프리셋, 원본 바이트·checksum 왕복, 중복 asset, 백업 포함을 자동 검증한다.
- [x] 기존 FMA/FME/SaveDB·AI Jena JSON/IndexedDB 회귀 테스트를 통과한다.
- [x] 구현 완료 스냅샷·전체 `.mdpbackup`과 작업일지에 검증 결과와 복구 방법을 기록한다.

Phase 7B-1 완료 조건: AI Jena 참고 이미지 세팅을 SQLite에 원본 JSON으로 저장하고 이름으로 검색해 다시 적용할 수 있으며, 기존 JSON 파일과 IndexedDB 저장 방식도 그대로 사용할 수 있음.

- [x] fmaviewer의 설정 preset·레이어/주석·내보내기 이력을 작업파일 보관함 또는 전용 테이블로 분류한다.
- [x] MD Viewer 하위 앱별 생성 파일을 조사해 형식·MIME·최대 크기·불러오기 함수를 목록화한다.
- [ ] 범용 작업파일 API를 재사용해 앱별 저장·검색·불러오기 adapter를 단계별로 연결한다.
- [ ] 앱별 원본 파일과 SQLite 메타데이터 checksum·수량·백업 포함 여부를 검증한다.
- [x] GenSlide 상단의 inDB·MPP·PPTX·image export/import 결과를 SQLite에 저장하고 다시 가져온다.
- [x] 양식 저장·추가·Markdown export/import를 SQLite에 연결하고 SQLite 탐색기에서 내용을 확인한다.
- [x] Reference management의 저장된 인용 목록을 SQLite에 Markdown 원본으로 보내고 다시 가져온다.
- [x] Scholar Search의 Crossref 결과 창에 GitHub 버튼 오른쪽 SQLite 저장·가져오기 기능을 추가한다.
- [x] 참고문헌·인용·학술검색(Reference/Crossref Markdown 작업파일 범위)
- [ ] 하이라이트·태그
- [ ] AI 대화·메시지·출처
- [ ] 프롬프트·버전·실행 이력
- [ ] 이미지·첨부 메타데이터와 파일 자산
- [ ] History와 workspace snapshot
- [x] GenSlide 덱·슬라이드·자산(MPP/PPTX/PNG/이미지 ZIP 원본 범위)
- [ ] GitHub/WebDAV/Google Docs 동기화 메타데이터
- [ ] 문서·참고문헌·프롬프트·AI 메시지·하이라이트 통합검색

각 기능은 `기존 모드 회귀 테스트 -> SQLite adapter -> 데이터 이관 -> checksum/수량 검증 -> 기능별 활성화` 순서로 진행한다.

##### Phase 7B-2. 추가된 하위 앱 저장 요구사항 조사와 분리

- [x] GenSlide의 inDB 저장 구조, MPP JSON, PPTX와 image export/import 함수·MIME·크기 특성을 기록한다.
- [x] 양식의 기본/사용자 저장 위치, Markdown export/import와 문서 삽입 함수를 기록한다.
- [x] Reference management의 IndexedDB 레코드, MD/TXT import/export와 GitHub payload 구조를 기록한다.
- [x] Scholar Search Crossref의 Markdown 생성·편집·다운로드·현재 문서/GitHub 전달 경로를 기록한다.
- [x] 각 형식을 범용 작업파일과 전용 구조화 테이블 중 어디에 저장할지 결정하고 단계별 adapter 순서를 확정한다.
- [x] 조사 문서와 코드 위치가 실제 구현과 일치하는지 source contract 테스트로 고정한다.

Phase 7B-2 완료 조건: 새로 추가된 GenSlide·양식·Reference·Crossref 요구사항을 구현 전에 형식과 기존 호환 경로별로 분리하고, 다음 단계에서 한 기능씩 안전하게 연결할 수 있음.

##### Phase 7B-3. 양식·Reference·Crossref SQLite 연결

- [x] `templateCustomList`가 SQLite 모드의 안전 설정 미러링과 서버 `collections/workspace/array/4MB` 정책을 통과하는지 검증한다.
- [x] 양식 저장·편집·MD 가져오기가 기존 `setAiSettings`를 통해 SQLite에 반영되고 탐색기 설정 상세에서 내용을 표시하는 경로를 고정한다.
- [x] `scholar_references_md`와 `crossref_markdown` 작업파일 형식, UTF-8·`.md`·8MB 검증을 서버에 추가한다.
- [x] 공용 storage adapter에 세션 보호된 작업파일 저장·목록·다운로드를 연결한다.
- [x] Reference management에 SQLite 저장·가져오기 버튼을 추가하고 기존 inDB·MD/TXT·GitHub 기능을 유지한다.
- [x] Crossref 결과의 GitHub 버튼 오른쪽에 SQLite 저장·가져오기 버튼을 추가하고 편집된 Markdown을 원본 그대로 복원한다.
- [x] Markdown 원본 checksum·목록·다운로드·잘못된 UTF-8·과대 파일·전체 백업 포함을 자동 검증한다.
- [x] 완료 스냅샷·전체 `.mdpbackup`과 작업일지에 검증 결과와 복구 방법을 기록한다.

Phase 7B-3 완료 조건: 사용자 양식이 SQLite 설정에 유지되고 Reference/Crossref Markdown을 SQLite에서 저장·검색·다시 불러오며 기존 저장 경로도 그대로 동작함.

##### Phase 7B-4. Phase 0 기준선 고정과 GenSlide SQLite 연결

- [x] `INDEXEDDB_BASELINE.md`에 현재 문서·폴더 CRUD, 이동·삭제와 제목 검색 기준을 기록한다.
- [x] 비밀값과 사용자 데이터를 포함하지 않은 `MarkdownProDB`·`mdpro-indb-v1` 합성 백업 fixture를 만든다.
- [x] 합성 IndexedDB에서 문서 생성·열기·수정·이동·삭제·제목 검색을 재현하고 현재 본문 검색 비지원도 기준선으로 고정한다.
- [x] 작업 전 코드 스냅샷·전체 `.mdpbackup`·SQLite online backup과 SHA-256을 기록한다.
- [x] `genslide_mpp`, `genslide_pptx`, `genslide_png`, `genslide_image_zip` 작업파일 형식과 크기 제한을 서버에 추가한다.
- [x] MPP v2 JSON 구조·embedded image base64·PPTX/이미지 ZIP 안전 경로·PNG 서명과 크기를 서버에서 검증한다.
- [x] GenSlide 상단에 `SQLite 저장`, `SQLite 열기`, 명시적으로 켜는 `SQLite 자동` 버튼을 추가한다.
- [x] 현재 inDB 덱을 MPP v2로 SQLite에 저장하고, SQLite의 MPP를 기존 `importMpp` 경로로 다시 연다.
- [x] 기존 MPP/PPTX import와 MPP/PPTX/PNG/이미지 ZIP export 결과를 자동 저장 옵션에 연결한다.
- [x] 원본 checksum·목록·다운로드·복원·잘못된 형식 차단·전체 backup package 포함을 자동 검증한다.
- [x] 기존 IndexedDB·Reference/Crossref·설정·백업·FMA·ONNX 회귀 테스트와 실제 로컬 서버 무결성 검사를 통과한다.
- [x] 구현 완료 코드 스냅샷·전체 `.mdpbackup`과 작업일지에 최종 SHA-256·복구 방법을 기록한다.

Phase 7B-4 완료 조건: 기존 inDB와 파일 import/export를 유지하면서 GenSlide 덱 및 결과 파일을 SQLite에 선택 저장하거나 명시적 자동 저장하고 다시 열 수 있으며, Phase 0 IndexedDB 비교 기준과 완료 복구 지점이 고정됨.

##### Phase 7C. 남은 구조화 데이터 단계(후속)

- [ ] 하이라이트·태그 전용 구조와 문서 위치 재연결 정책을 설계한다.
- [ ] AI 대화·메시지·출처 및 프롬프트·버전·실행 이력의 비밀값 제외 정책을 설계한다.
- [ ] 메인 문서 이미지·첨부 자산과 History/workspace snapshot의 중복 제거·보존 정책을 설계한다.
- [ ] GitHub/WebDAV/Google Docs 동기화 메타데이터의 토큰 제외 schema와 충돌 정책을 설계한다.
- [ ] 문서·참고문헌·프롬프트·AI 메시지·하이라이트 통합검색을 단계별 FTS 인덱스로 구현한다.

Phase 7C의 항목은 범용 작업파일 연결과 별개의 전용 schema·보안·이관 작업이므로, 완료 근거 없이 상위 목록을 일괄 체크하지 않는다.

## 7. 보안·안정성 체크리스트

- [x] 기본 서버는 loopback에서만 접근 가능하다.
- [x] API는 loopback 요청과 실행 시 생성된 세션 토큰을 검증한다.
- [x] 임의 파일 경로, `..`, UNC 경로, 허용 루트 밖 경로를 거부한다.
- [x] 프런트엔드가 임의 SQL을 실행할 수 없다.
- [x] 모든 SQL 값은 parameter binding을 사용한다.
- [x] JSON 요청 본문과 문서 본문 크기 제한을 둔다.
- [ ] 오류 응답에 DB 절대 경로, SQL, 비밀값을 노출하지 않는다.
- [ ] 서버 로그에서 문서 본문과 API Key를 마스킹한다.
- [x] SQLite 설정 쓰기·이관 경로에는 토큰·비밀번호·API Key를 평문 저장하지 않는다.
- [x] 백업 파일에 포함되는 데이터 범위를 다운로드 전에 표시한다.
- [ ] DB 잠금, 디스크 부족, 읽기 전용, 스키마 불일치 오류를 각각 구분한다.
- [ ] WAL checkpoint 및 백업 중 쓰기 경합을 테스트한다.

## 8. 검증 시나리오

### 기존 기능 회귀

- [x] SQLite 체크 해제 상태에서 기존 inDB 문서 CRUD가 이전과 동일하다.
- [ ] `mdpro-indb-v1` 백업, GitHub, WebDAV 흐름이 깨지지 않는다.
- [x] 기존 자동저장과 복구 데이터가 삭제되지 않는다.

### SQLite 정상 동작

- [ ] 문서 1개/1,000개/10,000개 목록과 검색 성능을 측정한다.
- [ ] 한글 제목, 한글 본문, 이모지, 긴 Markdown을 왕복 저장해 내용이 동일하다.
- [x] 앱 재시작 후 마지막 DB와 목록이 복원된다.
- [x] 폴더 이동·삭제 후 FK 위반이 없다.
- [x] 수동 저장마다 예상한 문서 버전이 생성된다.

### 장애·충돌

- [x] 편집 중 서버를 종료해도 초안이 IndexedDB에 남는다.
- [x] 서버 재시작 후 pending operation이 한 번만 적용된다.
- [x] 서로 다른 버전의 저장 요청은 자동 덮어쓰기하지 않는다.
- [x] 충돌 상태에서 서버본과 로컬 복구본을 비교한 뒤 선택한 방식으로만 복구 큐를 정리한다.
- [ ] DB 잠금과 디스크 부족 시 사용자에게 복구 가능한 안내가 나온다.
- [x] 강제 종료 후 SQLite와 초안 중 최신 내용을 비교할 수 있다.

### 이관·백업·공유

- [x] 이관 전후 문서 수와 본문 SHA-256이 일치한다.
- [x] 이관을 두 번 실행해도 중복이 없다.
- [ ] 백업을 다른 PC에서 복원하고 검색할 수 있다.
- [x] 손상된 DB, 잘못된 checksum, 지원하지 않는 미래 스키마를 복원 미리보기 단계에서 차단한다.
- [x] 복원 교체 중 강제 오류를 주입해 기존 DB·자산 자동 rollback과 무결성을 검증한다.

## 9. 단계별 중단 기준

다음 조건이 생기면 다음 Phase로 넘어가지 않는다.

- 기존 IndexedDB 회귀 테스트가 실패함
- `integrity_check`가 `ok`가 아님
- `foreign_key_check` 결과가 존재함
- 문서 checksum 또는 레코드 수가 원본과 다름
- SQLite 연결 실패 때 초안이 보존되지 않음
- 비밀값이 SQLite나 로그에 평문으로 발견됨
- 백업 복원 실패가 기존 DB를 변경함

## 10. 권장 진행 순서

1. Phase 0 기준선과 테스트 고정
2. Phase 1 로컬 SQLite 서버 코어
3. Phase 2 저장 파사드 및 설정 전환
4. Phase 3 문서·폴더·검색 완성
5. 실제 데이터 사본으로 검토
6. Phase 4 선택형 IndexedDB 이관
7. Phase 5 비민감 설정 이관
8. Phase 6 백업·다른 PC 복원
9. 안정화 후 Phase 7 기능별 확장

첫 구현 범위는 Phase 0~3으로 제한하는 것이 적절하다. 이 범위가 통과하기 전에는 참고문헌, AI Chat, 이미지, GenSlide 데이터를 동시에 이관하지 않는다.

## 11. 구현 시작 전 확인할 정책 1건

다른 PC 공유의 1차 의미는 다음으로 정한다.

> PC A에서 일관된 `.mdpbackup`을 만들고 PC B에서 복원하여 사용하는 휴대형 공유. 동시에 두 PC가 같은 SQLite 파일에 쓰지는 않는다.

동일 DB를 여러 PC에서 동시에 편집하는 기능은 로컬 SQLite 파일 공유가 아니라 인증된 중앙 호스트 서버 기능으로 별도 설계해야 한다.
