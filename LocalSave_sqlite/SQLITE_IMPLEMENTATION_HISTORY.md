# MD Viewer SQLite 구현 작업일지

계획서: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`  
원칙: 작업 단위를 작게 유지하고, 각 단위마다 변경 파일·검증·오류·복구 방법을 기록한다.

## 상태 표기

- `계획`: 아직 수정하지 않음
- `진행`: 구현 또는 검증 중
- `완료`: 체크리스트와 검증을 모두 통과함
- `보류`: 선행 조건 때문에 다음 단계로 미룸
- `복구`: 문제가 발생해 이전 상태로 되돌림

---

## 2026-08-06 01:37 KST — 작업 001 — Phase 0 기준선과 복구 지점

상태: 완료

### 작업 전 상태

- Git 기준 커밋: `2acc70dbda7aee2072623b95bebae2e0ec99b1b0`
- 작업 전 Git 상태: SQLite 계획서와 Python bytecode만 untracked, 기존 추적 파일 수정 없음
- Node.js: `v24.12.0`
- Python: `3.10.11`
- Python 내장 SQLite: `3.40.1`
- 제공 SQLite CLI: `3.53.1`

### 기준 파일 SHA-256

| 파일 | SHA-256 |
|---|---|
| `run.py` | `38E21A3DD5D7A8DAAAB411B707C518F54E87464A5221D7CD903F5FBA34E314FA` |
| `js/app.js` | `32BBB6D3384C49AC1B76DE918BA16C8979698576C63F86A350104322DB0F6CED` |
| `sidebar_left/sidebar-left.js` | `4348BB6E9D8C8C0BD7FEC8D75B5C35730D3475B7F6F71839487C8AACA362B014` |
| `index.html` | `3D54B708B4FE6BB97D8857A72A94E5766889BDF34A7554E9A7798BEB9A8C2E9B` |
| `.gitignore` | `CB35C11D63DF61BB65B96370BEBCA162E3711FCCCF6B3968A57749317C5ADC76` |

### 복구 지점

- 경로: `backup/sqlite_phase0_20260806_0137`
- 포함: `run.py`, `.gitignore`, `index.html`, `js/app.js`, `sidebar_left/sidebar-left.js`, `Setting/settings-ui.js`
- `backup/`은 기존 `.gitignore` 대상이므로 실행 데이터와 함께 Git에 포함되지 않는다.

### 코드 조사 결과

- `saveToDB()`는 `js/app.js:3023`과 `js/app.js:11678`에 중복 정의되어 있다.
- 브라우저에서는 뒤쪽 정의가 최종 유효 함수이며 `js/app.js:11790`에서 `window.saveToDB`로 노출된다.
- `index.html:208`의 저장 버튼이 이 전역 함수를 호출한다.
- 중복 함수 제거는 Phase 2 저장 파사드 전환 때 별도 검증 후 수행한다.

### 실행한 검증

- `node --check js/app.js`: 통과
- `node --check sidebar_left/sidebar-left.js`: 통과
- `node --check Setting/settings-ui.js`: 통과
- `scripts/test-markdown-bold.js`: 통과
- `scripts/test-mermaid-label-sanitizer.js`: 통과
- `scripts/test-scholarref-apa-format.js`: 통과
- `scripts/test-academic-search-crossref.js`: 통과
- `python -m py_compile run.py`: 통과
- SQLite v3 스키마를 Python SQLite 3.40.1 메모리 DB에 적용: 통과
- 제공 빈 DB `PRAGMA integrity_check`: `ok`

### 오류 및 대응

- PowerShell 안에서 Python SQL 문자열을 직접 실행할 때 따옴표 파싱 오류가 두 번 발생했다.
- 파일이나 코드 변경 전의 진단 명령에서만 발생했으며 데이터 변경은 없었다.
- SQL CLI 및 단순화한 Python 명령으로 다시 검증하여 정상 통과했다.

### 복구 방법

Phase 1 이후 문제가 생기면 수정 파일을 위 복구 지점의 같은 상대 경로 파일로 되돌린다. 새로 추가한 `LocalSave_sqlite/server`, `LocalSave_sqlite/data`, `LocalSave_sqlite/migrations`는 별도 데이터 백업 여부를 확인한 후 제거해야 한다. 사용자 데이터가 만들어진 뒤에는 DB를 먼저 백업하지 않고 삭제하지 않는다.

### 다음 작업

- Phase 1 SQLite 서버 코어 구현
- 기본 loopback 바인딩, DB 경로 제한, 스키마 초기화, health/bootstrap/integrity API

---

## 2026-08-06 01:49 KST — 작업 002 — Phase 1 SQLite 서버 코어

상태: 완료

### 구현 범위

- `run.py` 정적 서버에 제한된 SQLite API router 연결
- 기본 바인딩을 `127.0.0.1`로 변경
- 요청별 thread 처리 및 API의 loopback 접근 제한
- `MD_VIEWER_HOST`, `MD_VIEWER_PORT`, `MD_VIEWER_NO_BROWSER` 실행 옵션 추가
- SQLite 데이터 루트와 DB 경로 정규화 및 허용 루트 이탈 차단
- runtime migration SHA-256 검증
- v3 스키마 적용과 `schema_migrations` 버전 확인
- 기본 profile, workspace, ROOT folder 생성
- WAL, foreign key, busy timeout 등 연결 PRAGMA 적용
- health, bootstrap, integrity-check API 구현
- 임시 DB 기반 반복 초기화·경로 차단 smoke test 추가

### 추가·변경 파일

- 변경: `run.py`
- 변경: `.gitignore`
- 추가: `LocalSave_sqlite/server/__init__.py`
- 추가: `LocalSave_sqlite/server/database.py`
- 추가: `LocalSave_sqlite/server/api.py`
- 추가: `LocalSave_sqlite/migrations/001_initial_v3.sql`
- 추가: `LocalSave_sqlite/migrations/manifest.json`
- 추가: `LocalSave_sqlite/migrations/README.md`
- 추가: `scripts/test-sqlite-server.py`

### 생성되는 실행 데이터

- 기본 DB: `LocalSave_sqlite/data/mdpro.sqlite`
- WAL 운용 중에는 같은 폴더에 `mdpro.sqlite-wal`, `mdpro.sqlite-shm`이 일시적으로 존재할 수 있다.
- `LocalSave_sqlite/data/`는 Git 제외 대상이다.
- 이번 HTTP 검증으로 기본 profile/workspace/root folder만 포함된 로컬 DB가 생성되었다. 사용자 문서는 아직 저장하지 않았다.

### 발견한 오류와 수정

1. 설계 패키지 checksum 불일치
   - 증상: `validation_manifest.json`의 checksum과 실제 `MDpro_SQLite_schema_v3.sql` SHA-256이 달라 초기화가 차단됨
   - 실제 SHA-256: `153246a6e96484c7c99e8e2bd7d9ac8ea9cae0e662a957383432a11128a8203a`
   - 대응: 설계 패키지는 원본 보존하고 `migrations/001_initial_v3.sql` 실행 사본과 별도 runtime manifest를 생성
   - 결과: 실행 migration의 실제 바이트 checksum을 시작 전에 검증

2. 초기화 후 health 조회 재귀
   - 증상: `initialize -> health -> connection -> initialize` 반복으로 `RecursionError`
   - 원인: 이미 초기화된 connection context도 무조건 `initialize()`를 호출함
   - 대응: `_initialized`가 false일 때만 초기화하도록 수정
   - 결과: 최초 초기화와 반복 초기화 모두 통과

두 오류 모두 임시 테스트 DB에서 발생했으며 사용자 데이터 쓰기 전 차단되었다.

### 자동 검증 결과

- Python 4개 파일 `py_compile`: 통과
- 신규 `scripts/test-sqlite-server.py`: 통과
- 임시 DB 최초 초기화: 통과
- 같은 DB 반복 초기화: 통과
- data root 밖 DB 경로 거부: 통과
- 기본 profile/workspace/root folder: 통과
- WAL/foreign key 설정: 통과
- `PRAGMA integrity_check`: `ok`
- `PRAGMA foreign_key_check`: 위반 없음

### 실제 HTTP 검증 결과

테스트 서버: `127.0.0.1:8876`, 브라우저 자동 실행 비활성화

- `GET /api/sqlite/health`: HTTP 성공, schema v3, WAL, DB 경로 정상
- `GET /api/sqlite/bootstrap`: `workspace_default`, `root` 확인
- `POST /api/sqlite/maintenance/integrity-check`: `ok=true`
- 검증 후 테스트 서버 프로세스 종료 확인

### 현재 API 제한

- 아직 문서·폴더 CRUD API는 없다.
- `Sqlite 사용` 체크박스와 API는 아직 연결하지 않았다.
- IndexedDB 동작은 변경하지 않았다.
- 실행 세션 토큰 검증은 Phase 2 프런트 연결 전 추가한다. 현재 API는 loopback 요청만 허용한다.

### 복구 방법

1. 서버를 종료한다.
2. `run.py`와 `.gitignore`는 `backup/sqlite_phase0_20260806_0137`의 파일로 복원한다.
3. 새 server/migrations/test 파일은 Git diff를 확인한 뒤 되돌린다.
4. `LocalSave_sqlite/data/mdpro.sqlite`는 삭제하지 말고 별도 폴더로 이동해 보존한다.
5. 기존 IndexedDB에는 변경이 없으므로 앱은 Phase 0과 같은 inDB 방식으로 계속 사용할 수 있다.

Phase 1 완료 상태 자체로 되돌릴 수 있는 추가 스냅샷은 `backup/sqlite_phase1_20260806_0155`에 저장했다. Phase 2 작업 중 문제가 생기면 이 스냅샷을 기준으로 복원한다.

### 다음 작업

- Phase 2 저장 파사드의 인터페이스와 IndexedDB adapter 작성
- SQLite 체크 활성화 전 health 검사와 부트스트랩 저장소 선택값 구현
- 프런트 연결 전에 실행 세션 토큰을 추가하여 loopback의 다른 웹 페이지가 API를 호출하지 못하도록 보강

---

## 2026-08-06 02:06 KST — 작업 003 — Phase 2A 저장 파사드와 안전한 설정 연결

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_phase1_20260806_0155`
- DB online backup: `backup/sqlite_phase2_start_20260806_0205/mdpro.sqlite`
- DB backup SHA-256: `193CAD850F0D618EC0DD97C4ECD2A965EA84C6E5DDD9CDFBE4A51A2F4750FBD2`

### 실제 구현된 기능

1. 저장 파사드 기반
   - `MDPStorage`가 현재 저장 모드, 선호 모드, SQLite 상태, 마지막 오류를 관리한다.
   - `mdpro_storage_mode_v1`을 IndexedDB보다 먼저 읽을 수 있는 bootstrap key로 사용한다.
   - 현재 활성 adapter를 조회할 수 있으며 초기 기본값은 기존 `indb`이다.

2. IndexedDB adapter
   - 기존 `documents`, `folders` store의 목록·조회·저장·삭제를 adapter로 감쌌다.
   - 기존 `app.js`의 직접 호출은 아직 바꾸지 않아 현재 inDB 기능에 영향을 주지 않는다.

3. SQLite API adapter
   - health, bootstrap, session, integrity-check 호출을 구현했다.
   - 서버 연결 실패와 HTTP/API 오류를 구분한다.
   - 쓰기 요청은 서버가 발급한 메모리 session token을 header로 전달한다.

4. 서버 세션 보호와 capability
   - `GET /api/sqlite/session`을 추가했다.
   - POST 요청은 `X-MDViewer-Session`이 없거나 다르면 403으로 거부한다.
   - health 응답에 기능별 capability를 포함한다.
   - 문서·폴더 API가 아직 없으므로 `storageModeActivation=false`로 명시한다.

5. 설정 화면
   - SQLite 프로그램 다운로드 링크를 제거했다. Python 로컬 서버가 SQLite를 내장 사용하므로 별도 설치가 필요하지 않다.
   - 서버 연결 여부, DB 상대 경로, schema 버전, WAL 상태를 표시한다.
   - 서버가 연결됐더라도 문서 CRUD capability가 없으면 `Sqlite 사용` 체크를 자동 해제한다.
   - 이 경우 `현재 문서는 계속 inDB에 저장됩니다`라고 명시한다.

### 추가·변경 파일

- 변경: `LocalSave_sqlite/server/api.py`
- 추가: `js/storage/indexeddb-adapter.js`
- 추가: `js/storage/sqlite-api-adapter.js`
- 추가: `js/storage/storage-service.js`
- 변경: `Setting/settings-ui.js`
- 변경: `index.html`
- 변경: `js/app.js`
- 추가: `scripts/test-storage-service.js`

### 발견한 오류와 수정

1. 실제 브라우저에서 SQLite 서버가 연결 안 됨으로 표시
   - Node 모의 테스트와 HTTP API는 정상인데 브라우저 UI만 연결 실패
   - 원인: `window.fetch`를 adapter 객체의 method처럼 호출하여 브라우저 호출 context가 달라짐
   - 수정: fetch 함수를 `window`에 bind한 뒤 호출
   - 재발 방지: 자동 테스트에서 fetch의 `this`가 window인지 검증
   - 수정 후 브라우저에서 `DB: LocalSave_sqlite/data/mdpro.sqlite · schema v3 · WAL` 표시 확인

