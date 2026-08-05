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
