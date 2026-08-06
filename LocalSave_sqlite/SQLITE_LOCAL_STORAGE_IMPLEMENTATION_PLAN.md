# MD Viewer 로컬 SQLite 저장 전환 계획

작성일: 2026-08-06  
대상: `C:\CusorApps\md-viewerVscode\md_viewer`  
상태: Phase 6B `.mdpbackup` 파일 선택·격리 staging·복원 미리보기 완료

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
- Phase 6A 선행 기반: 실행 중 DB를 단순 복사하지 않는 SQLite online backup 코어와 무결성 검증 완료
- `storageModeActivation=true`: 설정과 좌측 SQLite 탭에서 실제 저장 모드 전환 가능
- 다음 단계: Phase 6C 복원 전 현재 DB 자동 backup·원자적 DB/assets 교체·실패 rollback 구현

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

- [ ] 현재 IndexedDB 모드에서 문서 생성·열기·수정·이동·삭제·검색 동작을 기록한다.
- [ ] 현재 `MarkdownProDB`, `mdpro-indb-v1`의 샘플 백업을 만든다.
- [x] 중복된 `saveToDB()` 중 실제 사용되는 최종 구현과 호출 경로를 확정한다.
- [ ] 문서 레코드의 실제 선택 필드(`googleDocId`, GitHub 메타데이터 등)를 샘플로 수집한다.
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
- [ ] 설정 화면에 백업·무결성 검사 실행 버튼을 연결한다.

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
- [ ] 복원 전에 현재 데이터의 자동 백업을 만든다.
- [ ] 다른 PC에서 복원 후 문서·폴더·검색·설정·자산 경로를 검증한다.
- [ ] 직접 DB 경로 열기는 서버 시작 옵션으로만 허용하고, 한 시점에 한 앱 인스턴스만 쓰도록 lock을 둔다.
- [ ] OneDrive/NAS/공유 폴더의 SQLite 파일을 여러 PC가 동시에 쓰는 방식은 지원하지 않는다고 UI와 문서에 명시한다.
- [ ] 실시간 다중 PC 사용이 필요해지면 별도의 상시 실행 호스트 서버, 인증, TLS, 사용자별 충돌 정책을 다음 단계로 분리한다.
- [ ] FMA , FMA(webp)저장이 가능하게 하고 불러오기도 되게 조절 

완료 조건: PC A의 백업을 PC B에서 복원하여 같은 데이터를 검색·편집할 수 있고, 손상된 백업은 적용 전에 차단됨.

### Phase 7. 기능별 데이터 확장

아래 항목은 문서 저장이 안정화된 뒤 하나씩 이관한다. 한 번에 전체 IndexedDB를 바꾸지 않는다.

- [ ] 참고문헌·인용·학술검색
- [ ] 하이라이트·태그
- [ ] AI 대화·메시지·출처
- [ ] 프롬프트·버전·실행 이력
- [ ] 이미지·첨부 메타데이터와 파일 자산
- [ ] History와 workspace snapshot
- [ ] GenSlide 덱·슬라이드·자산
- [ ] GitHub/WebDAV/Google Docs 동기화 메타데이터
- [ ] 문서·참고문헌·프롬프트·AI 메시지·하이라이트 통합검색

각 기능은 `기존 모드 회귀 테스트 -> SQLite adapter -> 데이터 이관 -> checksum/수량 검증 -> 기능별 활성화` 순서로 진행한다.

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
- [ ] 복원 실패 시 기존 DB가 그대로 유지된다.

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