2. 외부 브라우저 제어의 checkbox locator timeout
   - 자동 체크 동작은 실행되어 UI 문구와 체크 해제 상태가 DOM snapshot에 반영됨
   - 애플리케이션 오류나 데이터 변경은 없었으며 브라우저 제어 응답 지연으로 판단
   - 동일 locator 반복 대신 새 DOM snapshot으로 최종 상태를 확인함

### 자동·HTTP 검증 결과

- 신규 저장 파사드 테스트: 통과
- fetch window binding 검사: 통과
- session token header 검사: 통과
- SQLite server core 테스트: 통과
- JS/Python 구문 검사: 통과
- token 없는 POST: HTTP 403
- token이 있는 integrity POST: `ok=true`
- health capability `storageModeActivation=false`: 확인

### 실제 브라우저 검증 결과

- 설정 모달 정상 열림
- SQLite 상태 패널 표시 확인
- 로컬 DB 경로, schema v3, WAL 표시 확인
- `Sqlite 사용` 체크 시 미완성 기능 활성화 차단 확인
- 체크 자동 해제 및 `현재 문서는 계속 inDB에 저장됩니다` 문구 확인
- 브라우저 console error: 없음

### 현재 데이터 영향

- SQLite에는 기본 profile/workspace/root folder만 있다.
- 사용자 문서·폴더는 SQLite로 이동하거나 복사하지 않았다.
- 기존 IndexedDB 문서 저장·자동저장 동작은 그대로다.
- 따라서 현재 단계에서 체크박스를 눌러도 데이터가 두 저장소로 분기되지 않는다.

### 복구 방법

1. 앱과 `run.py` 서버를 종료한다.
2. Phase 2 코드 변경은 `backup/sqlite_phase1_20260806_0155`를 기준으로 되돌린다.
3. DB 복원이 필요하면 현재 DB를 먼저 다른 이름으로 보존한 뒤 `backup/sqlite_phase2_start_20260806_0205/mdpro.sqlite`를 사용한다.
4. IndexedDB는 이번 단계에서 변경하지 않았으므로 별도 복원이 필요하지 않다.

Phase 2A 완료 상태 스냅샷:

- 경로: `backup/sqlite_phase2a_20260806_0210`
- DB SHA-256: `B0960EDB10C96FBCC584A9D6C99B2D260421355B0DCAAA28D6AFC95F97084F72`
- 다음 작업 중 문제가 생기면 이 스냅샷을 기준으로 Phase 2A 완료 상태로 복원한다.

### 동시 작업 감지

최종 Git 상태 확인 중 이번 SQLite 작업에서 수정하지 않은 다음 파일의 변경이 새로 나타났다.

- `ShareSites/sitesshow/sitesshow-settings.html`
- `ShareSites/sitesshow/sitesshow.js`
- `js/GithubData/github-app.js`
- `js/internal-image-app.js`

다른 작업 또는 사용자 변경으로 간주하여 내용을 수정·복구·스냅샷하지 않았다. 이후 SQLite 작업에서도 이 파일들은 겹치지 않는 한 그대로 보존한다.

### 다음 작업

- 문서·폴더 SQLite CRUD repository와 API 구현
- SQLite adapter에 문서·폴더 메서드 추가
- CRUD 자동 테스트 통과 후에만 `storageModeActivation=true`로 변경
- 그다음 좌측 사이드바와 저장 버튼을 `MDPStorage`로 전환

---

## 2026-08-06 02:30 KST — 작업 004 — Phase 2B/3A SQLite 문서·폴더 CRUD

상태: 완료

### 작업 전 복구 지점

- 코드 및 DB: `backup/sqlite_phase2a_20260806_0210`
- 작업 시작 시 실제 DB에는 기본 profile/workspace/ROOT folder만 존재했다.
- 실제 사용자 문서 CRUD 검증은 운영 DB가 아닌 임시 SQLite DB에서만 수행했다.

### 실제 구현된 기능

1. SQLite repository와 트랜잭션
   - 문서 목록·상세·생성·수정·soft delete를 구현했다.
   - 문서 생성과 최초 버전 생성을 하나의 `BEGIN IMMEDIATE` 트랜잭션으로 처리한다.
   - 수정과 삭제는 `expectedVersion`을 필수로 받아 오래된 쓰기를 HTTP 409 `VERSION_CONFLICT`로 차단한다.
   - 문서 버전 목록과 과거 버전을 새 버전으로 복원하는 기능을 구현했다.
   - 문서 목록 응답에서는 본문을 제외하고 상세 조회에서만 본문을 반환한다.

2. 폴더 관리
   - 폴더 목록·상세·생성·이름 변경·이동·삭제를 구현했다.
   - ROOT folder의 수정·삭제를 차단한다.
   - 자신 또는 자신의 하위 폴더로 이동하는 순환 구조를 차단한다.
   - 폴더 삭제 시 포함 문서를 ROOT로 이동하고, 직계 하위 폴더를 삭제 대상의 상위 폴더로 재배치한다.
   - 폴더 이동으로 문서 메타데이터가 바뀌면 문서 version도 올려 오래된 편집 요청을 차단한다.

3. 제한된 HTTP API
   - `GET/POST /api/sqlite/documents`
   - `GET/PUT/DELETE /api/sqlite/documents/{id}`
   - `GET /api/sqlite/documents/{id}/versions`
   - `POST /api/sqlite/documents/{id}/restore/{version}`
   - `GET /api/sqlite/folders/tree`
   - `POST /api/sqlite/folders`
   - `GET/PATCH/DELETE /api/sqlite/folders/{id}`
   - 모든 변경 요청은 실행 세션 token이 필요하며, JSON 타입과 본문 크기를 검증한다.

4. 프런트 저장 adapter
   - `SqliteApiAdapter`에 위 문서·폴더 CRUD 및 버전 복원 호출을 추가했다.
   - `MDPStorage`에서 현재 활성 adapter의 문서·폴더 CRUD를 호출할 수 있게 했다.
   - 문서 버전 목록·복원도 저장 파사드에 노출하고, 409 오류의 `currentVersion`과 `requestId`를 프런트 오류 객체에 보존한다.
   - 기존 IndexedDB adapter에도 동일한 create/update 별칭을 추가했다.
   - health capability에 `documents`, `documentVersions`, `folders` 준비 상태를 표시한다.

5. 설정 상태 표시
   - 브라우저 설정 화면에 `문서 API 준비됨 · 앱 전환 연결 중`을 표시한다.
   - DB 상대 경로, schema v3, WAL, 현재 문서가 inDB에 저장된다는 문구를 함께 표시한다.
   - `storageModeActivation=false`는 유지했다. `app.js`와 좌측 사이드바의 직접 IndexedDB 호출 전환 전에는 사용자가 SQLite 모드를 켤 수 없다.

### 추가·변경 파일

- 변경: `LocalSave_sqlite/server/database.py`
- 추가: `LocalSave_sqlite/server/repositories.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `run.py`
- 변경: `js/storage/indexeddb-adapter.js`
- 변경: `js/storage/sqlite-api-adapter.js`
- 변경: `js/storage/storage-service.js`
- 변경: `Setting/settings-ui.js`
- 변경: `index.html`
- 변경: `scripts/test-sqlite-server.py`
- 추가: `scripts/test-sqlite-http-api.py`
- 변경: `scripts/test-storage-service.js`

### 자동·HTTP 검증 결과

- Python 구문 검사: 통과
- repository 임시 DB CRUD/버전/충돌 검사: 통과
- HTTP API 전체 CRUD 검사: 통과
- token 없는 변경 요청 HTTP 403: 통과
- 오래된 `expectedVersion` 요청 HTTP 409 및 현재 버전 반환: 통과
- 폴더 삭제 후 문서 ROOT 이동과 version 증가: 통과
- 문서 soft delete: 통과
- `PRAGMA integrity_check`: `ok`
- `PRAGMA foreign_key_check`: 위반 없음
- 프런트 adapter 요청 경로·method·session header 검사: 통과
- 실제 브라우저 설정 상태 표시: 통과
- 브라우저 console error: 없음

### 현재 데이터 영향

- 모든 문서·폴더 CRUD 시나리오는 자동 삭제되는 임시 DB에서 실행했다.
- 실제 `LocalSave_sqlite/data/mdpro.sqlite`에는 사용자 문서를 추가하지 않았다.
- 기존 IndexedDB 데이터와 저장 흐름은 수정하지 않았다.
- SQLite 체크박스는 계속 안전 잠금 상태이므로 저장소가 의도치 않게 분기되지 않는다.

### 복구 방법

1. 앱과 `run.py` 서버를 종료한다.
2. Phase 2B 코드 변경은 `backup/sqlite_phase2a_20260806_0210`을 기준으로 되돌린다.
3. 실제 DB는 삭제하지 말고 먼저 별도 이름으로 보존한다.
4. 이번 단계 완료 스냅샷 `backup/sqlite_phase2b_20260806_0230`을 사용하면 CRUD API 구현 완료 상태로 복구할 수 있다.

Phase 2B 완료 DB online backup SHA-256:

- `14A0F73EB4AE0F6E93BDC9E3AD165D097C6F49CEF579F3D17F6D9BCD05AD8D36`

### 동시 작업 감지

SQLite 작업 범위 밖의 다음 변경을 발견했으며 수정·복구·스냅샷하지 않았다.

- `ShareSites/sitesshow/sitesshow-settings.html`
- `ShareSites/sitesshow/sitesshow.js`
- `js/GithubData/github-app.js`
- `js/internal-image-app.js`
- `sidebar_left/sidebar-left.js`
- `Apps/fmaviewer/css/styles.css`
- `Apps/fmaviewer/index.html`
- `Apps/fmaviewer/js/gallery/preview.js`
- `Apps/fmaviewer/js/integrations/mdViewerBridge.js`
- `Apps/fmaviewer/tests/md-viewer-bridge.test.cjs`
- `imageDB/image_insert.js`

### 다음 작업

- `app.js`의 문서 생성·열기·수정·삭제 호출을 `MDPStorage`로 전환
- 좌측 사이드바의 문서·폴더 목록과 폴더 작업을 `MDPStorage`로 전환
- SQLite 탭과 저장 연결 상태 UI 추가
- inDB 회귀 및 SQLite 임시 데이터 브라우저 검증 후에만 `storageModeActivation=true`로 변경

---

## 2026-08-06 03:13 KST — 작업 005 — Phase 2C 앱·사이드바 저장 파사드 연결

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_phase2c_start_20260806_0303`
- DB online backup SHA-256: `14A0F73EB4AE0F6E93BDC9E3AD165D097C6F49CEF579F3D17F6D9BCD05AD8D36`
- 겹쳐 있던 GitHub/FMA 최신 변경을 포함한 상태 그대로 보관한 후 SQLite 연결 작업을 시작했다.

### 실제 구현된 기능

1. 저장소 중립 문서 참조
   - 기존 외부 코드 호환용 `currentDbDocId`는 유지했다.
   - 내부에는 문서 ID, 저장소 종류, SQLite version을 가진 `currentDocumentRef`를 추가했다.
   - 새 파일·외부 파일 전환·삭제 시 참조를 함께 초기화한다.

2. 앱 문서 CRUD 연결
   - 최종 `saveToDB()`가 활성 adapter의 목록·상세·생성·수정을 사용한다.
   - 중복 제목 덮어쓰기와 번호가 붙은 새 문서 저장 동작을 기존과 동일하게 유지한다.
   - 문서 열기·삭제·폴더 이동을 `MDPStorage`로 전환했다.
   - SQLite 수정·삭제에는 현재 version을 `expectedVersion`으로 전달한다.
   - 중복되어 있던 이전 `saveToDB()` 구현을 제거해 최종 저장 경로를 하나로 만들었다.

3. 폴더와 목록 연결
   - 폴더 생성·삭제와 폴더 내 문서 ROOT 이동을 활성 adapter를 통해 처리한다.
   - SQLite에서는 서버의 단일 트랜잭션 폴더 삭제 정책을 사용한다.
   - 좌측 목록은 `MDPStorage.listFolders/listDocuments` 결과를 공통 renderer에 전달한다.
   - SQLite 목록도 동일한 열기·이동·삭제 UI를 사용할 수 있다.

4. 좌측 저장소 출처 UI
   - 좌측에 `inDB`, `SQLite`, `github` 탭을 표시한다.
   - SQLite 탭은 서버의 문서·폴더 capability가 준비되면 표시된다.
   - 저장소 전환 시 목록과 설정 checkbox 상태가 함께 갱신된다.
   - SQLite 문서에서 기존 inDB 전용 GitHub push 버튼이 나타나지 않게 분리했다.

5. 자동저장 연결 준비
   - 열린 저장 문서 자동저장이 활성 adapter의 get/update 경로를 사용한다.
   - SQLite에서는 `currentDocumentRef.version`을 사용해 오래된 자동저장을 덮어쓰지 않는다.
   - 충돌과 서버 실패는 현재 console 경고로 남긴다.
   - IndexedDB 복구 초안과 pending operation이 아직 없으므로 실제 SQLite 활성화는 계속 차단한다.

### 발견한 문제와 수정

1. SQLite 탭이 DOM에는 있지만 보이지 않음
   - 원인: 실제 확장 상태의 사이드바와 `isSidebarCollapsed=true` 초기 상태가 서로 달랐다.
   - 수정: 초기 상태를 실제 DOM과 같은 `false`로 맞추고 health 갱신 때 탭 표시도 다시 계산한다.
   - 실제 브라우저에서 세 탭과 ROOT 목록 표시를 확인했다.

2. GitHub/FMA 동시 변경과 겹치는 파일
   - `sidebar-left.js`의 GitHub 링크 동작과 `index.html`의 FMA import cache version은 기존 최신 내용을 유지했다.
   - SQLite 관련 탭·cache version 부분만 좁게 수정했다.

### 자동·브라우저 검증 결과

- `node --check` 대상 앱·사이드바·GitHub·설정·storage 파일: 통과
- 저장 파사드 모의 SQLite 활성화·목록 route 검사: 통과
- SQLite HTTP CRUD 테스트: 통과
- 기존 Markdown 회귀 테스트 4종: 통과
- 실제 브라우저에서 `inDB / SQLite / github`, ROOT 목록 표시: 통과
- SQLite 탭 선택 시 capability 잠금 안내 후 inDB 활성 상태 유지: 통과
- 활성 adapter를 통한 inDB 임시 문서 생성·목록 표시·삭제: 통과
- 검증용 `Codex Phase2C Temp 20260806` 문서는 삭제 완료

### 현재 데이터 영향

- 실제 SQLite DB에는 사용자 문서를 쓰지 않았다.
- 브라우저 inDB에 만든 임시 검증 문서는 같은 검증에서 삭제했다.
- 기존 사용자 문서와 별도 기능 store는 변경하지 않았다.
- SQLite `storageModeActivation=false`를 유지해 자동저장 복구 준비 전에 실사용 저장소로 전환되지 않는다.

### 복구 방법

1. 앱과 `run.py` 서버를 종료한다.
2. 이번 단계 이전으로 복원할 때 `backup/sqlite_phase2c_start_20260806_0303`의 같은 상대 경로 파일을 사용한다.
3. SQLite DB는 삭제하지 말고 현재 파일을 별도 보존한 뒤 스냅샷의 online backup을 복원한다.
4. 이번 단계 완료 스냅샷은 최종 검증 후 `backup/sqlite_phase2c_20260806_0313`에 생성한다.

Phase 2C 완료 스냅샷 생성 결과:

- 경로: `backup/sqlite_phase2c_20260806_0313`
- DB online backup SHA-256: `D5BA8859AB259DAA0737751A205A45F919E283C1CBD3BD1D0F11B8442FF3FB8E`

### 다음 작업

- `js/storage/recovery-buffer.js`에 IndexedDB 문서 초안과 pending operation 저장 구현
- SQLite 자동저장 실패·재연결·version 충돌 상태 UI 구현
- 복구·재시도 자동 테스트와 서버 중단 브라우저 검증
- 위 검증 후에만 `storageModeActivation=true`로 변경

---

## 2026-08-06 04:02 KST — 작업 006 — Phase 3B 복구 버퍼·재연결 자동 동기화

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_phase3b_start_20260806_0344`
- DB online backup SHA-256: `D5BA8859AB259DAA0737751A205A45F919E283C1CBD3BD1D0F11B8442FF3FB8E`

### 실제 구현된 기능

1. 별도 IndexedDB 복구 DB
   - `mdpro-working-buffer` DB를 추가했다.
   - `document_drafts`에 문서 ID, 제목, 본문, 기준 version, SHA-256, cursor, scroll, 저장 시각을 보관한다.
   - `pending_operations`에 실패한 UPDATE, expectedVersion, 최신 payload, 오류와 재시도 횟수를 보관한다.
   - 같은 문서 UPDATE는 하나의 operation ID로 합쳐 최신 본문만 재시도한다.
   - 한 번도 SQLite에 생성하지 않은 새 문서도 `unsaved_current` 초안으로 보존한다.

2. 안전한 SQLite 자동저장
   - 편집 input에 debounce 자동저장 호출을 연결했다.
   - SQLite 쓰기 전에 복구 초안을 먼저 확정한다.
   - SQLite 저장 성공 후에만 해당 초안과 대기 작업을 제거한다.
   - 복구 버퍼 저장 자체가 실패하면 SQLite 쓰기를 시도하지 않는다.
   - 자동저장 Promise를 직렬화해 같은 문서 version 요청이 겹치지 않게 했다.

3. 서버 중단·재연결
   - 서버 연결 실패 시 최신 UPDATE를 pending operation으로 기록한다.
   - SQLite 모드에서는 5초 간격과 브라우저 online 이벤트에 재시도한다.
   - 재시도 전에 서버 document version과 local expectedVersion을 비교한다.
   - 서버 checksum이 이미 pending 내용과 같으면 중복 UPDATE 없이 완료 처리한다.
   - version이 다르고 checksum도 다르면 `conflict`로 남겨 자동 덮어쓰지 않는다.

4. 서버 재시작 세션 복구
   - `run.py` 재시작으로 session token이 바뀐 경우 첫 변경 요청의 403을 감지한다.
   - 새 session token을 한 번 발급받아 동일 요청을 한 번만 재시도한다.
   - 반복 403은 일반 오류로 반환해 무한 재시도를 막는다.

5. 사용자 상태 표시와 복구
   - 사이드바에 `SQLite 연결됨`, `복구 버퍼 저장됨`, `동기화 대기 N건`, `재동기화 중`, `충돌`, `SQLite 저장 완료`를 표시한다.
   - 설정 화면에 복구 버퍼 준비 상태와 pending 수를 표시한다.
   - 저장 문서를 다시 열 때 서버 본문과 다른 복구 초안이 있으면 기존 복구 모달을 표시한다.
   - 저장 전 새 문서 초안도 다음 실행에서 복구 모달로 불러올 수 있다.

6. 실제 SQLite 모드 활성화
   - 서버 capability `storageModeActivation=true`로 변경했다.
   - 서버 capability와 브라우저 복구 버퍼가 모두 준비된 경우에만 SQLite 모드가 켜진다.
   - 설정 checkbox와 좌측 SQLite 탭에서 실제 저장 모드 전환이 가능하다.

### 발견한 문제와 수정

1. 편집 input에서 자동저장 예약 누락
   - 기존 input handler는 preview와 목차만 갱신하고 `schedulePerformAutoSave`를 호출하지 않았다.
   - debounce 자동저장 예약을 추가해 실제 타이핑이 복구 버퍼와 SQLite 저장으로 이어지게 했다.

2. 서버 재시작 후 이전 session token 사용
   - GET health는 성공하지만 PUT이 403으로 계속 실패할 수 있었다.
   - 변경 요청의 첫 403에서만 session을 갱신하고 재시도하도록 수정했다.

3. 저장 전 새 문서에는 document ID가 없음
   - `currentDocumentRef`가 없는 내용도 `unsaved_current` 초안으로 저장하도록 보완했다.

### 자동 검증 결과

- recovery buffer·storage service JS 구문 검사: 통과
- pending UPDATE 정상 재처리와 version 증가: 통과
- server version 불일치 시 conflict 유지: 통과
- 동일 checksum 중복 적용 방지 경로: 구현 확인
- 서버 재시작 session token 갱신과 1회 재시도: 통과
- 저장 전 초안 생성·조회·제거: 통과
- SQLite HTTP 전체 CRUD 테스트: 통과
- 기존 Markdown 회귀 테스트 4종: 통과

### 실제 브라우저 서버 중단 검증

운영 DB 대신 `C:\Tmp\mdviewer-sqlite-phase3b-20260806-0344`의 임시 DB를 사용했다.

1. SQLite 모드 활성화와 복구 버퍼 준비 표시: 통과
2. SQLite 임시 문서 생성: version 1
3. `run.py` 서버 종료 후 본문 편집: `복구 버퍼 저장됨` 확인
4. 연결 실패 후 `동기화 대기 1건` 확인
5. 같은 DB로 서버 재시작: session 자동 갱신
6. 5초 이내 `SQLite 저장 완료` 확인
7. DB 직접 확인: 오프라인 편집 본문 일치, version 2
8. `integrity_check=ok`, FK 위반 0건
9. 임시 문서 UI 삭제 후 임시 DB 디렉터리 전체 정리
10. 브라우저 console error: 없음

브라우저 테스트 종료 정리 호출이 브라우저 확장 응답 지연으로 두 번 시간 초과됐지만 앱·DB 검증에는 영향이 없었다. 테스트 서버와 임시 DB는 별도로 정상 종료·삭제했다.

### 현재 데이터 영향

- 실제 `LocalSave_sqlite/data/mdpro.sqlite`에는 테스트 문서를 기록하지 않았다.
- 기존 IndexedDB 문서와 기능별 store는 변경하지 않았다.
- 임시 브라우저 origin의 테스트 문서와 pending operation은 정상 처리·삭제했다.
- 실제 앱에서는 사용자가 명시적으로 SQLite checkbox 또는 탭을 선택한 뒤부터 SQLite가 기준 저장소가 된다.

### 동시 작업 보존

SQLite 작업 외에 추가로 감지된 다음 변경은 수정하거나 스냅샷에 포함하지 않았다.

- `Apps/fmaviewer/js/image/backgroundRemove.js`
- `Apps/fmaviewer/tests/background-remove-onnx.test.cjs`
- `imageDB/image-gallery.html`

### 다음 작업

- SQLite FTS5 문서 제목·본문 검색 API와 짧은 한글 LIKE fallback
- 충돌 문서 비교·선택 UI
- 기존 IndexedDB 문서·폴더 이관 preview와 idempotent batch 적용

### Phase 3B 완료 복구 지점

- 경로: `backup/sqlite_phase3b_20260806_0402`
- DB online backup SHA-256: `D5BA8859AB259DAA0737751A205A45F919E283C1CBD3BD1D0F11B8442FF3FB8E`

---

## 2026-08-06 05:02 KST — 작업 007 — Phase 3C SQLite 문서 검색

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_phase3c_start_20260806_0451`
- DB online backup SHA-256: `D5BA8859AB259DAA0737751A205A45F919E283C1CBD3BD1D0F11B8442FF3FB8E`
- 실제 DB에는 활성 문서 0건, FTS row 0건으로 확인했다.

### 실제 구현된 기능

1. 검색 전용 repository와 API
   - `StorageRepository.search_documents()`를 추가했다.
   - `GET /api/sqlite/search?q=&types=document&folderId=&limit=`를 추가했다.
   - 검색 결과는 목록용 메타데이터만 반환하며 전체 문서 본문은 반환하지 않는다.
   - 결과에 `matchSource`와 짧은 `snippet`을 포함하고 최대 200건으로 제한한다.
   - 서버 capability `search=true`를 활성화했다.

2. FTS5 제목·본문 검색
   - 3글자 이상 검색어는 기존 `document_fts`의 trigram tokenizer와 `MATCH`를 사용한다.
   - 제목 일치를 본문 일치보다 우선하도록 `bm25` 가중치를 적용했다.
   - 생성·수정·soft delete 트리거 뒤 검색 색인이 함께 갱신되는지 테스트했다.
   - 사용자 검색어는 SQL parameter binding으로 전달하고 FTS phrase로 이스케이프한다.

3. 짧은 한글 검색 fallback
   - 1~2글자 검색어는 제목과 본문에 escaped `LIKE`를 적용한다.
   - `%`, `_`, 역슬래시를 wildcard가 아닌 일반 문자로 취급한다.
   - 짧은 검색에서도 제목 일치 결과를 먼저 반환한다.

4. 프런트 저장 파사드와 사이드바
   - `SqliteApiAdapter.searchDocuments()`와 `MDPStorage.searchDocuments()`를 추가했다.
   - 기존 IndexedDB adapter의 검색은 기존 동작과 동일하게 제목만 필터링한다.
   - SQLite 모드 검색 시 전용 `/search` API를 호출하고, 빈 검색은 기존 문서 목록 API를 사용한다.
   - 본문에서만 일치한 문서가 사이드바 제목 필터에 의해 다시 제거되지 않도록 서버 필터 완료 상태를 전달한다.
   - 검색 입력은 250ms debounce 후 목록을 갱신한다.

### 자동 검증 결과

- Python repository 생성·수정·삭제 FTS 동기화: 통과
- 한글 제목 FTS 검색: 통과
- 제목에 없는 한글 본문 FTS 검색: 통과
- 한 글자 한글 `LIKE` fallback: 통과
- 검색 결과 limit와 본문 비노출: 통과
- HTTP `/search`와 `search=true` capability: 통과
- SQLite adapter URL encoding과 저장 파사드 라우팅: 통과
- SQLite 본문 일치 결과 유지와 기존 inDB 제목 전용 필터 분기 단위 테스트: 통과
- Python 구문 검사와 JavaScript 5개 파일 구문 검사: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과
- 실제 DB `integrity_check=ok`, FK 위반 0건, 활성 문서 0건, FTS row 0건

### 임시 서버 검증과 브라우저 검증 제한

- `C:\Tmp\mdviewer-sqlite-phase3c-20260806-0451`의 임시 DB에 제목에는 없고 본문에만 `본문전용키워드`가 있는 문서를 생성했다.
- 실제 HTTP 검색 결과는 1건, `matchSource=content`, `strategy=fts5`로 확인했다.
- Edge 브라우저 확장이 탭 목록과 로컬 앱 로딩 요청에 응답하지 않았고 내장 브라우저도 제공되지 않아 이번 작업에서는 사이드바 화면 자동화까지 완료하지 못했다.
- 이는 테스트 실패로 숨기지 않고 제한 사항으로 기록하며, 실제 API·repository·adapter 자동 검증 결과와 분리한다.
- 사이드바 단위 테스트의 첫 실행은 최소 DOM stub에 `document.addEventListener`가 없어 실패했으며, 테스트 harness만 보완한 뒤 같은 구현을 다시 검증해 통과했다.
- 임시 서버와 임시 DB는 검증 후 종료·삭제하며 운영 DB에는 테스트 문서를 쓰지 않는다.

### 복구 방법

검색 단계만 되돌릴 때 다음 파일을 `backup/sqlite_phase3c_start_20260806_0451`의 동일 상대 경로에서 복원한다.

- `LocalSave_sqlite/server/repositories.py`
- `LocalSave_sqlite/server/api.py`
- `js/storage/indexeddb-adapter.js`
- `js/storage/sqlite-api-adapter.js`
- `js/storage/storage-service.js`
- `js/app.js`
- `sidebar_left/sidebar-left.js`
- `scripts/test-sqlite-server.py`
- `scripts/test-sqlite-http-api.py`
- `scripts/test-storage-service.js`

운영 DB 복구가 필요하면 시작 스냅샷의 `LocalSave_sqlite/data/mdpro.sqlite`를 사용한다. 이번 단계에서는 운영 DB 내용이 변경되지 않았다.

### 다음 작업

- version 충돌 시 서버 본문과 복구 초안을 비교하고 사용자가 선택할 수 있는 UI
- 기존 IndexedDB 문서·폴더 이관 preview와 idempotent batch 적용
- 브라우저 연결이 정상인 환경에서 본문 검색 결과와 250ms debounce 화면 검증

### Phase 3C 완료 복구 지점

- 경로: `backup/sqlite_phase3c_20260806_0502`
- DB online backup SHA-256: `D5BA8859AB259DAA0737751A205A45F919E283C1CBD3BD1D0F11B8442FF3FB8E`

---

## 2026-08-06 05:36 KST — 작업 008 — SQLite 선택 실패 주소 진단 보완

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_phase3d_origin_fix_start_20260806_0535`
- DB online backup SHA-256: `CC1C58D0311C821E7003B7154FB4A02953AA298A368C2392990EDF379EFD171F`

### 증상과 진단

- 설정의 `Sqlite 사용`을 선택하면 체크가 바로 해제되고 `SQLite 서버 연결 실패`가 표시됐다.
- 체크 해제는 연결되지 않은 SQLite를 기준 저장소로 잘못 표시하지 않기 위한 기존 안전 동작이다.
- 진단 시작 시 `127.0.0.1:8765/api/sqlite/health`는 schema v3, `storageModeActivation=true`, `search=true`로 정상이었다.
- 서버가 정상인데 브라우저 fetch가 실패하는 경우는 앱이 `file://`, Live Server, 원격/PWA 등 SQLite API와 다른 origin에서 열린 상황이 우선 원인이다.
- 열린 MDproViewer 주소를 읽기 전용으로 확인하려 했으나 Windows 앱 접근 승인이 시간 초과되어 실제 주소는 수집하지 못했다.
- 최종 live 검사 때 기존 `run.py` 프로세스가 종료된 것도 발견되어 새 백그라운드 서버로 다시 실행했다.

### 실제 수정

1. 주소별 오류 구분
   - `file://`, localhost의 다른 포트, 원격 origin을 구분하는 진단 정보를 추가했다.
   - 같은 출처가 아니면 상태를 `로컬 SQLite 앱 주소가 아님`으로 표시한다.
   - 세부 정보에 현재 앱 주소와 필요한 로컬 주소를 함께 표시한다.

2. 안전한 로컬 앱 진입
   - 연결 실패 패널에 `로컬 앱 열기` 링크를 추가했다.
   - 링크는 `http://127.0.0.1:8765/`를 새 탭으로 열어 현재 편집 화면을 강제로 이동시키지 않는다.
   - health 연결이 성공하면 링크를 다시 숨긴다.
   - 임의 origin에 SQLite 쓰기 CORS를 허용하지 않고 기존 same-origin·session 보호를 유지했다.

3. 캐시 갱신
   - `Setting/settings-ui.js`의 script version을 `20260806-sqlite-origin-fix-1`로 변경했다.

### 검증

- `settings-ui.js` 구문 검사: 통과
- `file://`, `127.0.0.1:5500`, `127.0.0.1:8765` 주소 판별 단위 테스트: 통과
- SQLite repository·HTTP API·storage service 테스트: 통과
- 재실행한 서버 PID `34052`, health available: 통과
- live capability: schema v3, activation=true, search=true
- 운영 DB 문서와 IndexedDB 데이터는 변경하지 않았다.

### 복구 방법

- UI 수정 복구: `backup/sqlite_phase3d_origin_fix_start_20260806_0535/Setting/settings-ui.js`
- cache version 복구: 같은 스냅샷의 `index.html`
- DB 복구가 필요하면 같은 스냅샷의 online backup을 별도 보존 후 사용한다. 이번 수정은 DB를 변경하지 않았다.

### 완료 복구 지점

- 경로: `backup/sqlite_phase3d_origin_fix_20260806_0536`
- DB online backup SHA-256: `E78A82D27008FA8646A69E95F7EFB300B00A911B7B1F87D605CABD56F966A0DB`

---

## 2026-08-06 06:10 KST — 작업 009 — SQLite 문서 GitHub push 버튼

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_github_push_start_20260806_0607`
- DB online backup SHA-256: `0FF9176F9DB159FD303309A47ABBD91E9B6FADAAFDD94C5229F933A5562EC2D8`

### 원인

- 사이드바 GitHub 버튼은 `storageMode === 'indb'`일 때만 생성됐다.
- `pushDocToGithub()`가 `db.transaction()`으로 IndexedDB 문서와 폴더를 직접 읽어 SQLite 문서 ID를 처리할 수 없었다.
- 현재 문서 내보내기에서도 SQLite 출처가 전달되지 않아 같은 문제가 발생할 수 있었다.

### 실제 구현

1. SQLite 문서 카드 버튼
   - GitHub 설정이 활성화되어 있으면 SQLite 문서 카드에도 `github` 버튼을 표시한다.
   - 버튼에 문서 ID와 `sqlite` 저장소 출처를 함께 전달한다.
   - inDB 문서의 기존 버튼과 동작은 유지한다.

2. 저장소별 문서 읽기
   - `getGithubPushSource(docId, storageMode)`를 추가했다.
   - SQLite는 `MDPStorage.getDocument()`와 `MDPStorage.listFolders()`로 본문과 폴더를 읽는다.
   - inDB는 기존 IndexedDB readonly transaction을 유지한다.
   - SQLite가 비활성 상태로 바뀐 뒤 stale 버튼을 누르면 전송하지 않고 오류를 표시한다.

3. 기존 GitHub 업로드 흐름 재사용
   - 저장소에서 문서를 읽은 다음에는 기존 폴더 선택, 원격 경로 확인, SHA 조회, PUT, 로컬 GitHub cache 갱신 흐름을 그대로 사용한다.
   - 현재 열린 SQLite 문서를 GitHub로 내보낼 때도 `currentDocumentRef.storageMode`를 전달한다.
   - 실제 GitHub 원격 저장소에는 자동 테스트 데이터를 전송하지 않았다.

4. 캐시 갱신
   - `app.js`, `sidebar-left.js`, `github-app.js` script version을 `20260806-sqlite-github-push-1`로 변경했다.

### 검증

- JavaScript 변경 파일 구문 검사: 통과
- SQLite 문서 본문과 폴더 읽기 단위 테스트: 통과
- SQLite 비활성 전환 뒤 push 차단 테스트: 통과
- SQLite 문서 카드 `github` 버튼과 `sqlite` 인자 렌더링 테스트: 통과
- storage service, SQLite repository, HTTP API 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과
- 첫 사이드바 테스트의 한글 정규식은 Windows 콘솔 인코딩으로 실패했으며 영문 속성 검증으로 교체 후 통과했다. 앱 코드는 변경하지 않았다.

### 복구 방법

- `backup/sqlite_github_push_start_20260806_0607`에서 다음 파일을 같은 상대 경로로 복원한다.
  - `js/GithubData/github-app.js`
  - `js/app.js`
  - `sidebar_left/sidebar-left.js`
  - `index.html`
- 이번 작업은 운영 SQLite DB와 IndexedDB 문서를 변경하지 않았다.

### 완료 복구 지점

- 경로: `backup/sqlite_github_push_20260806_0610`
- DB online backup SHA-256: `8CE4ADF9FAD44C78D0DEA4FBAE4D045B23A52CB7233B2D36D0F0749A0FB4C6F5`

---

## 2026-08-06 06:20 KST — 작업 010 — SQLite 문서 버전 충돌 비교·선택 UI

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_conflict_ui_start_20260806_0614`
- DB online backup SHA-256: `8CE4ADF9FAD44C78D0DEA4FBAE4D045B23A52CB7233B2D36D0F0749A0FB4C6F5`

### 구현 범위와 안전 정책

- 기존 `expectedVersion` 불일치와 IndexedDB 복구 버퍼를 그대로 사용하며 자동 덮어쓰기를 추가하지 않았다.
- pending operation 중 `VERSION_CONFLICT` 문서만 비교 목록에 표시한다.
- 사용자가 해결 방식을 고르고 SQLite 저장이 성공한 뒤에만 해당 문서의 초안과 pending operation을 정리한다.
- 운영 SQLite DB에는 테스트 문서를 생성·수정·삭제하지 않았다.

### 실제 구현

1. 충돌 비교 데이터
   - 저장 서비스에 `listDocumentConflicts()`를 추가했다.
   - 현재 SQLite 서버본의 제목·본문·version과 IndexedDB 로컬 복구본의 제목·본문·기준 version·저장 시각을 함께 반환한다.

2. 명시적 해결 방식
   - `서버본 사용`: SQLite 서버본을 유지하고 충돌한 로컬 복구 큐만 정리한다.
   - `로컬본 새 버전`: 현재 서버 version을 다시 확인한 뒤 로컬 복구본을 다음 version으로 저장한다.
   - `복구 문서 생성`: 기존 서버 문서를 변경하지 않고 로컬 복구본을 `제목 (복구본)` 새 문서로 저장한다.
   - 허용되지 않은 해결 문자열은 `INVALID_CONFLICT_STRATEGY`로 차단한다.

3. 화면 연결
   - 사이드바의 `충돌` 상태를 `충돌 · 클릭하여 비교` 버튼으로 바꿨다.
   - 서버본과 로컬 복구본을 두 패널에서 비교하고, 충돌이 여러 건이면 이전·다음으로 이동한다.
   - 해결 중에는 중복 클릭을 막고, 완료 후 SQLite 목록·현재 문서·복구 상태를 다시 읽는다.

4. 캐시 갱신
   - `storage-service.js`, `app.js` script version을 `20260806-sqlite-conflict-ui-1`로 변경했다.

### 검증

- JavaScript 변경 파일과 테스트 파일 구문 검사: 통과
- storage service 충돌 목록의 서버본·로컬본·기준 version 검사: 통과
- 서버본 유지 후 복구 큐 정리: 통과
- 로컬본을 현재 서버 version 다음 version으로 저장: 통과
- 로컬본을 별도 `복구본` 문서로 생성: 통과
- 허용되지 않은 해결 방식 차단: 통과
- SQLite repository·HTTP API 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과
- 실행 중 로컬 서버 health: schema v3, WAL, activation/search capability 정상
- 운영 DB 무결성: `integrity_check=ok`, FK 위반 0건, 활성 문서 2건

### 오류 가능성과 복구 방법

- 해결 저장 요청이 실패하면 초안과 pending operation을 지우지 않으므로 다시 시도할 수 있다.
- 화면 수정 복구: `backup/sqlite_conflict_ui_start_20260806_0614/index.html`, `js/app.js`
- 서비스 수정 복구: 같은 스냅샷의 `js/storage/storage-service.js`
- 테스트 수정 복구: 같은 스냅샷의 `scripts/test-storage-service.js`
- DB 복구가 필요하면 현재 DB를 별도 보존한 뒤 같은 스냅샷의 online backup을 사용한다. 이번 작업은 운영 DB 내용을 변경하지 않았다.

### 완료 복구 지점

- 경로: `backup/sqlite_conflict_ui_20260806_0620`
- DB online backup SHA-256: `8CE4ADF9FAD44C78D0DEA4FBAE4D045B23A52CB7233B2D36D0F0749A0FB4C6F5`

---

## 2026-08-06 06:49 KST — 작업 011 — Phase 4A IndexedDB 이관 미리보기

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_migration_preview_start_20260806_0638`
- DB online backup SHA-256: `8CE4ADF9FAD44C78D0DEA4FBAE4D045B23A52CB7233B2D36D0F0749A0FB4C6F5`

### 단계 범위와 안전 정책

- 이번 단계는 읽기 전용 미리보기까지만 구현하고 실제 SQLite 이관은 실행하지 않는다.
- 브라우저는 `MarkdownProDB`의 `documents`, `folders` 두 store만 readonly transaction으로 읽는다.
- `ai_settings`, 토큰, API key, 비밀번호와 다른 IndexedDB store는 batch에 포함하지 않는다.
- 서버가 ID·제목·본문 크기·폴더 관계·SHA-256을 다시 검증하므로 브라우저 입력을 그대로 신뢰하지 않는다.

### 실제 구현

1. 브라우저 정규화 batch
   - `js/storage/indexeddb-migration.js`를 추가했다.
   - Date와 문자열 시각을 epoch millisecond로 정규화하고, 누락된 최상위 폴더 관계는 `root`로 정규화한다.
   - 각 문서 본문 SHA-256을 계산해 `source`, `folders`, `documents` JSON만 서버로 보낸다.

2. SQLite 읽기 전용 비교 서비스
   - `LocalSave_sqlite/server/migrations.py`를 추가했다.
   - ID가 없으면 신규, 같은 ID·제목·폴더·checksum이면 중복, 같은 ID의 내용이 다르면 충돌로 분류한다.
   - 잘못된 ID, 원본 내 중복 ID, checksum 불일치, 없는 부모 폴더, 폴더 cycle은 제외로 분류한다.
   - 같은 부모의 폴더 이름 충돌도 실제 적용 전에 미리 표시한다.
   - preview 메서드에는 INSERT·UPDATE·DELETE가 없으며 결과에 `previewOnly=true`를 반환한다.

3. API·저장 파사드 연결
   - `POST /api/sqlite/migrations/indexeddb/preview`를 세션 보호 쓰기 요청으로 추가했다.
   - capability `migrationPreview=true`를 추가하고 실제 적용 capability `migration=false`는 유지했다.
   - SQLite 모드가 아닌 현재 inDB 상태에서도 SQLite adapter로 미리보기만 요청할 수 있게 했다.

4. 설정 화면
   - SQLite 상태 아래에 `inDB 이관 미리보기` 버튼을 추가했다.
   - 원본·신규·중복·충돌·제외 수와 문서·폴더 원본 수를 표시한다.
   - 화면에 `읽기 전용 비교 · 아직 이관하지 않음`과 SQLite에 쓰지 않았다는 안내를 표시한다.

5. 실제 로컬 서버 반영
   - 기존 PID `10368`을 정확히 확인한 뒤 서버를 재기동했다.
   - 새 서버 PID `38472`, schema v3, WAL, `migrationPreview=true`를 확인했다.

### 검증

- Python 구문 및 기존 SQLite server core 테스트: 통과
- 읽기 전용 이관 분류 테스트: 신규·중복·충돌·제외 및 preview 전후 레코드 수 동일 확인
- 브라우저 batch 테스트: documents·folders만 읽고 SHA-256과 폴더 관계 정규화 확인
- 세션 없는 preview 요청 403 차단과 실제 HTTP preview 응답: 통과
- storage service와 SQLite adapter 요청 연결: 통과
- 설정 화면 결과 항목·캐시 버전·민감 store 미참조 정적 검사: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과
- 실행 중 서버의 빈 batch preview: `previewOnly=true`, source 0건
- 운영 DB 무결성: `integrity_check=ok`, FK 위반 0건, 활성 문서 2건 유지
- 서버 재기동 시 기존 초기화 로직이 `app_meta.local_storage`의 `updated_at`을 갱신했지만 사용자 문서·폴더·버전은 이관하거나 수정하지 않았다.

### 브라우저 UI 검증 제한

- 연결된 외부 브라우저에서 로컬 앱 탭 생성과 열린 탭 조회가 각각 응답 시간 초과되어 실제 버튼 클릭 화면 검증은 완료하지 못했다.
- 같은 경로의 브라우저 batch 단위 테스트, 설정 UI 정적 검사, 실행 중 HTTP API 검증은 통과했다.
- 이 제한은 실제 데이터나 서버 상태를 변경하지 않았으며 다음 브라우저 연결 가능 시 버튼 클릭 결과를 추가 확인한다.

### 오류와 보완

- 최초 테스트에서 원본에 중복된 폴더 ID가 있으면 나중의 제외 항목이 정상 첫 항목의 상태를 덮어써 문서도 제외되는 문제가 발견됐다.
- 폴더 ID별 첫 정상 항목 상태만 관계 판단에 사용하도록 수정했고 같은 회귀 테스트로 통과했다.

### 복구 방법

- `backup/sqlite_migration_preview_start_20260806_0638`의 같은 상대 경로 파일로 복원한다.
- 새 파일 `LocalSave_sqlite/server/migrations.py`, `js/storage/indexeddb-migration.js`는 복원 시 별도 보존 후 제거한다.
- 서버를 재기동해 이전 API capability를 다시 반영한다.
- 이번 작업은 운영 사용자 문서·폴더를 변경하지 않았다. DB 전체를 복구해야 하면 현재 파일을 별도 보존한 뒤 작업 전 online backup을 사용한다.

### 완료 복구 지점

- 경로: `backup/sqlite_migration_preview_20260806_0649`
- DB online backup SHA-256: `38A17A9A92A433D4385FEDC91D594D31328EEBE20B1B45FFD4BE785F7F112BA2`

---

## 2026-08-06 07:01 KST — 작업 012 — Phase 4B IndexedDB 문서·폴더 안전 이관

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_migration_apply_start_20260806_0652`
- DB online backup SHA-256: `38A17A9A92A433D4385FEDC91D594D31328EEBE20B1B45FFD4BE785F7F112BA2`

### 단계 범위와 실행 정책

- Phase 4A 미리보기 결과에서 충돌·제외가 0건일 때만 실제 이관 버튼을 제공한다.
- 사용자가 확인 대화상자에서 승인한 경우에만 `online backup → 실제 이관`을 실행한다.
- 운영 DB에는 자동 테스트 문서를 쓰거나 실제 IndexedDB 이관을 자동 실행하지 않았다.
- `mdpro-indb-v1/files` 이관은 이번 단계에 섞지 않고 Phase 4C로 남긴다.

### 실제 구현

1. SQLite online backup
   - `DatabaseManager.create_online_backup('pre_migration')`을 추가했다.
   - 프로세스 write lock 안에서 Python SQLite online backup API를 사용하므로 WAL 파일을 단순 복사하지 않는다.
   - backup 자체의 `integrity_check`, `foreign_key_check`, SHA-256, 크기를 확인한다.
   - 완성된 파일만 `backup_history`에 `completed`로 기록한다.
   - 저장 위치는 SQLite data root 내부 `backups/`로 제한한다.

2. 미리보기와 실제 batch 동일성 보호
   - 문서·폴더·source 정규화 JSON의 SHA-256 fingerprint와 안정적인 migration ID를 미리보기 응답에 추가했다.
   - 실제 이관 직전에 브라우저가 IndexedDB를 다시 readonly로 읽는다.
   - 내용이 미리보기 이후 달라지면 `MIGRATION_PREVIEW_STALE`로 차단한다.
   - 충돌·제외가 하나라도 있으면 `MIGRATION_PREVIEW_HAS_BLOCKERS`로 backup 생성 전 차단한다.

3. 문서·폴더 실제 이관
   - 부모 폴더를 먼저 삽입하도록 관계 순서로 정렬하고 ROOT는 기존 항목을 재사용한다.
   - 신규 문서는 `source_mode='legacy_indb'`, version 1로 저장한다.
   - 각 신규 문서에 `change_type='migration'`인 최초 `document_versions`를 함께 생성한다.
   - 브라우저의 생성·수정 시각, 폴더 관계, 제목, 본문을 보존한다.

4. 원자적 검증과 checkpoint
   - 폴더·문서·최초 버전·checkpoint를 하나의 transaction에서 처리한다.
   - commit 전에 문서 수, 제목, 폴더 ID, 본문 SHA-256, 최초 version checksum을 다시 비교한다.
   - `app_meta/indexeddb_migration:<migrationId>`에 fingerprint, backup, 적용 수, 검증 수, 상태를 기록한다.
   - backup 생성 뒤 중단된 상태는 `backup_created` checkpoint로 남고 재실행 시 같은 backup을 재사용한다.

5. idempotent 재실행
   - 같은 ID와 제목·폴더·checksum이 같으면 duplicate로 건너뛴다.
   - 완료 checkpoint와 같은 fingerprint를 다시 적용하면 0건 적용과 `idempotent=true`를 반환한다.
   - 다른 내용의 같은 ID는 덮어쓰지 않고 미리보기 충돌로 유지한다.

6. 설정 화면
   - 신규 항목이 있고 충돌·제외가 없으며 서버가 migration·onlineBackup capability를 제공할 때만 `online backup 후 실제 이관` 버튼을 표시한다.
   - 실제 실행 전에 backup과 IndexedDB 원본 보존을 명시한 확인 대화상자를 표시한다.
   - 완료 후 적용·검증·중복 건수와 backup 경로를 표시한다.
   - IndexedDB 삭제·정리 버튼이나 코드 경로는 추가하지 않았다.

7. 실제 서버 반영
   - 기존 PID `38472`를 확인한 후 새 코드로 재기동했다.
   - 새 PID `31012`, schema v3, WAL, `migration=true`, `onlineBackup=true`를 확인했다.

### 자동 검증

- online backup 파일 생성·SHA-256·무결성 및 이관 전 문서만 포함: 통과
- 중첩 폴더 부모 순서와 ROOT 관계 보존: 통과
- 문서 본문·source mode·최초 version·checksum·시각 보존: 통과
- commit 전 문서·폴더·version 검증: 통과
- 충돌 batch의 backup 전 차단과 stale fingerprint 차단: 통과
- 같은 batch 두 번째 적용 0건 및 중복 미생성: 통과
- `backup_created` checkpoint 재개 시 기존 backup 재사용: 통과
- 세션 보호 HTTP preview/apply와 idempotent 재호출: 통과
- 브라우저가 실제 적용 직전 IndexedDB를 다시 읽고 fingerprint를 전달: 통과
- storage service·adapter, SQLite server/API 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과
- 설정 UI 적용 버튼·확인·원본 보존·정리 기능 부재 정적 검사: 통과

### 운영 서버 읽기 검증

- 빈 batch 미리보기: `previewOnly=true`
- 잘못된 fingerprint 실제 적용: `MIGRATION_PREVIEW_STALE`로 차단
- 운영 DB: `integrity_check=ok`, FK 위반 0건, 활성 문서 2건 유지
- 테스트 시점 production `LocalSave_sqlite/data/backups` 파일: 0건
- 실제 IndexedDB 이관과 pre-migration backup은 사용자가 화면에서 확인하기 전에는 실행하지 않았다.
- 서버 재기동으로 기존 초기화 로직의 `app_meta.local_storage.updated_at`은 갱신됐지만 사용자 문서·폴더·버전은 변경하지 않았다.

### 오류와 복구 기록

- 첫 이관 테스트 종료 때 backup 검사용 SQLite 연결이 열린 채 남아 Windows 임시 디렉터리 정리가 실패했다.
- 검사 연결을 `finally`에서 명시적으로 닫도록 수정한 후 같은 테스트를 재실행해 통과했다.
- 실패한 테스트의 정확한 임시 경로 2개를 data root 밖이 아님을 확인하고 삭제했다. 운영 DB와 backup 경로는 삭제하지 않았다.

### 복구 방법

- `backup/sqlite_migration_apply_start_20260806_0652`의 같은 상대 경로 파일로 코드와 문서를 복원한다.
- 서버를 재기동해 이전 capability와 API를 다시 반영한다.
- 새로 생성되는 실제 pre-migration backup은 이관 직전 일관된 사본이므로 이관 실패 때 삭제하지 않고 우선 보존한다.
- 운영 DB 전체 복구가 필요하면 현재 DB를 별도 보존하고 작업 전 online backup을 사용한다.

### 완료 복구 지점

- 경로: `backup/sqlite_migration_apply_20260806_0701`
- DB online backup SHA-256: `0E559E17C4252B2C9172F13620465FAAC63278D884A14CD28D4A38DE3E3F22EA`

---

## 2026-08-06 10:01 KST — 작업 013 — SQLite 읽기 전용 데이터 탐색 창

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_explorer_start_20260806_1001`
- SQLite online backup: `LocalSave_sqlite/data/backups/pre_update_1785978105589_ae7f3002.sqlite`
- DB backup SHA-256: `E5F04C84D8BD93572AD60E4F1E7E2FE88E9A09458B5C3BD30AD6466EA98F489C`
- backup 생성은 Python SQLite online backup API를 사용했고 자체 `integrity_check`와 `foreign_key_check`를 통과했다.

### 단계 범위와 안전 정책

- 기존 `inDB보기`와 별도의 `SQLite보기` 창을 추가한다.
- 이번 창은 조회 전용이며 문서·폴더·백업·이관 기록의 변경 또는 삭제 기능을 넣지 않는다.
- 목록 응답에는 문서 본문을 포함하지 않고 사용자가 문서를 선택할 때만 단건 본문을 읽는다.
- explorer는 활성 저장 모드와 분리해 현재 inDB 모드여도 SQLite 서버 연결만 정상이라면 읽을 수 있게 한다.
- 자동 테스트는 임시 DB에서만 쓰기를 수행하고 운영 DB에는 테스트 문서를 만들지 않는다.

### 실제 구현

1. 읽기 전용 repository와 API
   - `StorageRepository.get_explorer_snapshot()`을 추가했다.
   - 활성/삭제 문서, 폴더, 버전, 백업, IndexedDB 이관 checkpoint의 전체 건수를 제공한다.
   - 문서 목록은 제목·ID·폴더 이름으로 검색하고 최대 500건으로 제한한다.
   - 목록에는 본문이 없고 checksum, source mode, 폴더 이름, 현재 버전과 시각만 포함한다.
   - `GET /api/sqlite/explorer?q=&limit=`와 `capabilities.explorer=true`를 추가했다.

2. 저장 adapter와 파사드
   - `SqliteApiAdapter`에 explorer snapshot, 단건 문서, 버전 기록 조회를 추가했다.
   - `MDPStorage`에 활성 adapter와 무관하게 SQLite adapter를 직접 읽는 전용 메서드를 추가했다.
   - explorer 요청은 모두 GET이며 SQL 문자열이나 테이블 이름을 브라우저가 전달하지 않는다.

3. 설정 UI
   - 설정 footer의 `inDB보기` 옆에 `SQLite보기` 버튼을 추가했다.
   - 문서·폴더·백업·이관 기록 탭, 검색, 전체 건수 요약, DB 경로/schema/WAL 정보를 표시한다.
   - 문서를 누르면 오른쪽 상세 영역에 본문과 버전 번호·변경 종류·생성 시각을 표시한다.
   - 본문은 `textContent`, 나머지 동적 문자열은 HTML escaping을 사용해 표시한다.
   - 서버가 explorer capability를 제공하지 않거나 연결되지 않으면 버튼을 비활성화한다.
   - 모달에 변경·복원·삭제 버튼은 추가하지 않았다.

4. 실제 서버 반영
   - 기존 `127.0.0.1:8765` PID `31012`가 이 프로젝트의 `python run.py`인지 확인했다.
   - 새 코드로 재기동하여 PID `34980`에서 explorer API와 새 HTML cache version을 확인했다.

### 자동 검증

- Python 구문 검사 `repositories.py`, `api.py`: 통과
- Node 구문 검사 `sqlite-api-adapter.js`, `storage-service.js`, `settings-ui.js`: 통과
- SQLite server core explorer count·검색·본문 비노출: 통과
- HTTP explorer capability·백업·checkpoint·본문 비노출: 통과
- storage service explorer 전용 호출과 문서 버전 조회: 통과
- IndexedDB migration Python/브라우저 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과

### 운영 서버 읽기 검증

- explorer capability: `true`
- DB: schema v3, WAL, `readOnly=true`
- 활성 문서 2건, 폴더 1건, 버전 2건 유지
- 탐색 목록의 문서 2건 모두 `content` 필드 없음
- 작업 전 안전 backup 1건이 `backup_history`에서 조회됨
- 이관 checkpoint 0건은 아직 실제 IndexedDB 이관을 실행하지 않은 현재 운영 상태와 일치함
- 운영 DB에는 테스트 문서·폴더·checkpoint를 추가하지 않았다.

### 오류와 복구 기록

- 최초 작업 전 snapshot 목록에서 테스트 파일 경로를 `LocalSave_sqlite/tests`로 예상했으나 실제 위치는 `scripts/`였다.
- 코드 변경 전에 실제 경로를 다시 탐색하고 `scripts/test-sqlite-server.py`, `scripts/test-sqlite-http-api.py`, `scripts/test-storage-service.js`를 같은 시작 snapshot에 보완 복사했다.
- 첫 정적 검사 명령의 PowerShell 문자열 인용이 잘못되어 `rg`만 실패했다. 파일 구문 오류는 아니었고 인용을 수정한 뒤 전체 구문 검사를 통과했다.

### 복구 방법

- 코드 복구는 `backup/sqlite_explorer_start_20260806_1001`의 같은 상대 경로 파일을 사용한다.
- DB 복구가 필요하면 현재 DB를 먼저 별도 보존하고 위 `pre_update` online backup의 무결성과 SHA-256을 다시 확인한 뒤 복원한다.
- 이전 코드로 복구할 때 PID `34980`을 종료하고 `run.py`를 다시 시작해 이전 API capability를 반영한다.
- 이번 기능은 운영 문서·폴더·버전 내용을 수정하지 않았다.

### 완료 복구 지점

- 코드: `backup/sqlite_explorer_20260806_1009`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785978582519_5815c5a4.sqlite`
- DB backup SHA-256: `7922A34861C767857719C01EEAD2AE16D934975DC6BDB7135E329E7DDB1BA77B`
- 완료 backup도 자체 `integrity_check`와 `foreign_key_check`를 통과했다.
- 최종 운영 검증은 `integrity_check=ok`, FK 위반 0건, 문서 2건·폴더 1건·버전 2건 유지, 기록된 backup 2건으로 통과했다.
- SQLite 탐색 모달 범위에 delete/remove 실행 handler가 없음을 정적 검사했다.

---

## 2026-08-06 10:53 KST — 작업 014 — Phase 4C `mdpro-indb-v1/files` 안전 이관

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_files_migration_start_20260806_1038`
- SQLite online backup: `LocalSave_sqlite/data/backups/pre_update_1785980305043_112be51e.sqlite`
- DB backup SHA-256: `ADCA65AC29772ED96EC8CB8D879BE8924217D06A3713F7FB6B29B217D5374631`
- backup 자체 `integrity_check`와 `foreign_key_check`를 통과했다.

### 단계 범위와 안전 정책

- 브라우저는 `mdpro-indb-v1`의 `files`와 `meta/root`를 readonly transaction으로만 읽는다.
- 파일 DB가 없을 때 빈 IndexedDB를 새로 남기지 않도록 최초 생성 upgrade transaction을 중단한다.
- `MarkdownProDB`가 없어도 `mdpro-indb-v1/files`만 존재하면 파일 전용 이관이 가능하다.
- preview는 파일 경로·UTF-8 byte 크기·본문 SHA-256을 SQLite와 비교하지만 응답에 본문을 포함하지 않는다.
- 실제 쓰기는 사용자가 미리보기 후 확인 대화상자를 승인했을 때만 `online backup → 단일 transaction` 순서로 수행한다.
- 기존 IndexedDB 원본은 이관 성공 후에도 삭제하거나 수정하지 않는다.
- 운영 DB에서는 실제 파일 이관 apply를 자동 실행하지 않는다.

### 실제 구현

1. 브라우저 파일 batch
   - `indexeddb-migration.js`가 `mdpro-indb-v1/files`의 primary key, `path`, `name`, `ext`, `content`, `modified`를 정규화한다.
   - 역슬래시·중복 slash·선행 slash를 일관된 상대 경로로 바꾸고 UTF-8 byte 크기와 SHA-256을 계산한다.
   - `meta/root`의 folder name, 저장 시각, memo, 선언 파일 수를 비민감 source metadata로 전달한다.
   - 실제 적용 직전 두 IndexedDB를 다시 readonly로 읽으므로 preview 이후 변경은 fingerprint 불일치로 차단된다.

2. 서버 미리보기 분류
   - 고정 source ID `source_mdpro_indb_v1`, source type `legacy_indb`, root URI `indexeddb://mdpro-indb-v1/files`를 사용한다.
   - 파일 경로에서 중간 폴더 entry를 결정적으로 생성하고 folder/file ID는 type과 path의 SHA-256으로 만든다.
   - source, 파생 경로 폴더, 파일을 각각 신규·중복·충돌·제외로 분류한다.
   - `..`, 빈 segment, NUL, 2,048자 초과 경로, 20MB 초과 파일, checksum·size 불일치를 제외한다.
   - 같은 path의 다른 본문이나 folder/file type 충돌은 덮어쓰지 않고 blocker로 처리한다.
   - 파일 최대 5,000건, migration request 전체 최대 50MB로 제한한다.

3. 원자적 실제 이관과 검증
   - `workspace_sources` 1건을 먼저 만들고 파생 폴더를 깊이 순서대로 삽입한 뒤 파일을 저장한다.
   - `file_entries`에 parent 관계, extension, MIME, `content_text`, UTF-8 크기, modified time, checksum/base checksum을 보존한다.
   - 같은 batch 재실행은 완료 checkpoint와 fingerprint로 0건 적용을 반환하며 중복 source/file entry를 만들지 않는다.
   - commit 전에 source type/root URI, 모든 path/type/name, 파일 크기와 SHA-256을 다시 조회해 검증한다.
   - 충돌·제외가 있으면 online backup 생성 전 실제 적용을 차단한다.

4. 설정 및 SQLite 탐색 UI
   - 이관 미리보기에 파일 원본 수, 생성 경로 폴더 수, source와 file entry 상태 수를 표시한다.
   - 완료 화면에 적용·검증된 file source, 경로 폴더, 파일 건수를 표시한다.
   - 확인 문구와 진행 상태를 문서·폴더·inDB 파일 범위로 변경했다.
   - `SQLite 데이터 탐색`에 파일 탭과 source/file entry 건수를 추가했다.
   - 파일 목록은 본문을 제외하고 경로·source·크기·수정 시각만 제공하며 파일을 선택할 때만 본문을 GET으로 읽는다.

5. 실제 서버 반영
   - 기존 PID `34980`이 이 프로젝트의 `python run.py`인지 확인한 후 새 코드로 재기동했다.
   - 새 PID `22984`에서 Phase 4C preview와 `20260806-files-migration-1` cache version을 확인했다.

### 자동 검증

- Python/Node 변경 파일 구문 검사: 통과
- source 1건·파생 폴더 2건·파일 3건 원자적 이관: 통과
- 중첩 파일 parent 관계와 UTF-8 본문·크기·수정 시각·SHA-256 보존: 통과
- preview 응답과 explorer 파일 목록의 본문 비노출: 통과
- explorer 파일 단건 본문 조회: 통과
- 같은 파일 batch 재실행 0건 및 entry 중복 없음: 통과
- 같은 path의 다른 checksum 충돌 및 backup 생성 전 apply 차단: 통과
- 경로 이탈과 checksum 불일치 제외: 통과
- MarkdownProDB 없이 file DB만 존재하는 브라우저 batch: 통과
- SQLite server core, HTTP API, storage service, IndexedDB migration Python/브라우저 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과

### 운영 서버 읽기 검증

- 실제 적용이 아닌 합성 파일 1건 preview만 실행했다.
- 결과: `previewOnly=true`, source file 1건, 파생 폴더 1건, 신규 3건, 충돌 0건, 제외 0건.
- preview 전후 운영 DB의 문서 3건, source 0건, file entry 0건, checkpoint 0건, backup 3건이 각각 동일했다.
- `integrity_check=ok`, FK 위반 0건을 확인했다.
- 이번 단계에서 운영 `workspace_sources`, `file_entries`, migration checkpoint에는 쓰지 않았다.

### 오류와 복구 기록

- 첫 운영 preview 검증 명령에서 현재 PowerShell/.NET이 정적 `SHA256.HashData()`를 지원하지 않아 checksum 생성 한 줄이 실패했다.
- 이 요청은 빈 checksum으로 preview만 처리되어 DB를 변경하지 않았고 source/file/checkpoint/backup 건수도 동일했다.
- `SHA256.Create().ComputeHash()` 방식으로 올바른 checksum을 생성해 같은 preview를 다시 실행했고 전후 불변을 재확인했다.

### 복구 방법

- 코드 복구는 `backup/sqlite_files_migration_start_20260806_1038`의 같은 상대 경로 파일을 사용한다.
- DB 복구가 필요하면 현재 DB를 먼저 별도 보존하고 위 `pre_update` online backup의 SHA-256과 무결성을 확인한 뒤 복원한다.
- 이전 코드로 복구할 때 PID `22984`를 종료하고 `run.py`를 다시 시작해 이전 API와 cache version을 반영한다.
- 사용자가 실제 파일 이관을 실행한 뒤 복구해야 한다면 checkpoint의 `backup.filePath`에 기록된 pre-migration online backup을 우선 보존한다.

### 완료 복구 지점

- 코드: `backup/sqlite_files_migration_20260806_1054`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785981292651_522db3e5.sqlite`
- DB backup SHA-256: `30EB09448823582352DEBDECF9DC6E63B8E97CC9E5BBF7CC695E88F70610AEEB`
- 완료 backup도 자체 `integrity_check`와 `foreign_key_check`를 통과했다.
- 최종 운영 검증은 문서 3건 유지, source/file entry/checkpoint 0건 유지, 기록된 backup 4건, `integrity_check=ok`, FK 위반 0건으로 통과했다.

---

## 2026-08-06 11:06 KST — 작업 015 — 구현 계획 체크 상태 동기화

상태: 완료

### 복구 지점

- `backup/sqlite_plan_check_sync_20260806_1106`
- 문서 체크 상태만 변경했으며 코드와 SQLite DB는 변경하지 않았다.

### 완료 근거를 재확인해 추가 체크한 항목

- 실행 중 SQLite를 Python online backup API로 일관되게 복사하고 backup 자체 무결성·SHA-256을 검증함.
- IndexedDB 원본, 자동저장 초안, pending operation을 이관 과정에서 삭제하지 않음.
- 서버 재시작 후 같은 DB 경로와 기존 문서 목록을 다시 조회함.
- 폴더 이동·삭제 뒤 `foreign_key_check` 위반 0건을 자동 테스트함.
- 문서 최초 저장·수정·복원 때 예상 버전 생성과 version 증가를 자동 테스트함.
- 이관 transaction 안에서 문서 수·본문 SHA-256·최초 version checksum을 비교함.
- 같은 migration batch의 두 번째 적용이 0건이고 문서·폴더·파일 entry 중복이 없음을 자동 테스트함.

### 미체크로 유지한 범위

- 실제 브라우저 IndexedDB baseline sample 수집 3건
- 설정 화면의 수동 backup·무결성 버튼
- Phase 5 비민감 설정 이관 전체
- Phase 6 `.mdpbackup` 패키징·다운로드·복원·다른 PC 검증과 인스턴스 lock
- Phase 7 기능별 데이터 확장
- 보안 로그 audit, DB lock·disk full·readonly 오류 분류, WAL/backup 경합 시험
- 1,000/10,000건 성능, emoji·긴 Markdown 왕복, GitHub/WebDAV 전체 흐름, 다른 PC 복원 시나리오

아직 구현 또는 명시적 검증 근거가 없는 항목은 완료로 표시하지 않았다.

---

## 2026-08-06 11:34 KST — 작업 016 — Phase 5 비민감 `ai_settings` SQLite 이관·복원

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_settings_migration_start_20260806_1118`
- SQLite online backup: `LocalSave_sqlite/data/backups/pre_update_1785982736182_f98bbf3a.sqlite`
- DB backup SHA-256: `3826C336E978B77A252F6685C2FDEECD89755198B152C4505DCD91E1EE97E406`
- 작업 전 snapshot에는 서버·저장 adapter·설정 UI·앱 설정 함수·테스트·계획서·작업 이력의 같은 상대 경로 파일을 보존했다.

### 실제 키 조사와 분류 정책

- `MarkdownProDB/ai_settings`의 실제 저장 호출을 조사해 기능 표시, 편집 옵션, 사이트·양식 목록, 사용자 정보, GitHub 저장소 경로, Google Docs Client ID 등을 비민감 허용 대상으로 확정했다.
- `apiKey`, `deepseekApiKey`, `openaiApiKey`, `imgbbApiKey`, `googlePickerApiKey`, `githubToken`, `passwordHash`는 민감 설정으로 분류했다.
- `id`, `sqliteEnabled`, `githubCacheDocs`, `githubLastPulledAt`, `verified`는 레코드 식별자·장치 선택·캐시·일시 인증 상태이므로 공유 설정에서 제외했다.
- 알 수 없는 새 키는 자동 허용하지 않고 `unknownKeys`로 분류해 향후 명시적 검토 후에만 허용한다.
- 현행 테마와 기본 AI 모델은 `ai_settings`가 아니라 별도 `localStorage` 키이므로 장치 부트스트랩 동작을 유지하고 이번 이관 범위에는 포함하지 않았다.

### 실제 구현

1. 서버 보안 정책과 설정 repository
   - 새 `LocalSave_sqlite/server/settings_policy.py`에 비민감 키별 group, 기본 scope, 허용 JSON type, 최대 byte 크기를 명시했다.
   - 설정 키 이름뿐 아니라 허용된 object/array 내부의 `token`, `apiKey`, `password`, `credential` 같은 중첩 필드도 재귀 검사해 차단한다.
   - `GET/PUT /api/sqlite/settings`, `GET /api/sqlite/settings/resolved`를 구현하고 health의 `settings=true`를 활성화했다.
   - 모든 PUT은 로컬 세션 토큰을 요구하고 SQL parameter binding을 사용한다.
   - 범위 병합은 `global → profile → workspace → feature → document` 순서로 뒤 범위가 앞 범위를 덮도록 구현했다.

2. IndexedDB 설정 batch와 안전 이관
   - 문서·폴더 readonly transaction에 선택적으로 `ai_settings`를 포함하고 `ai_settings` 단일 레코드를 읽는다.
   - 브라우저 batch의 `settings`에는 허용된 비민감 값만 넣는다. 민감·일시·미분류 값은 키 이름별 분류 수만 전달하며 원래 값은 직렬화하지 않는다.
   - 서버가 브라우저 분류를 신뢰하지 않고 같은 허용 목록·중첩 비밀 검사를 다시 수행한다.
   - preview에서 설정을 신규·중복·충돌·제외로 분류하고, 실제 apply는 online backup 후 같은 transaction에서 삽입·JSON 값 검증·checkpoint 기록을 수행한다.
   - 같은 fingerprint를 다시 적용하면 설정을 포함해 0건 적용하는 idempotent 결과를 반환한다.

3. SQLite 모드 설정 저장·복원
   - SQLite 모드의 `getAiSettings()`는 로컬 IndexedDB/폴백 값을 먼저 읽고 SQLite의 resolved 비민감 설정만 덮어쓴다. 로컬에만 있는 비밀값은 SQLite 응답으로 제거되지 않는다.
   - `setAiSettings()`는 기존 IndexedDB 저장을 유지한 뒤 변경 데이터 중 허용된 비민감 키만 SQLite PUT으로 미러링한다.
   - 새 PC처럼 로컬 비밀값이 없는 환경에서는 일반 설정만 복원되며 미리보기 UI가 API Key·토큰을 다시 입력해야 한다고 안내한다.

4. SQLite 탐색 UI
   - `SQLite 데이터 탐색`에 `설정` 탭과 설정 건수를 추가했다.
   - scope, group, key, JSON type, 수정 시각과 비민감 값만 읽기 전용으로 표시한다.
   - 이관 미리보기에 비민감 설정, 민감 제외, 장치/일시 제외, 미분류 제외 수와 재입력 대상 키 이름을 표시한다.
   - 완료 화면에 적용·검증 설정 수와 비밀값 비저장 정책을 표시한다.

5. HTTP 거부 연결 안정화
   - 세션 없이 본문이 있는 POST/PUT을 거부할 때 Windows에서 응답 소켓이 간헐적으로 reset되는 현상을 확인했다.
   - 최대 50MB 제한 안의 거부 요청 본문을 작은 chunk로 비운 뒤 403을 응답하도록 보강했다.
   - 전체 HTTP API 테스트를 3회 연속 실행해 같은 오류가 재발하지 않음을 확인했다.

### 변경 파일

- 추가: `LocalSave_sqlite/server/settings_policy.py`
- 변경: `LocalSave_sqlite/server/repositories.py`
- 변경: `LocalSave_sqlite/server/migrations.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `js/storage/indexeddb-migration.js`
- 변경: `js/storage/sqlite-api-adapter.js`
- 변경: `js/storage/storage-service.js`
- 변경: `js/app.js`
- 변경: `Setting/settings-ui.js`
- 변경: `index.html`
- 변경: `scripts/test-indexeddb-migration.py`
- 변경: `scripts/test-indexeddb-migration.js`
- 변경: `scripts/test-sqlite-server.py`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `scripts/test-storage-service.js`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python/Node 변경 파일 구문 검사: 통과
- `ai_settings` 혼합 레코드에서 비민감 값만 browser batch에 포함: 통과
- Gemini/OpenAI/DeepSeek/imgbb/Google Picker/GitHub 비밀값이 batch JSON에 포함되지 않음: 통과
- 서버의 최상위 민감 키와 허용 object 내부 중첩 token 차단 및 오류 응답 값 비노출: 통과
- 설정 신규 apply·commit 전 값 검증·checkpoint·재실행 0건: 통과
- global/profile/workspace/feature/document 우선순위: 통과
- online backup을 별도 `DatabaseManager` DB로 열어 일반 설정 복원 및 비밀 키 부재 확인: 통과
- settings HTTP 세션 보호·목록·resolved·PUT: 통과
- storage adapter의 안전 설정 PUT과 비밀값 미전송: 통과
- SQLite server core, IndexedDB migration Python/브라우저, HTTP API, storage service 전체 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과

### 운영 서버 검증

- 기존 PID `22984`가 이 프로젝트의 `python run.py`인지 확인한 뒤 새 코드로 재기동했고 PID `42320`에서 schema v3, `settings=true`, `available=true`를 확인했다.
- 합성 비민감 설정 1건과 민감 키 이름 2건을 사용해 preview만 실행했다.
- 결과: `previewOnly=true`, 비민감 신규 1건, 민감 제외 2건, 재입력 대상 `apiKey, githubToken`.
- preview 전후 설정 2건, migration checkpoint 0건이 동일해 preview가 운영 DB를 변경하지 않았다.
- 열린 앱이 정상 실행 중 비민감 `scholarAI=false`, `sspimgAI=false` 2건을 SQLite에 미러링했다.
- 운영 `settings` 전체를 readonly로 재검사한 결과 민감 키·중첩 민감 필드 위반은 0건이었다.
- 최종 `integrity_check=ok`, foreign key 위반 0건을 확인했다.
- HTTP 안정화 코드까지 반영하기 위해 서버를 최종 PID `26648`로 다시 시작했다. 열린 앱이 허용 목록의 실제 일반 설정을 동기화하여 최종 설정은 23건이며, 전체 키와 중첩 JSON을 다시 검사한 결과 민감 위반은 여전히 0건이다.
- 최종 운영 상태는 문서 3건, migration checkpoint 0건, schema v3, `settings=true`, `integrity_check=ok`이다.

### 오류와 복구 기록

- 최초 실제 키 탐색 명령은 존재하지 않는 `js/user.js`도 함께 조회해 `rg`가 exit 1을 반환했다. 실제 파일은 `Setting/user.js`였으며 읽힌 결과와 후속 정확한 경로 조사로 분류를 완료했다. 코드·DB 변경은 없었다.
- 전체 회귀 재실행 중 HTTP 임시 서버 테스트가 Windows `WinError 10053`으로 한 번 중단됐다. 단독 1회는 통과하고 연속 두 번째에 재현되어, 세션 거부 본문 미소비가 원인임을 확인하고 위 HTTP 안정화 수정을 적용했다.
- 운영 DB에는 합성 설정 apply를 실행하지 않았다. 현재 설정 2건은 실제 열린 앱의 비민감 설정 동기화 결과이며 보안 정책 검사를 통과했다.

### 복구 방법

- 코드 복구는 `backup/sqlite_settings_migration_start_20260806_1118`의 같은 상대 경로 파일로 되돌린다.
- 새 파일 `LocalSave_sqlite/server/settings_policy.py`는 다른 변경 파일을 시작 snapshot으로 복원한 뒤 제거한다.
- DB 복구가 필요하면 현재 DB를 먼저 별도 online backup하고, 작업 전 `pre_update_1785982736182_f98bbf3a.sqlite`의 SHA-256과 무결성을 다시 확인한 뒤 복원한다.
- 이전 코드로 되돌린 뒤 실행 중 로컬 서버를 재시작해야 이전 capability와 브라우저 cache version이 반영된다.
- 실제 설정 이관을 사용자가 적용한 뒤 복구해야 한다면 migration checkpoint의 `backup.filePath`에 기록된 pre-migration backup을 우선 보존한다.

### 완료 복구 지점

- 코드: `backup/sqlite_settings_migration_20260806_1134`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785983640523_e400dc22.sqlite`
- DB backup SHA-256: `EC036B50950F984F84E1DC78775F84353B684ACE6F10A4D963E24B0BED773AE6`
- 완료 backup 생성 직전 운영 DB는 `integrity_check=ok`, foreign key 위반 0건이었다.

---

## 2026-08-06 12:09 KST — 작업 017 — Phase 6A `.mdpbackup` 생성·검증·다운로드

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_backup_package_start_20260806_1159`
- SQLite online backup: `LocalSave_sqlite/data/backups/pre_update_1785985151535_b80cf589.sqlite`
- DB backup SHA-256: `BB93C2FB8E74E6E1F738ACD477DFE05B731DF2B8A61C4B194BE8B3842FA5152D`
- 작업 전 snapshot에는 서버 DB/API, storage adapter/service, 설정 UI, HTML, 테스트, 계획서와 작업 이력 11개 파일을 보존했다.

### 단계 범위와 복원 안전선

- 이번 단계는 일관된 공유 패키지 생성·자체 검증·다운로드까지만 구현했다.
- 업로드한 패키지로 운영 DB를 교체하는 복원 apply는 아직 구현하지 않았고 health capability도 `restore=false`로 유지했다.
- 다음 Phase 6B에서 파일 선택, 복원 미리보기, 임시 검증 공간을 먼저 만들고 실제 교체는 자동 pre-restore backup과 원자적 전환 뒤에만 허용한다.

### 실제 구현

1. `.mdpbackup` 패키지 형식
   - 새 `LocalSave_sqlite/server/backup_packages.py`를 추가했다.
   - ZIP 기반 `.mdpbackup` 루트에 `manifest.json`, `mdpro.sqlite`, `assets/`를 고정 배치한다.
   - manifest format은 `mdviewer-sqlite-backup`, format version은 `1`이다.
   - manifest에 생성 시각, workspace, DB schema/크기/SHA-256/integrity/FK 결과, 자산별 상대 경로·크기·SHA-256·참조 ID를 기록한다.
   - 자산이 없어도 빈 `assets/` entry를 포함해 복원 규격을 일정하게 유지한다.

2. DB와 자산 일관성
   - 실행 중 DB 파일을 직접 복사하지 않고 기존 Python SQLite online backup API로 먼저 일관된 DB 사본을 만든다.
   - online backup과 filesystem 자산 메타데이터 수집 동안 process write lock을 유지한다.
   - `assets`의 filesystem 항목과 `asset_variants.relative_path`를 `LocalSave_sqlite/data/assets` 아래에서만 해석한다.
   - 누락 파일, root 이탈, DB 메타데이터와 다른 자산 checksum/크기는 패키지 생성 전에 차단한다.
   - 같은 자산 경로를 여러 레코드가 참조하면 checksum이 같을 때 한 파일과 여러 reference로 manifest에 기록한다.

3. 패키지 자체 검증
   - 생성 직후 패키지를 다시 열어 필수 entry, 중복 entry, 미선언 파일, `..`·absolute·backslash·NUL 경로를 검사한다.
   - entry 수, 압축 해제 총량, 단일 DB/자산 크기, 비정상 압축률을 제한해 ZIP bomb 위험을 낮췄다.
   - manifest와 실제 DB·자산의 집합, byte 크기, SHA-256을 전부 비교한다.
   - DB를 data root의 임시 파일로만 풀어 `schema_migrations` 버전, `PRAGMA integrity_check`, `PRAGMA foreign_key_check`를 실행한 뒤 즉시 제거한다.
   - manifest와 DB schema 불일치, 현재 앱보다 미래 schema를 모두 차단한다.
   - 검증 실패 중간 `.tmp`와 완성 패키지는 제거하며 현재 운영 DB는 변경하지 않는다.

4. 세션 보호 API와 다운로드
   - health capability에 `backup=true`, `backupPackage=true`, `restore=false`를 명시했다.
   - `POST /api/sqlite/backups/packages`로 패키지를 만들고 `POST /api/sqlite/backups/packages/validate`로 서버 생성 패키지를 재검증한다.
   - 다운로드는 `GET /api/sqlite/backups/packages/{고정형식 파일명}`만 허용한다.
   - exports root 밖 경로, 임의 확장자·파일명은 거부하고 다운로드 GET도 실행 세션 헤더를 필수로 검사한다.
   - binary 응답은 전용 MIME, attachment filename, 정확한 Content-Length와 `nosniff`를 사용한다.

5. 설정 UI
   - SQLite 설정 영역에 `공유 백업 만들기`를 추가했다.
   - 생성 전에 모든 문서 본문·일반 설정·연결 자산이 포함되며 문서에 직접 적은 비밀 내용도 포함될 수 있음을 확인 대화상자로 표시한다.
   - 생성 후 파일명, schema, DB/자산 크기, integrity/FK 결과, package SHA-256을 먼저 표시한다.
   - 사용자가 포함 범위와 검증 결과를 본 다음 `검증된 백업 다운로드`를 눌러 session-protected binary를 받는다.

### 변경 파일

- 추가: `LocalSave_sqlite/server/backup_packages.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `js/storage/sqlite-api-adapter.js`
- 변경: `js/storage/storage-service.js`
- 변경: `Setting/settings-ui.js`
- 변경: `index.html`
- 추가: `scripts/test-backup-packages.py`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `scripts/test-storage-service.js`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python/Node 변경 파일 구문 검사: 통과
- 문서·일반 설정·filesystem 자산 1건 패키징과 manifest/ZIP entry 검증: 통과
- 패키지 DB를 별도 `DatabaseManager`로 열어 문서 본문·설정 복원: 통과
- 자산 byte와 checksum 왕복: 통과
- package 전체 SHA-256과 다운로드 binary SHA-256 일치: 통과
- 세션 없는 다운로드 403과 세션 다운로드 성공: 통과
- 손상 DB checksum/size 차단: 통과
- ZIP `../` 경로 이탈과 임의 package filename 차단: 통과
- DB 메타데이터와 다른 자산 내용 차단: 통과
- 미래 schema v999 차단: 통과
- SQLite server core, IndexedDB migration Python/브라우저, HTTP API, storage service 전체 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과

### 운영 서버 검증

- 기존 PID `26648`이 이 프로젝트의 `python run.py`인지 확인하고 새 코드로 PID `33328`에서 재기동했다.
- schema v3, `backup=true`, `backupPackage=true`, `restore=false`, `available=true`를 확인했다.
- 실제 운영 패키지 `mdviewer_1785985668831_514057443816.mdpbackup`을 생성하고 서버 재검증 및 session 다운로드를 실행했다.
- package 크기: `6,643,968` bytes.
- package/download SHA-256: `5D122497DD0D29E41DFDB455983ED2D25E6FBEE1CF64DB9357B3F8B568D1B7F9`로 일치.
- 검증 결과: schema v3, `integrity_check=ok`, foreign key 위반 0건, filesystem 자산 0건.
- 생성 전후 운영 문서 3건, 일반 설정 23건, migration checkpoint 0건은 동일했다.
- online backup 이력만 7건에서 8건으로 1건 증가했으며 문서·설정 원장은 변경하지 않았다.
- 다운로드 검증 사본은 `C:\Tmp\mdviewer_1785985668831_514057443816.mdpbackup`에 보존했다.

### 오류와 복구 기록

- 첫 패키지 단위 테스트에서 DB schema를 `PRAGMA user_version`으로 읽어 0이 반환되어 manifest의 v3와 불일치했다.
- 이 프로젝트의 실제 schema 기준은 `schema_migrations.MAX(version)`임을 재확인해 validator를 같은 기준으로 수정했다.
- 오류가 발생한 패키지는 임시 테스트 data root 안에서 자동 삭제되었고 운영 DB에는 접근하지 않았다.
- 수정 후 정상·손상·경로 이탈·자산 불일치·미래 schema 테스트와 전체 회귀를 모두 통과했다.

### 복구 방법

- 코드 복구는 `backup/sqlite_backup_package_start_20260806_1159`의 같은 상대 경로 파일로 되돌린다.
- 새 파일 `LocalSave_sqlite/server/backup_packages.py`, `scripts/test-backup-packages.py`는 다른 변경 파일 복원 뒤 제거한다.
- DB 복구가 필요하면 현재 DB를 먼저 별도 보존하고 작업 전 `pre_update_1785985151535_b80cf589.sqlite`의 SHA-256과 무결성을 확인한 뒤 복원한다.
- Phase 6A는 운영 DB 교체 기능이 없으므로 생성된 `.mdpbackup` 또는 `exports/` 파일을 제거하지 않아도 앱 저장 동작에는 영향을 주지 않는다.
- 이전 코드로 복구한 뒤 PID `33328` 서버를 재시작해야 이전 capability와 cache version이 반영된다.

### 완료 복구 지점

- 코드: `backup/sqlite_backup_package_20260806_1209`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785985757003_3c42986a.sqlite`
- DB backup SHA-256: `8FEBDF94FA93DE3A4C90372CC2C19186C0ED63422408C409A776BBF3D1EFAA29`
- 완료 backup 생성 전 `integrity_check=ok`, foreign key 위반 0건을 확인했다.

---

## 2026-08-06 12:18 KST — 작업 018 — Phase 6B 복원 파일 선택·격리 검증 미리보기

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_restore_preview_start_20260806_1211`
- SQLite online backup: `LocalSave_sqlite/data/backups/pre_update_1785985909627_f5b166ff.sqlite`
- DB backup SHA-256: `41E90CE194FFC71F4489552B05A46B27FD98239115AA0B057B1C5DF41367E496`
- server package/API, adapter/service, 설정 UI, HTML, 테스트, 계획서·이력 11개 파일을 작업 전 snapshot에 보존했다.

### 단계 범위와 안전 정책

- 사용자가 선택한 `.mdpbackup`을 검증하고 복원 대상 수량을 보여주는 미리보기까지만 구현했다.
- 업로드 패키지는 원래 PC 경로나 파일명을 서버 저장 경로로 사용하지 않고 `LocalSave_sqlite/data/imports` 아래의 UUID 기반 `restore_*` ID로 staging한다.
- 검증 실패 패키지와 임시 upload 파일은 즉시 제거한다.
- 정상 패키지는 다음 단계의 명시적 복원 확인에 사용할 수 있도록 패키지와 JSON metadata 두 파일로 보존한다.
- 현재 DB·WAL·assets를 교체하는 코드와 복원 실행 버튼은 추가하지 않았고 `restore=false`를 유지했다.

### 실제 구현

1. streaming upload와 격리 staging
   - `stage_restore_preview()`가 HTTP body를 최대 1MB chunk로 직접 staging 파일에 기록해 전체 패키지를 서버 메모리에 올리지 않는다.
   - Content-Length 누락·0 byte·8GB 초과·전송 중단·`.mdpbackup`이 아닌 파일명을 차단한다.
   - 브라우저 파일명은 URL encoding한 표시용 header로만 전달하고 slash/backslash 앞부분을 제거해 basename만 metadata에 남긴다.
   - 서버가 만든 `restore_<32 hex>` ID와 data root 내부 고정 imports root만 사용하므로 사용자 입력으로 임의 경로를 열 수 없다.

2. 복원 전 검증과 미리보기 데이터
   - Phase 6A validator를 그대로 재사용해 ZIP 경로, 필수/미선언/중복 entry, manifest format, DB·자산 크기와 SHA-256을 검사한다.
   - 임시 DB에서 `schema_migrations.MAX(version)`, `integrity_check`, `foreign_key_check`를 확인한다.
   - 현재 앱과 다른 미래 schema, checksum·size 불일치, 손상 DB, 자산 집합 불일치를 staging 완료 전에 차단한다.
   - 검증된 DB의 활성 문서·폴더, 문서 버전, 설정, 자산, file entry 건수를 readonly로 집계해 미리보기 응답에 포함한다.
   - 응답은 package checksum, DB 크기, manifest 자산 수와 검증 결과를 포함하지만 문서 본문이나 자산 byte는 포함하지 않는다.

3. 세션 보호 API와 storage 연결
   - health에 `restorePreview=true`, `restore=false`를 명시했다.
   - `POST /api/sqlite/backups/restore/preview`는 실행 세션과 전용 backup MIME 또는 octet-stream만 허용한다.
   - `SqliteApiAdapter.previewBackupRestore(File)`과 `MDPStorage.previewBackupRestore()`를 연결했다.
   - adapter는 File/Blob만 허용하고 binary body, encoded 표시 파일명, 로컬 세션 header를 전송한다.

4. 설정 UI
   - SQLite 설정 영역에 `.mdpbackup` 전용 `복원 파일 선택`과 `복원 미리보기`를 추가했다.
   - 선택 전에는 서버 capability와 파일 유무에 따라 버튼을 비활성화한다.
   - 검증 성공 시 문서·폴더·버전·설정·자산·파일 수, schema, DB/자산 크기, SHA-256, integrity/FK 결과를 표시한다.
   - 화면에 staging만 완료되었고 현재 DB/assets는 바뀌지 않았으며 실제 복원 버튼은 없다고 명시한다.
   - 실패 시 staging 제거와 현재 DB 불변을 안내한다.

### 변경 파일

- 변경: `LocalSave_sqlite/server/backup_packages.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `js/storage/sqlite-api-adapter.js`
- 변경: `js/storage/storage-service.js`
- 변경: `Setting/settings-ui.js`
- 변경: `index.html`
- 변경: `scripts/test-backup-packages.py`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `scripts/test-storage-service.js`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python/Node 변경 파일 구문 검사: 통과
- 정상 package streaming staging과 package/metadata 생성: 통과
- 한글 표시 파일명 보존과 서버 UUID 경로 사용: 통과
- staging DB의 문서·설정·자산 수량 미리보기: 통과
- 손상 package 업로드 차단 후 staging 잔여 파일 0: 통과
- 잘못된 확장자와 Content-Length보다 짧은 upload 차단: 통과
- 세션 없는 binary upload 403, 세션 upload 성공: 통과
- 복원 미리보기 전후 live 문서·폴더·설정·backup·checkpoint 수 불변: 통과
- UI에 파일 선택·미리보기·실제 복원 비활성 안내 존재: 통과
- SQLite backup package/server core/IndexedDB migration/HTTP/storage service 전체 테스트: 통과
- 기존 Crossref/Markdown/Mermaid/APA 회귀 테스트 4종: 통과

### 운영 서버 검증

- 기존 PID `33328`이 이 프로젝트 `run.py`인지 확인하고 새 코드로 PID `23492`에서 재기동했다.
- schema v3, `restorePreview=true`, `restore=false`, `available=true`를 확인했다.
- Phase 6A 운영 package `mdviewer_1785985668831_514057443816.mdpbackup`을 `운영-복원-미리보기.mdpbackup` 이름으로 preview upload했다.
- staging ID: `restore_54301ab81e61426a973d3f2dc90a3aad`.
- package SHA-256: `5D122497DD0D29E41DFDB455983ED2D25E6FBEE1CF64DB9357B3F8B568D1B7F9`.
- package 결과: schema v3, `integrity_check=ok`, FK 위반 0, 문서 3, 폴더 1, 버전 3, 설정 23, 자산 0.
- preview 전후 live 문서 3, 설정 23, backup 10, migration checkpoint 0이 각각 동일했다.
- live DB도 다시 `integrity_check=ok`를 확인했다.
- 정상 staging 결과로 package와 metadata 2개 파일만 imports root에 추가되었으며 live DB/assets는 수정하지 않았다.

### 오류와 복구 기록

- 이번 단계의 구문·단위·HTTP·storage·운영 preview에서 새 오류는 발생하지 않았다.
- 정상 staging 파일은 실패 잔여물이 아니라 다음 단계 복원 확인을 위한 검증 완료 입력이다.
- 실제 복원 기능이 없으므로 이번 단계에서 DB 교체·rollback 오류 가능성은 발생하지 않는다.

### 복구 방법

- 코드 복구는 `backup/sqlite_restore_preview_start_20260806_1211`의 같은 상대 경로 파일을 사용한다.
- DB 복구가 필요하면 현재 DB를 먼저 별도 보존하고 작업 전 `pre_update_1785985909627_f5b166ff.sqlite`의 SHA-256과 무결성을 확인한 뒤 복원한다.
- 이번 단계에서 live DB는 변경하지 않았으므로 일반적으로 코드 복원과 서버 재시작만 필요하다.
- staging을 정리해야 할 때는 먼저 다음 단계 복원에 필요하지 않은지 확인한 뒤 `LocalSave_sqlite/data/imports/restore_54301ab81e61426a973d3f2dc90a3aad.*` 두 파일만 대상으로 한다.
- 이전 코드로 복구한 뒤 PID `23492` 서버를 재시작해야 이전 capability와 cache version이 반영된다.

### 완료 복구 지점

- 코드: `backup/sqlite_restore_preview_20260806_1218`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785986278798_b698d492.sqlite`
- DB backup SHA-256: `3949E42D2759C394114FB743C21BF2F395A3A0B4D893AA234C555D169E1AB9BD`
- 완료 backup 생성 전 `integrity_check=ok`, foreign key 위반 0건을 확인했다.
