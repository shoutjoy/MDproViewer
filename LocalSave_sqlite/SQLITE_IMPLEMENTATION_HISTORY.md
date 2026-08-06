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

---

## 2026-08-06 12:47 KST — 작업 019 — Phase 6C 실제 복원·자동 백업·rollback

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_restore_apply_start_20260806_1234`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785987300228_7fda5e2f86dc.mdpbackup`
- 패키지 SHA-256: `CF48D0674988B5209E79AE260460E7DCB2E624FFC75B750214F9892F1704753A`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785987300141_32012afc.sqlite`
- DB backup SHA-256: `0A8BE4AAB1F63428152B68FCE87D4783CB57864F5D10317902E6335F7680BB48`
- 작업 전 패키지의 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.

### 단계 범위와 안전 정책

- Phase 6B에서 검증 완료된 `restore_<UUID>` staging과 미리보기 SHA-256이 일치할 때만 실제 복원을 허용한다.
- 복원 시작 직전에 현재 DB와 연결 자산 전체를 별도 `.mdpbackup`으로 자동 보존하고, 그 내부 DB도 SQLite online backup으로 만든다.
- 교체 중에는 같은 서버 프로세스의 신규 읽기·쓰기를 maintenance lock으로 막고 기존 연결이 닫힌 뒤 WAL checkpoint를 수행한다.
- DB와 assets는 data root 내부의 생성된 임시 경로에서 준비하고, 같은 볼륨의 `os.replace`로 전환한다.
- DB와 assets를 모두 교체해 재초기화·무결성·FK·수량·자산 checksum 검증까지 성공해야 적용 완료로 기록한다.
- 어느 단계에서든 실패하면 임시 rollback 영역의 기존 DB·WAL·SHM·assets를 원래 위치로 복귀하고 DB를 다시 초기화한다.
- 이미 적용된 staging은 `status=applied`로 바뀌며 같은 import ID를 다시 적용할 수 없다.

### 실제 구현

1. DB 연결과 maintenance lock
   - `DatabaseManager`의 initialize/read/write/online backup 연결이 공통 `_access_lock`에 참여하도록 변경했다.
   - `exclusive_maintenance()`, `checkpoint_for_replacement()`, `reload_replaced_database()`를 추가했다.
   - Windows에서 열린 SQLite handle 때문에 파일 교체가 실패하지 않도록 모든 연결 종료를 기다린 뒤 교체한다.

2. 검증된 staging 적용
   - `apply_staged_restore()`는 명시적 confirmation 문자열, 안전한 import ID, metadata 상태, preview/package SHA-256을 다시 확인한다.
   - 적용 직전 package 전체를 다시 검증하고 DB/assets를 UUID 기반 작업 디렉터리에 안전하게 streaming 추출한다.
   - 복원 서비스 단위 lock을 추가해 같은 staging에 대한 동시 apply를 직렬화했다.
   - 현재 전체 `.mdpbackup`과 `pre_update` online backup을 만든 후 live DB/assets를 rollback 영역으로 이동하고 준비 파일을 설치한다.
   - 새 DB의 schema 초기화, `integrity_check`, `foreign_key_check`, 문서·폴더·버전·설정·자산·file entry 수량과 모든 자산 checksum을 재검증한다.
   - 성공 시 staging metadata에 적용 시각, 자동 백업, 검증 결과를 기록하고 임시 rollback 파일을 정리한다.
   - 강제 오류 주입 테스트 hook을 통해 교체 후 실패 시 기존 DB와 자산이 실제로 되돌아오는 것을 검증했다.

3. API와 저장 파사드
   - health capability를 `restore=true`로 전환했다.
   - session-protected `POST /api/sqlite/backups/restore/apply`를 추가했다.
   - `SqliteApiAdapter.applyBackupRestore()`와 `MDPStorage.applyBackupRestore()`를 연결했다.
   - API는 import ID, preview SHA-256, 고정 confirmation을 모두 요구한다.

4. 설정 UI
   - 미리보기 성공 후에만 `검증된 백업 복원` 버튼을 활성화한다.
   - 복원 전 현재 데이터가 자동 백업되고 실패 시 rollback된다는 확인 대화상자를 표시한다.
   - 성공 후 문서·폴더·설정·자산 수량과 integrity/FK 결과, 복원 직전 백업 파일명을 표시한다.
   - 자동 백업을 즉시 내려받는 버튼과 새 DB로 다시 연결하는 명시적 앱 새로고침 버튼을 제공한다.
   - 캐시 버전을 `20260806-restore-apply-1`로 갱신했다.

### 변경 파일

- 변경: `LocalSave_sqlite/server/database.py`
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
- 정상 staging을 실제 DB·설정·자산에 적용하고 preview 수량과 일치 확인: 통과
- 명시적 confirmation 없는 복원 차단: 통과
- 적용 완료 staging 재사용 차단: 통과
- 복원 직전 전체 `.mdpbackup`과 `pre_update` online backup 생성: 통과
- 교체 직후 강제 오류 주입과 기존 문서·자산 자동 rollback: 통과
- rollback 후 `integrity_check=ok`, foreign key 위반 0건: 통과
- session 없는 restore apply 403과 session apply 성공: 통과
- 복원 후 새로 만든 임시 문서 제거, 문서 수량·검색·설정 API 정상: 통과
- SQLite package/server core/IndexedDB migration/HTTP/storage service 테스트 6종: 통과
- Academic Crossref, Markdown bold, Mermaid label sanitizer, Scholarref APA 회귀 테스트 4종: 통과
- 변경 파일 `git diff --check`: 통과

### 운영 서버 검증

- 기존 PID `23492`가 이 프로젝트 `run.py`인지 확인하고 새 코드로 PID `42340`에서 재기동했다.
- schema v3, `available=true`, `restorePreview=true`, `restore=true`를 확인했다.
- live DB는 `integrity_check=ok`, foreign key 위반 0, 문서 3, 폴더 1, 설정 23을 확인했다.
- 운영 데이터 보호를 위해 live DB에는 실제 restore apply를 실행하지 않았다. 실제 적용·rollback은 격리된 임시 data root와 HTTP 서버에서 검증했다.
- 물리적인 다른 PC에서의 파일 이동·복원 검증은 Phase 6D 체크 항목으로 남겼다.

### 오류와 복구 기록

- 작업 전 전용 `/api/sqlite/backups`를 호출했으나 구현되지 않은 경로라 `NOT_FOUND`가 반환됐다. 요청은 데이터 변경 없이 끝났고, 기존 검증된 `/backups/packages`로 전체 작업 전 백업을 생성했다.
- 기존 회귀 테스트 파일명을 잘못 지정해 Node `MODULE_NOT_FOUND` 4건이 발생했다. 실제 파일명 `test-academic-search-crossref.js`, `test-markdown-bold.js`, `test-mermaid-label-sanitizer.js`, `test-scholarref-apa-format.js`를 찾아 재실행해 모두 통과했다.
- 로컬 UI 시각 점검 중 Edge 확장 연결이 두 번 timeout으로 초기화됐고 내장 브라우저는 제공되지 않았다. 운영 DB 변경이나 업로드는 실행되지 않았으며, UI 구문·정적 계약·storage 요청 테스트로 대체 검증했다.
- 서버 복원 코어, rollback, HTTP API에서는 새 오류가 발생하지 않았다.

### 복구 방법

- 코드 복구는 `backup/sqlite_restore_apply_start_20260806_1234`의 같은 상대 경로 파일을 사용한다.
- 전체 데이터 복구는 작업 전 `.mdpbackup`을 설정의 복원 미리보기에서 검증한 후 적용한다.
- DB만 수동 복구해야 하면 현재 DB를 먼저 별도 보존하고 작업 전 `manual_1785987300141_32012afc.sqlite`의 SHA-256과 무결성을 확인한 뒤 서버를 종료한 상태에서 복원한다.
- API가 `RESTORE_ROLLBACK_FAILED`를 반환한 경우 서버를 중지하고 오류 응답의 generated rollback 디렉터리와 자동 pre-restore package를 삭제하지 않은 채 작업일지 기준으로 수동 복구한다.
- 이전 코드로 복구한 뒤 PID `42340` 서버를 재시작해야 이전 capability와 cache version이 반영된다.

### 완료 복구 지점

- 코드: `backup/sqlite_restore_apply_20260806_1247`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785988034420_1dbd4cc9720f.mdpbackup`
- 패키지 SHA-256: `26FC16B2B865A5DFCC9230F447CCE64DC7D82B4CA63B38937DEF5A99196515C8`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785988034324_ffc80969.sqlite`
- DB backup SHA-256: `E8D6EAC6486A675597C2AAD4B8814BD42E869B2D7B9DE8EA7FA1A9D9308AFB46`
- 완료 package 생성 시 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.

---

## 2026-08-06 13:21 KST — 작업 021 — Phase 7A-1 배경 제거 ONNX 모델 SQLite BLOB 저장

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_onnx_model_start_20260806_1313`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785989611206_f29e80af43a5.mdpbackup`
- 패키지 SHA-256: `3AB1DC4C75CC02352E5416B35D99CA841E9E4384E82F82A25DD7E1876F5DE8C5`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785989610976_19e25913.sqlite`
- DB backup SHA-256: `03BF2D2763EDD95F6EBE4F7887C17BE33E1EAAF87AF275F84EAE8CA1FE8C5AA8`
- 작업 전 package의 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.

### 저장 구조와 안전 정책

- 약 176MB ONNX 모델 원본은 filesystem 자산이 아니라 SQLite `asset_blobs.blob_data` 내부에 저장한다.
- Python 3.10에 `sqlite3.Connection.blobopen()`이 없어 전체 모델을 한 번에 메모리에 복사하지 않고 4MB chunk별 asset/blob row로 분할한다.
- 모든 chunk, 전체 SHA-256, 순서 manifest, file entry 교체와 이전 chunk 삭제를 하나의 `BEGIN IMMEDIATE` 트랜잭션으로 처리한다.
- 업로드가 중단되거나 크기·형식 검증이 실패하면 신규 chunk와 source 변경 전체를 rollback한다.
- 브라우저는 고정 모델 키 `u2net_human_seg`와 바이너리만 보내며 SQL·테이블·파일 경로를 지정하지 못한다.

### 실제 구현

1. SQLite 모델 자산 서비스
   - `ModelAssetService`를 추가하고 `u2net_human_seg.onnx`만 허용했다.
   - 100,000,000바이트 미만, 512MB 초과, `.onnx`가 아닌 파일명, HTML/XML/JSON 오류 응답을 차단한다.
   - 4MB 단위 `assets(storage_type='sqlite_blob')`와 `asset_blobs`를 생성하고 `file_entries.content_text`에 순서 manifest를 기록한다.
   - 전체 SHA-256·크기·chunk 수를 metadata로 반환하고 같은 모델 재저장은 기존 chunk를 유지한다.
   - 다른 모델로 교체가 완료된 뒤에만 이전 chunk asset을 삭제한다.

2. 세션 보호 API
   - health/session capability `modelAssets=true`를 추가했다.
   - `GET /api/sqlite/models/u2net_human_seg`에서 저장 여부·크기·checksum·chunk 수를 조회한다.
   - `POST /api/sqlite/models/u2net_human_seg`에서 raw ONNX binary를 SQLite BLOB으로 저장한다.
   - `GET /api/sqlite/models/u2net_human_seg/download`에서 chunk 순서대로 원본 bytes를 streaming 반환한다.
   - 다운로드 응답에 원본 크기, UTF-8 파일명, SHA-256 header를 포함한다.

3. fmaviewer 배경 제거 연결
   - SQLite 모드의 모델 탐색 순서를 `앱 폴더 -> SQLite -> IndexedDB -> 원격`으로 연결했다.
   - 원격 자동 다운로드나 `ONNX 수동 선택` 모델을 SQLite에 우선 저장한다.
   - 기존 IndexedDB 모델을 발견하면 SQLite로 한 번 자동 이관하고 다음 실행부터 SQLite 모델을 사용한다.
   - SQLite 저장·불러오기가 실패하면 기존 IndexedDB와 현재 실행 object URL을 유지한다.
   - 모델 위치에 `SQLite 저장 모델`, 크기, SHA-256 앞 12자를 표시한다.
   - 기존 rembg-web object URL·세션 cache·모델 cache 복구 흐름은 변경하지 않았다.

4. 백업 연계
   - ONNX chunk는 SQLite DB 내부 row이므로 SQLite online backup과 `.mdpbackup`의 `mdpro.sqlite`에 자동 포함된다.
   - 격리 DB에서 package 내부 DB를 다시 열어 chunk row 수와 `SUM(LENGTH(blob_data))`가 원본과 같은지 검증했다.
   - 기존 schema v3의 `assets`, `asset_blobs`, `workspace_sources`, `file_entries`를 사용해 schema version 변경은 없다.

### 변경 파일

- 추가: `LocalSave_sqlite/server/model_assets.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `Apps/fmaviewer/js/storage/sqliteWorkfiles.js`
- 변경: `Apps/fmaviewer/js/image/backgroundRemove.js`
- 변경: `Apps/fmaviewer/index.html`
- 추가: `scripts/test-sqlite-model-assets.py`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `Apps/fmaviewer/tests/sqlite-workfiles.test.cjs`
- 변경: `Apps/fmaviewer/tests/background-remove-onnx.test.cjs`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python/Node 변경 파일 구문 검사: 통과
- chunk 저장·원본 byte/SHA-256 왕복·같은 모델 dedup·다른 모델 교체: 통과
- 중단된 upload의 신규 chunk rollback과 기존 모델 보존: 통과
- 잘못된 파일명·HTML 오류 응답·최소/최대 크기 차단: 통과
- 세션 없는 모델 상태·저장·다운로드 403과 세션 HTTP byte 왕복: 통과
- online backup/package 내부 SQLite BLOB row 수·전체 byte 수 일치: 통과
- SQLite server/work-file/model/HTTP/backup package/IndexedDB migration/storage service 테스트: 통과
- fmaviewer auth/background remove/SaveDB/image editor/MD Viewer bridge/SQLite adapter 회귀 테스트 6종: 통과
- 변경 파일 `git diff --check`: 통과

### 운영 서버 검증

- 기존 PID `32704`가 이 프로젝트의 `python.exe run.py`인지 확인하고 새 코드로 PID `26676`에서 재기동했다.
- schema v3, `modelAssets=true`, `integrity_check=ok`, foreign key 위반 0건을 확인했다.
- 앱 폴더에 실제 `.onnx` 파일이 없고 운영 SQLite 모델 상태는 `available=false`임을 확인했다.
- 실제 모델은 사용자가 `모델 자동 다운로드·연결` 또는 `ONNX 수동 선택`을 실행할 때 SQLite에 저장된다.
- 운영 DB에 임의 176MB 테스트 모델을 넣지 않았으며, 실제 API와 동일한 router의 격리 DB에서 byte 왕복을 검증했다.

### 오류와 복구 기록

- 첫 모델 단위 테스트에서 인스턴스에 최소 크기를 낮췄지만 classmethod가 운영 상수 100MB를 정상 적용해 `MODEL_FILE_TOO_SMALL`이 발생했다. 테스트 전용 클래스 상수만 격리 프로세스에서 조정해 재실행했다.
- HTML 오류 문서 탐지는 테스트 chunk 크기 7바이트에서 전체 `<!doctype html>` 문자열이 아직 들어오지 않아 1회 통과했다. 첫 chunk가 `<!`, `<html`, `<?xml`, `{`로 시작하면 즉시 차단하도록 보완했다.
- 완료 `.mdpbackup`이 약 104MB여서 내부 항목을 점검했다. 오류 파일이 아니라 사용자가 Phase 7A 작업파일 보관함에 저장한 97,841,395바이트 FMA asset 1개였고 manifest checksum과 DB 참조가 일치해 삭제하지 않고 보존했다.
- 사용자 ONNX 모델·IndexedDB·FMA 자산을 삭제하지 않았다.

### 복구 방법

- 코드 복구는 `backup/sqlite_onnx_model_start_20260806_1313`의 같은 상대 경로 파일을 사용한다. 새 `model_assets.py`와 모델 테스트 파일은 제거 대상이다.
- 전체 데이터 복구는 작업 전 `.mdpbackup`을 복원 미리보기에서 검증한 후 적용한다.
- DB만 수동 복구하려면 현재 DB와 filesystem assets를 먼저 보존하고 서버를 종료한 뒤 작업 전 online backup SHA-256·무결성을 확인한다.
- SQLite 모델 저장 오류가 나도 기존 IndexedDB 저장 모델과 앱 폴더/수동 선택 경로가 유지된다.
- 이전 코드로 복구한 뒤 PID `26676` 서버를 재시작해야 capability와 정적 파일 cache version이 반영된다.

### 완료 복구 지점

- 코드: `backup/sqlite_onnx_model_20260806_1321`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785990069202_7d24f552e64b.mdpbackup`
- 패키지 SHA-256: `5DD96F808667C91531522833FAA1E0DD8E7E035C1A5C12858AB34E990F91DA99`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785990068999_eacb33c3.sqlite`
- DB backup SHA-256: `11C3E0E5AD8F6054184F0C974499C8AF2765E9235B52614932547ADFAE0DC5DE`
- 완료 package는 사용자 FMA asset 1개(97,841,395 bytes)를 포함하며 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.

---

## 2026-08-06 18:21 KST — 작업 027 — Phase 0 누락 기준선과 GenSlide SQLite 저장

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_missing_phase0_genslide_start_20260806_1805` (12개 파일)
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1786007141621_eb44ab311526.mdpbackup`
- 패키지 SHA-256: `F5079DAD809CC4559FCDE633F5E4E5D457A302DC294FD7DFAB2D235B80672643`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1786007141404_c032ff1d.sqlite`
- DB backup SHA-256: `935B2BDBD413B08D9747F14CA7A4D3CFC0E5481299E8A236F865D32225F3BA82`
- 작업 전 DB: schema v3, `integrity_check=ok`, foreign key 위반 0건

### Phase 0 누락 항목 완료

1. 현재 IndexedDB 동작 기준선
   - `INDEXEDDB_BASELINE.md`에 `MarkdownProDB` v5 문서·폴더 CRUD, 이동·삭제와 제목 검색 동작을 기록했다.
   - `mdpro-indb-v1`의 meta/file store와 통합 백업 경계를 기록했다.
   - 본문 FTS는 현재 IndexedDB 목록 검색 기능이 아니라 SQLite 전용임을 명시해 회귀 기대값을 분리했다.

2. 안전한 샘플 백업과 선택 필드
   - `baselines/indexeddb_sample_backup.json`에 두 DB의 합성 fixture를 만들었다.
   - fixture에는 실제 사용자 본문, API key, 토큰, 비밀번호가 없으며 SHA-256으로 변경 여부를 고정했다.
   - 문서 선택 필드 `googleDocId`와 문서 레코드가 아닌 설정에서 관리되는 GitHub 저장소·브랜치·경로를 구분했다.
   - in-memory IndexedDB adapter로 생성·열기·수정·이동·삭제·제목 검색을 자동 재현했다.

### GenSlide 실제 구현

1. 서버 작업파일 형식과 안전 검증
   - `genslide_mpp`(256MB), `genslide_pptx`(1GB), `genslide_png`(512MB), `genslide_image_zip`(1GB)를 범용 작업파일에 추가했다.
   - MPP v2의 format/version/currentIndex/slides/images, embedded image MIME·base64·개수·총량을 검증한다.
   - PPTX/ZIP은 경로 이탈·중복·암호화 entry·압축해제 상한을 막고 PPTX 필수 OOXML entry와 이미지 ZIP의 PNG 전용 정책을 확인한다.
   - PNG signature·IHDR·가로/세로 크기를 검증하고 원본 SHA-256·byte size를 유지한다.

2. GenSlide 화면과 기존 기능 연결
   - 상단에 `SQLite 저장`, `SQLite 열기`, `SQLite 자동: OFF/ON` 버튼을 추가했다.
   - SQLite 저장은 현재 덱과 IndexedDB embedded images를 MPP v2 원본으로 보관한다.
   - SQLite 열기는 MPP를 기존 `importMpp`, PPTX를 기존 `importPptxToGenSlide` 경로로 전달한다. PNG/ZIP 결과는 원본 다운로드로 연다.
   - 자동 저장은 기본 OFF이며 사용자가 명시적으로 켰을 때만 inDB 저장, MPP/PPTX import, MPP/PPTX/PNG/ZIP export 결과를 SQLite에 복제한다.
   - 기존 inDB, MPP/PPTX 파일 import/export, PNG/ZIP 다운로드 흐름은 제거하거나 대체하지 않았다.

3. 하위 앱 저장 인벤토리
   - `MD_VIEWER_APP_SQLITE_ARTIFACT_CLASSIFICATION.md`에 문서·양식·참고문헌·하이라이트·AI 대화·prompt·이미지·History·GenSlide·외부 동기화·검색의 현재 원본과 SQLite 경계를 정리했다.
   - Reference/Crossref Markdown과 GenSlide 원본 저장 범위는 완료 처리했다.
   - 하이라이트, AI 대화, prompt/run, 주 문서 이미지, workspace snapshot, 동기화 revision, 통합 FTS는 전용 schema가 없어 Phase 7C 후속 항목으로 명시했고 완료 표시하지 않았다.

### 변경·추가 파일

- 서버: `LocalSave_sqlite/server/work_files.py`, `LocalSave_sqlite/server/api.py`
- GenSlide: `js/Html2pptx/jenaEditor/ui/header.html`, `index.html`, `js/controller.js`, `js/main.js`, `js/sqliteStorage.js`, `js/Export/mppExport.js`, `pptExport.js`, `imageExport.js`
- 기준선·분류: `LocalSave_sqlite/INDEXEDDB_BASELINE.md`, `LocalSave_sqlite/baselines/indexeddb_sample_backup.json`, `LocalSave_sqlite/MD_VIEWER_APP_SQLITE_ARTIFACT_CLASSIFICATION.md`
- 테스트: `scripts/test-indexeddb-baseline.js`, `test-indexeddb-adapter-crud.js`, `test-genslide-sqlite-storage.js`, `test-genslide-sqlite-storage-runtime.js`, `test-sqlite-work-files.py`, `test-sqlite-http-api.py`
- 문서/cache: 계획서, 작업일지, 루트 `index.html`

### 자동·운영 검증

- Node 13종: Phase 0 adapter/fixture, IndexedDB migration, storage service, Reference/Crossref, GenSlide source/runtime, 유지보수·백업·FMA·도구 보관함 회귀 통과
- Python 10종: server core, HTTP API, IndexedDB migration preview, 작업파일 왕복·안전 검증, ONNX, FMA preview, 도구 설정, 백업 탐색·package, instance lock 통과
- MPP/PPTX/PNG/이미지 ZIP: 저장·목록·검색·원본 다운로드·checksum·전체 backup package 포함과 잘못된 형식 차단 통과
- 운영 서버를 PID `42236`으로 새 코드 재시작: schema v3, `workFiles=true`, integrity `ok`, foreign key 위반 0건
- 실제 동일 data root의 두 번째 `run.py`: exit code 1로 차단
- 운영 사용자 DB에 검증용 GenSlide 파일은 저장하지 않았다.

### 오류와 복구 기록

- 최초 회귀 명령은 테스트가 실제 `scripts/`에 있는데 `LocalSave_sqlite/scripts/`로 지정해 `MODULE_NOT_FOUND`가 발생했다. 제품 코드와 데이터 변경 없이 경로만 수정해 전체 테스트를 다시 통과했다.
- Phase 0 fixture 최초 checksum 기대값이 생성 파일의 실제 SHA-256과 달라 테스트 1회가 실패했다. fixture 자체를 바꾸지 않고 고정 기대값을 실제 SHA-256 `4430DADF611CB0EF4309A33A521B84A75F8771A6B2B00BDED86002F9CEE02C54`로 수정했다.
- browser control skill은 설치된 런타임과 문서 경로의 버전이 달라 초기화하지 못했다. 실제 사용자 Chrome/IndexedDB를 조작하지 않고 합성 IndexedDB runtime test와 로컬 HTTP 응답 검증으로 대체했다.
- 정적 반영 확인에서 존재하지 않는 `controller.html` URL을 요청해 404가 1회 발생했다. 실제 파일 `js/controller.js`와 `js/sqliteStorage.js`의 HTTP 응답으로 cache version과 로딩 순서를 재확인했다.
- 사용자 문서, IndexedDB, 기존 SQLite 작업파일, FMA, ONNX를 삭제하거나 변환하지 않았다.

### 복구 방법

- 작업 전체를 되돌리려면 서버 PID `42236`을 종료하고 `backup/sqlite_missing_phase0_genslide_start_20260806_1805`의 같은 상대 경로 파일을 복원한다.
- 이번에 새로 만든 `sqliteStorage.js`, 기준선 문서·fixture와 신규 테스트는 작업 전 snapshot에 없으므로 코드 롤백 시 제거 대상이다.
- 데이터 복구는 작업 전 `.mdpbackup`을 설정의 복원 미리보기로 검증한 뒤 적용한다. 이번 테스트는 사용자 GenSlide 자산을 운영 DB에 쓰지 않았다.
- GenSlide SQLite 저장에 실패해도 SQLite 자동 저장을 끄고 기존 inDB, MPP/PPTX import/export, PNG/ZIP 다운로드를 계속 사용할 수 있다.
- 복원 뒤 서버를 다시 시작해 Python module과 정적 cache version을 적용한다.

### 완료 복구 지점

- 코드: `backup/sqlite_phase0_genslide_complete_20260806_1822` (22개 파일)
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1786008168850_fe117a52f24c.mdpbackup`
- 패키지 SHA-256: `B9734FC32A228145B2E8A873F1B9DC9EEF88C1CBEFF04B268A069AA47C5CCFFA`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1786008168675_4d83dd92.sqlite`
- DB backup SHA-256: `2137ACE1C25F83EE5403DAE3909F1A7A6232DD80A0EF05ECBBD8DAEF2C1D04B`
- 완료 package: 104,275,558 bytes, schema v3, integrity `ok`, foreign key 위반 0, 사용자 FMA 자산 1개 포함

---

## 2026-08-06 16:38 KST — 작업 026 — 빠진 유지보수 항목과 추가 앱 저장 요구사항

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_missing_items_start_20260806_1612` (8개 파일, 570,456 bytes)
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785999932291_553ac7d31231.mdpbackup`
- 패키지 SHA-256: `6FB97CB1D852832619A69AD81E0E15012898C5B2A8D6B3CDF2568AF67BF055E5`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785999932053_1a6a3c3b.sqlite`
- DB backup SHA-256: `FCA0735D45850FF3B531DB42267D63D3B49534BB32EB65788C125B72B8BF88A7`

### 빠진 항목 구현

1. 설정의 SQLite 유지보수
   - 설정 화면에 `DB 무결성 검사` 버튼과 integrity/FK 결과 영역을 추가했다.
   - `MDPStorage.runSqliteIntegrityCheck`로 세션 보호 API를 호출하며 연결 실패와 검사 실패 시 현재 DB가 변경되지 않았음을 안내한다.
   - OneDrive·NAS·공유 폴더의 같은 DB 동시 쓰기 비지원과 PC 간 `.mdpbackup` 이동 원칙을 화면에 표시했다.

2. 동일 DB 중복 실행 차단
   - `run.py`가 data root의 `mdviewer.instance.lock`을 OS file lock으로 실행 동안 유지한다.
   - Windows `msvcrt.locking`, POSIX `fcntl.flock`을 사용하며 두 번째 서버는 DB를 열기 전에 종료한다.
   - lock metadata에는 PID, 시작 시각, DB 파일명만 기록하고 절대 경로·본문·키를 기록하지 않는다.
   - 직접 DB 위치는 서버 시작 전 `MD_VIEWER_SQLITE_ROOT`/`MD_VIEWER_SQLITE_PATH` 환경 옵션으로만 허용한다.
   - 실시간 다중 PC는 상시 호스트·인증·TLS·충돌 정책이 필요한 별도 후속 구조로 문서화했다.

### 추가 항목 조사와 실제 구현

1. 저장 대상 분류
   - `MD_VIEWER_APP_SQLITE_ARTIFACT_CLASSIFICATION.md`에 GenSlide inDB/MPP/PPTX/image, 사용자 양식, Reference, Crossref의 형식·MIME·상한·현재 함수·후속 저장 위치를 기록했다.
   - 활성 GenSlide 경로가 복제 폴더가 아닌 `js/Html2pptx/**`임을 확정했다.
   - GenSlide는 MPP 원본 -> PPTX 원본 -> PNG/ZIP 결과 순서로 후속 구현하도록 분리했다.

2. 사용자 양식
   - 사용자 양식이 `templateCustomList`로 `setAiSettings`와 SQLite 안전 설정 미러링을 통과함을 확인했다.
   - 서버 정책 `collections/workspace/array/4MB`, MD import/export, 현재/새 문서 삽입, SQLite 탐색기 설정 상세 표시를 source contract와 storage service 테스트로 고정했다.

3. Reference management와 Crossref
   - 범용 작업파일에 `scholar_references_md`, `crossref_markdown`을 추가했다.
   - `.md`, UTF-8, 비어 있지 않음, 최대 8MB를 서버에서 검증하고 원본 SHA-256과 자산을 백업에 포함한다.
   - 공용 SQLite adapter/service에 세션 보호 저장·목록·다운로드를 추가했다.
   - Reference 저장 목록에 `SQLite 저장`·`SQLite 가져오기`를 추가했다. 가져온 MD는 기존 MD import와 같은 입력 탭에서 확인한 뒤 inDB에 병합한다.
   - Crossref 결과의 GitHub 버튼 오른쪽에 `SQLite 저장`·`SQLite 가져오기`를 추가했다. 사용자가 수정한 MD를 그대로 저장하고 편집/PV 화면으로 다시 불러온다.
   - 기존 inDB, MD/TXT 파일, GitHub 경로는 제거하거나 변경하지 않았다.

### 변경·추가 파일

- 유지보수/잠금: `Setting/settings-ui.js`, `js/storage/storage-service.js`, `run.py`, `LocalSave_sqlite/server/instance_lock.py`, `LocalSave_sqlite/SQLITE_LOCAL_SERVER_SHARING_POLICY.md`
- 작업파일 서버/adapter: `LocalSave_sqlite/server/work_files.py`, `LocalSave_sqlite/server/api.py`, `js/storage/sqlite-api-adapter.js`
- 학술 기능: `js/Scholarref/scholarref.js`, `js/Scholarref/scholarsearch-shell.js`, `js/Scholarref/scholarsearch-shell.html`
- 문서: `LocalSave_sqlite/MD_VIEWER_APP_SQLITE_ARTIFACT_CLASSIFICATION.md`, 계획서와 작업일지
- 테스트: `test-sqlite-instance-lock.py`, `test-sqlite-maintenance-ui.js`, `test-sqlite-app-artifact-classification.js`, `test-storage-service.js`, `test-sqlite-work-files.py`와 cache version 관련 회귀 테스트
- cache version: `index.html`

### 자동·운영 검증

- Node: storage service, Crossref, Scholarref APA, 분류 source contract, 유지보수 UI, 백업/FMA 탐색 UI, 암호화 보관함 8종 통과
- Python: server core, HTTP API, IndexedDB 이관, 작업파일, ONNX, FMA preview, 설정 정책, 백업 탐색, 전체 backup package, instance lock 10종 통과
- Reference/Crossref Markdown 원본 저장·목록·다운로드·checksum·잘못된 UTF-8·8MB 초과 차단·전체 백업 포함: 통과
- 사용자 양식 `templateCustomList`만 SQLite 설정 API에 전달되고 API key는 전달되지 않음: 통과
- 운영 서버 PID `38552`: schema v3, `available=true`, `workFiles=true`, integrity `ok`, foreign key 위반 0건
- 실제 동일 data root의 두 번째 `run.py`: 5초 안에 종료, exit code 1로 중복 실행 차단 확인
- 운영 사용자 DB에 검증용 Reference/Crossref 파일은 저장하지 않았다.

### 오류와 복구 기록

- lock 단위 테스트 최초 실행은 Windows에서 잠긴 첫 바이트를 테스트가 직접 읽어 실패했다. metadata 검사는 lock 해제 뒤 수행하도록 테스트 순서를 수정했고 남은 임시 폴더 1개를 범위 확인 후 제거했다. 사용자 DB 변경은 없었다.
- storage service 작업파일 다운로드 mock의 예상 크기를 27 bytes로 잘못 기록해 크기 불일치가 1회 발생했다. 실제 Blob 26 bytes에 맞춰 mock만 수정한 뒤 통과했다.
- 유지보수 UI 계약 테스트가 화면의 구분자 `·`와 정책 문장의 `열어 쓰는` 표현을 너무 좁은 정규식으로 비교해 2회 실패했다. 실제 문구에 맞게 계약식을 수정했으며 제품 코드 오류는 아니었다.
- 기존 서버 PID `22580`은 일반 권한 종료가 거부되어 승인된 상승 권한으로 해당 PID만 종료했다. 새 서버 PID `38552`를 숨김 창으로 시작했다.
- 사용자 문서, FMA, ONNX, IndexedDB, 기존 SQLite 작업파일을 삭제하거나 변환하지 않았다.

### 복구 방법

- 작업 전체를 되돌리려면 서버 PID `38552`를 종료하고 `backup/sqlite_missing_items_start_20260806_1612`의 같은 상대 경로 파일을 복원한다.
- 이번에 새로 추가된 `instance_lock.py`, 공유 정책/분류 문서와 신규 테스트는 작업 전 snapshot에 없으므로 코드 롤백 시 제거 대상이다.
- 데이터 복구는 작업 전 `.mdpbackup`을 설정의 복원 미리보기로 검사한 뒤 적용한다. 현재 사용자 데이터는 이번 기능 검증으로 변경하지 않았고 완료 package 생성에 따른 backup history만 추가됐다.
- Reference/Crossref SQLite 저장에 실패해도 기존 inDB, MD/TXT 다운로드·가져오기와 GitHub 경로를 계속 사용할 수 있다.
- 이전 코드 또는 완료 코드로 전환한 뒤 로컬 서버를 재시작해 Python module과 정적 cache version을 적용한다.

### 완료 복구 지점

- 코드: `backup/sqlite_missing_items_complete_20260806_1638`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1786001854366_d63ee1b7fc11.mdpbackup`
- 패키지 SHA-256: `8AAA7204CA601D1679A6C9CDBB4D53D1C906E6244DFDE5FF6E260A5CF25A9C69`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1786001854135_1dab4a5a.sqlite`
- DB backup SHA-256: `AC170FEFB28D00F043A096B3A33A17C921BE2F4D5613627F8EC0DCAC8BCEE088`
- 완료 package: 104,275,250 bytes, schema v3, integrity `ok`, foreign key 위반 0, 사용자 FMA 자산 1개 포함

---

## 2026-08-06 14:45 KST — 작업 024 — Phase 7B-1 fmaviewer 저장 분류·AI Jena 참고 세팅

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_fmaviewer_presets_start_20260806_1436`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785992135151_091ee8179a71.mdpbackup`
- 패키지 SHA-256: `B1B8981AD7E730776EB60FDDB1776F1A1E8F54AEE70490CE9C0F757866E52B54`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785992134920_5db60198.sqlite`
- DB backup SHA-256: `B8050DB5057C6CB876794CBFB6B0704DE0FC39F3F31F8D9FD220495CB60E00AA`

### 조사와 저장 분류

- `LocalSave_sqlite/FMAVIEWER_SQLITE_ARTIFACT_CLASSIFICATION.md`에 형식·MIME·크기·불러오기 함수·저장 위치를 기록했다.
- FMA/FMA(WebP)/SaveDB는 기존 범용 작업파일, 레이어·텍스트·그리기·채우기·주석은 FME 작업파일로 유지한다.
- AI Jena 참고 이미지 세팅은 이미지 원본이 포함된 휴대형 JSON이므로 범용 작업파일 `ai_jena_preset`으로 분류했다.
- AI Jena 사용자 포즈와 마스크 다각형 preset은 작은 설정 컬렉션, 내보내기 이력은 원본 asset을 중복하지 않는 전용 메타데이터로 후속 분리했다.

### 실제 구현

1. 서버 검증·저장
   - `.json`, `application/vnd.fma-ai-jena-preset+json`, `FMA-AI-JENA-REFERENCES` v1 작업 형식을 추가했다.
   - JSON 64MB, 이미지당 16MB, 합계 48MB 제한을 두고 `face/clothing/background/pose` 네 역할과 base64 image data URL을 검증한다.
   - SVG와 임의 URL, MIME 불일치, 잘못된 base64, 형식/버전 오류를 asset 생성 전에 차단한다.
   - 기존 checksum asset 중복 제거, 논리 file entry, 검색, 다운로드, `.mdpbackup` 포함 경로를 그대로 재사용한다.

2. fmaviewer adapter와 화면
   - AI Jena `참고 세팅 저장·불러오기`에 SQLite 목록·저장·불러오기 버튼을 추가했다.
   - 기존 JSON 내보내기/불러오기와 IndexedDB 저장/불러오기/삭제는 제거하거나 변경하지 않았다.
   - SQLite 작업파일 창에 AI Jena 참고 세팅 필터를 추가하고 `열기`로 현재 세팅에 적용하며 `다운로드`로 원본 JSON을 받을 수 있게 했다.
   - 저장 결과에 이미지 개수를 표시하고 목록에서 세팅 이름과 저장 시각을 확인할 수 있게 했다.

3. 계획·복구 문서
   - Phase 7B-1 세부 체크리스트를 추가하고 완료 항목을 체크했다.
   - Phase 7B의 첫 분류 항목을 완료 처리했으며 다음 단계는 사용자 포즈·마스크 preset SQLite 설정 adapter로 정했다.

### 변경 파일

- 추가: `LocalSave_sqlite/FMAVIEWER_SQLITE_ARTIFACT_CLASSIFICATION.md`
- 변경: `LocalSave_sqlite/server/work_files.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `Apps/fmaviewer/js/storage/sqliteWorkfiles.js`
- 변경: `Apps/fmaviewer/js/ai/aiJena.js`
- 변경: `Apps/fmaviewer/js/core/globals.js`
- 변경: `Apps/fmaviewer/index.html`
- 변경: `scripts/test-sqlite-work-files.py`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `Apps/fmaviewer/tests/sqlite-workfiles.test.cjs`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python `py_compile`과 변경 JavaScript `node --check`: 통과
- AI Jena 유효 세팅 저장·종류/이름 검색·원본 JSON 다운로드·SHA-256 왕복: 통과
- 같은 JSON 재저장 시 asset 중복 제거와 논리 file entry 보존: 통과
- 외부 URL 변조·잘못된 format·64MB 초과 요청 차단: 통과
- 임시 HTTP 서버의 세션 보호 저장·검색·원본 다운로드 왕복: 통과
- `.mdpbackup` asset 포함·checksum 검증: 통과
- FMA/FME/SaveDB, ONNX, FME fill layer, backup package 회귀: 통과
- 기존 AI Jena JSON/IndexedDB 함수 보존과 새 SQLite UI/API 계약: 통과
- `git diff --check`: 통과

### 오류와 복구 기록

- 존재하지 않는 fmaviewer 테스트 파일 두 개를 추정 실행해 `MODULE_NOT_FOUND`가 1회 발생했다. 실제 `tests/` 목록을 조회한 뒤 존재하는 회귀 테스트만 실행했다. 코드·데이터 변경은 없었다.
- 첫 HTTP 테스트에서 새 MIME이 API allowlist에 없어 415로 차단됐다. `application/vnd.fma-ai-jena-preset+json`만 명시적으로 추가한 뒤 통과했다.
- HTTP 탐색기 테스트의 기존 file entry 기대값 4가 새 세팅 entry 추가로 5가 되어 1회 실패했다. 테스트 데이터 수량에 맞게 5로 갱신한 뒤 전체 통과했다.
- 운영 DB에는 테스트 세팅을 저장하지 않았다. 모든 쓰기 왕복 테스트는 임시 SQLite 데이터 루트에서 수행했다.

### 운영 서버·완료 복구 지점

- 기존 PID `33676`이 이 프로젝트의 `python.exe run.py`인지 확인하고 새 코드로 PID `27208`에서 재기동했다.
- health에서 schema v3, `workFiles=true`를 확인했다.
- 코드: `backup/sqlite_fmaviewer_presets_20260806_1445`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785995109942_2b91b9e6c563.mdpbackup`
- 패키지 SHA-256: `C62B10C9147B21E00400EAD527AD03FAC8EF954EF73099E4E94882D088BA3355`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785995109558_0f8224bd.sqlite`
- DB backup SHA-256: `1D8B8EFA0D75B88084F80C52A4C9A83CCC17E2A586726187599986063FB20183`
- 완료 package는 schema v3, asset 1개, package 검증 `ok=true`를 확인했다.

### 복구 방법

- Phase 7B-1 코드만 되돌리려면 서버를 종료하고 `backup/sqlite_fmaviewer_presets_start_20260806_1436`의 같은 파일을 복원한다.
- `LocalSave_sqlite/server/api.py`에서는 새 AI Jena MIME allowlist 한 줄을 제거하고, 새 분류 문서는 삭제한다.
- 전체 데이터 복구가 필요하면 작업 전 `.mdpbackup`을 복원 미리보기에서 checksum·수량 확인 후 적용한다.
- 복구 후 로컬 서버를 다시 시작해야 Python 서비스와 정적 파일 cache version이 반영된다.

---

## 2026-08-06 16:05 KST — 작업 025 — Phase 7A-4 SQLite 백업 내용 탐색·복구 가능한 삭제

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_backup_explorer_start_20260806_1549` (10개 파일)
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785995109942_2b91b9e6c563.mdpbackup`
- 패키지 SHA-256: `C62B10C9147B21E00400EAD527AD03FAC8EF954EF73099E4E94882D088BA3355`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785995109558_0f8224bd.sqlite`
- DB backup SHA-256: `1D8B8EFA0D75B88084F80C52A4C9A83CCC17E2A586726187599986063FB20183`

### 실제 구현

1. 백업 상세 읽기
   - 탐색기 `백업` 카드가 실제 버튼으로 동작하고 선택 상태를 표시한다.
   - 오른쪽 화면에서 backup ID·종류·상태·생성 시각·schema·크기·SHA-256·checksum/크기 일치·`integrity_check`·foreign key 오류를 확인한다.
   - 문서·폴더·버전·Source·파일·설정·자산·백업기록 개수와 각 항목의 제한된 metadata를 접이식 목록으로 표시한다.
   - 문서 본문, 파일 내용, 설정값, API 키와 암호화 보관함 암호문은 상세 API 응답에서 제외한다.

2. 읽기·경로 보안
   - 등록된 `backup_history` ID만 조회하고 `data/backups/` 밖 경로, 현재 운영 DB, 잘못된 파일명과 symbolic link를 차단한다.
   - 백업 DB는 `mode=ro&immutable=1`과 `PRAGMA query_only=ON`으로만 연다.
   - 백업 상세 GET도 로컬 session token이 있어야 하며 최대 100개 metadata sample만 반환한다.

3. 복구 가능한 삭제
   - 화면에서 정확한 backup ID를 다시 입력하고 최종 확인해야 DELETE 요청을 보낸다.
   - 원본과 WAL/SHM sidecar가 있으면 `LocalSave_sqlite/data/backups/trash/`로 원자 이동한 뒤 `backup_history` record를 transaction으로 제거한다.
   - record 제거가 실패하면 이동한 파일을 원래 위치로 되돌리고, 이미 파일이 없는 stale record는 별도로 표시하며 record만 제거한다.
   - 삭제 후 백업 목록과 상단 개수를 새로고침하고 실제 휴지통 경로를 안내한다.

### 변경 파일

- 추가: `LocalSave_sqlite/server/backup_explorer.py`
- 추가: `scripts/test-sqlite-backup-explorer.py`
- 추가: `scripts/test-sqlite-backup-explorer-ui.js`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `js/storage/sqlite-api-adapter.js`
- 변경: `js/storage/storage-service.js`
- 변경: `Setting/settings-ui.js`
- 변경: `index.html`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `scripts/test-storage-service.js`
- 변경: `scripts/test-backup-packages.py`
- 변경: `scripts/test-sqlite-fma-explorer-ui.js`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python `py_compile`, JavaScript `node --check`: 통과
- backup readonly/immutable 상세, checksum·integrity·테이블 개수와 metadata: 통과
- 문서 본문·설정값 누락과 sentinel 비노출: 통과
- 잘못된 확인값·현재 DB·경로 이탈·미등록 ID·이중 삭제 차단: 통과
- 임시 backup 파일의 관리 휴지통 이동, 목록 record 제거와 stale record 정리: 통과
- 세션 없는 상세 GET/DELETE 403, 보호된 상세·삭제 HTTP 왕복: 통과
- storage adapter의 session header와 `DELETE_BACKUP:<id>` confirmation 계약: 통과
- SQLite server, migration, backup package, 작업파일, ONNX, FMA preview, 도구 설정/보관함 전체 회귀: 통과
- 실제 운영 백업 1개를 변경 없이 조회해 `readOnly=true`, `integrity=ok`, checksum 일치, 비밀값 미포함을 확인했다.

### 오류와 복구 기록

- 첫 단위 테스트에서 설정 보안 정책이 `secretSetting`을 차단했고, 다음 시도에서는 임의 key allowlist를 차단했다. 제품 정책을 완화하지 않고 임시 DB에 test-only setting row를 직접 넣어 값 비노출만 검증했다.
- 전체 회귀에서 기존 두 테스트가 이전 정적 cache version을 고정 비교해 실패했다. 현재 통합 version `20260806-backup-explorer-1`로 기대값을 갱신한 뒤 전부 통과했다.
- 브라우저 확장 기반 로컬 UI 점검은 새 탭 생성 단계에서 두 번 응답하지 않았다. 삭제 동작을 브라우저에서 시도하지 않았고, UI source contract와 실제 session HTTP 상세 조회로 대체 검증했다.
- 사용자 운영 백업은 삭제하지 않았다. 삭제·이중 삭제·trash 이동 테스트는 모두 임시 SQLite data root에서 수행했다.

### 운영 서버·완료 복구 지점

- 기존 PID `27208`이 이 프로젝트의 `python.exe run.py`인지 확인하고 새 코드로 PID `22580`에서 재기동했다.
- health에서 schema v3, `backupExplorer=true`를 확인했다.
- 코드: `backup/sqlite_backup_explorer_complete_20260806_1605` (14개 파일)
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785999932291_553ac7d31231.mdpbackup`
- 패키지 SHA-256: `6FB97CB1D852832619A69AD81E0E15012898C5B2A8D6B3CDF2568AF67BF055E5`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785999932053_1a6a3c3b.sqlite`
- DB backup SHA-256: `FCA0735D45850FF3B531DB42267D63D3B49534BB32EB65788C125B72B8BF88A7`
- package 검증 `ok=true`, 크기 104,275,087 bytes이며 기존 연결 asset을 포함한다.

### 복구 방법

- 코드만 되돌리려면 PID `22580` 서버를 종료하고 `backup/sqlite_backup_explorer_start_20260806_1549`의 같은 상대 경로 파일을 복원한다. 새 `backup_explorer.py`와 두 backup explorer 테스트 파일은 제거 대상이다.
- 완료 상태 코드로 되돌리려면 `backup/sqlite_backup_explorer_complete_20260806_1605`의 같은 상대 경로 파일을 복원한다.
- 탐색기에서 삭제한 백업은 화면에 표시된 `data/backups/trash/` 파일을 서버 종료 상태에서 `data/backups/`로 되돌린 뒤, 필요하면 해당 SQLite 파일을 별도 보관·복원한다. 삭제된 `backup_history` record는 자동 재등록되지 않는다.
- 전체 데이터 복구는 작업 전 또는 완료 `.mdpbackup`을 복원 미리보기에서 checksum·수량 확인 후 적용한다.
- 코드 또는 DB 복구 후 로컬 서버를 다시 시작해야 Python route와 정적 cache version이 반영된다.

---

## 2026-08-06 13:56 KST — 작업 023 — Phase 7A-3 도구 설정 통합 보기·암호화 API 키 보관함

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_tool_settings_vault_start_20260806_1340`
- 직전 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785990980827_5b1d22057881.mdpbackup`
- 직전 패키지 SHA-256: `99B5A68004345A9F0860D168B061C06555E3D493197123EBCD773CEBBF5E5715`
- 직전 SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785990980612_2f8fe469.sqlite`
- 직전 DB SHA-256: `7693B0AE1CA1317930DDC2B22CE2F4A72017BC19CD2E7EE7CC3F9F0B860567B5`

### 보안 원칙

- 기존 Phase 5의 `AI API Key를 SQLite에 평문 저장하지 않는다`는 원칙을 유지했다.
- 사용자가 정한 보관함 비밀번호는 서버, SQLite, IndexedDB, localStorage, 로그에 저장하지 않는다.
- 브라우저 Web Crypto에서 PBKDF2-SHA256 310,000회로 AES-256-GCM 키를 파생한다.
- SQLite에는 version, algorithm, derivation, iteration, salt, IV, ciphertext와 도구별 `configured/last4` metadata만 저장한다.
- 잠금 해제된 API 키는 현재 페이지의 JavaScript 메모리에서만 유지하고 잠그거나 새로고침하면 폐기한다.
- 기존 평문 키를 처음 암호화한 뒤 `ai_settings`의 네 API 필드와 다섯 localStorage 키를 정리한다.
- 탐색기 목록에서 `encryptedToolVault` 원본 record를 숨기고 암호문과 API 키 원문을 화면에 표시하지 않는다.
- 프롬프트에 API 키 형태가 섞이면 카탈로그 저장 전에 `[보호된 값 숨김]`으로 치환하고 서버에서도 probable secret을 차단한다.

### 실제 구현

1. 암호화 보관함
   - Google AI Studio, DeepSeek, OpenAI, imgBB, fmaviewer AI Jena 키를 도구 ID별로 암호화한다.
   - 새 보관함 생성, 잠금 해제, 명시적 잠금, 현재 입력 키 재암호화, 비밀번호 변경을 구현했다.
   - 잘못된 비밀번호와 변경된 ciphertext는 AES-GCM 인증 실패로 차단한다.
   - 보관함이 잠겨 있고 해당 키 metadata가 있으면 남아 있을 수 있는 legacy localStorage 값으로 우회하지 않는다.

2. 실제 도구 연결
   - `getProtectedAiCredential()`을 Google AI Studio, DeepSeek, OpenAI, imgBB 조회 경로에 연결했다.
   - ScholarAI/sspimgAI bridge와 본문 imgBB 업로드가 잠금 해제된 메모리 키를 사용한다.
   - sidebarAI imgBB 조회와 fmaviewer iframe의 AI Jena/업스케일/배경 제거 공용 키 조회를 연결했다.
   - SQLite 모드 앱 시작 때 보관함 metadata만 읽고 자동 복호화하지 않는다.

3. 도구 설정 카탈로그와 탐색기 가운데 보기
   - ScholarAI, sspimgAI, AI Jena, imgBB, fmaviewer AI Jena의 활성 상태, 공급자, 모델, endpoint, 옵션, 프롬프트를 `toolSettingsCatalog`에 동기화한다.
   - SQLite 탐색기 설정 탭 맨 위에 `도구 설정 모아보기`를 추가했다.
   - 가운데 상세 화면에 도구별 카드, 사용 여부, 공급자, 모델, 프롬프트 접기/펼치기, 마스킹된 키 상태를 표시한다.
   - 같은 화면에서 보관함 생성·잠금 해제·잠금·현재 키 재암호화·비밀번호 변경을 수행한다.
   - 설정 검색 SQL에 `value_json`을 추가해 `ScholarAI`, `AI Jena`, 모델명, 프롬프트 내용으로 카탈로그를 검색할 수 있게 했다.

4. 서버 검증
   - `encryptedToolVault`와 `toolSettingsCatalog`만 명시적으로 allow-list에 추가했다.
   - 허용 field, 도구 ID, 중복 ID, 타입, 문자열 길이, base64, salt/IV/ciphertext 크기, PBKDF2 반복 범위를 검사한다.
   - 임의 field, 민감한 중첩 key, 평문 API 키 형태의 catalog 문자열, 잘못된 암호문을 거부한다.
   - schema v3의 기존 `settings` 테이블을 재사용하므로 schema version은 변경하지 않았다.

### 변경 파일

- 추가: `js/storage/encrypted-credential-vault.js`
- 변경: `LocalSave_sqlite/server/settings_policy.py`
- 변경: `LocalSave_sqlite/server/repositories.py`
- 변경: `js/storage/indexeddb-migration.js`
- 변경: `Setting/settings-ui.js`
- 변경: `js/app.js`
- 변경: `sidebarAI/sidebar-ai.js`
- 변경: `Apps/fmaviewer/js/image/imageUpscale.js`
- 변경: `index.html`
- 추가: `scripts/test-sqlite-tool-vault.js`
- 추가: `scripts/test-sqlite-tool-settings-policy.py`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- AES-GCM 암호화 왕복, 잠금 후 원문 차단, 정상 비밀번호 재해제: 통과
- 잘못된 비밀번호, ciphertext tamper, 8자 미만·불일치 비밀번호 차단: 통과
- SQLite payload·catalog·UI에 원문 API 키와 비밀번호가 포함되지 않음: 통과
- 키 끝 4자리 metadata와 prompt secret redaction: 통과
- 서버 envelope/catalog allow-list·base64·필드·ID·크기·probable secret 검증: 통과
- `value_json` 기반 ScholarAI catalog 검색과 explorer 비밀값 누락: 통과
- Python/Node 변경 파일 구문 검사와 `git diff --check`: 통과
- SQLite server core, HTTP API, IndexedDB migration, storage service, backup package: 통과
- FMA/FME 작업파일, ONNX model asset, FMA preview와 fmaviewer 회귀 테스트 전체: 통과

### 운영 서버 검증

- 기존 PID `27312`가 이 프로젝트의 `python.exe run.py`임을 확인한 뒤 구현 중 PID `13876`, 최종 코드로 PID `33676`에서 재기동했다.
- schema v3, `available=true`, journal `WAL`, settings capability와 `integrity_check=ok`, foreign key 위반 0건을 확인했다.
- 사용자 비밀번호를 임의로 만들 수 없으므로 운영 DB에는 테스트 보관함이나 API 키를 생성하지 않았다.
- 설정 탭을 열면 현재 브라우저의 비민감 도구 설정 catalog가 동기화되고, 사용자가 비밀번호를 입력할 때만 암호화 보관함이 생성된다.

### 오류와 복구 기록

- 새 Python 정책 테스트의 첫 실행은 프로젝트 root가 `sys.path`에 없어 `ModuleNotFoundError`가 발생했다. 테스트에 명시적 root 추가를 넣고 재실행해 통과했으며 제품 데이터 변경은 없었다.
- HTTP 회귀 fixture가 실제 WebP가 아닌 `RIFFtestWEBP` 바이트여서 Pillow 사용 환경에서 thumbnail 415가 발생했다. 유효한 1×1 PNG fixture로 교체해 Pillow/비-Pillow 모두 같은 계약을 검증하도록 수정했다.
- 저장소 owner와 실행 계정이 다른 환경에서 일반 `git diff --check`가 dubious ownership으로 거부됐다. 전역 Git 설정은 변경하지 않고 해당 명령에만 `-c safe.directory=...`를 적용해 검사했다.
- 완료 package 응답 필드를 첫 출력에서 잘못 참조해 DB 경로와 무결성이 null처럼 표시됐으나 package 생성은 정상 완료됐다. 별도 validate API와 backup history로 실제 checksum·schema·무결성을 다시 확인했다.
- 사용자 API 키 원문, 비밀번호, FMA, ONNX, 문서, 기존 IndexedDB 데이터는 테스트 과정에서 생성·변경·삭제하지 않았다.

### 복구 방법

- 코드 복구는 `backup/sqlite_tool_settings_vault_start_20260806_1340`의 같은 상대 경로 파일을 사용한다.
- 새 파일 `js/storage/encrypted-credential-vault.js`, 두 tool-vault 테스트 파일은 이전 코드로 복구할 때 제거 대상이다.
- 완료 상태 재적용은 `backup/sqlite_tool_settings_vault_20260806_1356`의 같은 상대 경로 파일을 사용한다.
- 전체 데이터 복구는 `.mdpbackup`을 설정의 복원 미리보기에서 검증한 후 적용한다.
- 보관함 비밀번호를 잊은 경우 암호문에서 API 키를 복구할 수 없으므로 각 공급자에서 키를 재발급하고 새 보관함을 만들어야 한다.
- 이전 코드로 복구한 뒤 현재 PID `33676` 서버를 재시작해야 Python 정책과 정적 cache version이 반영된다.

### 완료 복구 지점

- 코드: `backup/sqlite_tool_settings_vault_20260806_1356`
- 코드 파일 14개 aggregate SHA-256: `E1F66EEE509D583FAD3C9B946B1EFB84A0FA4818A07F13FE69DCD70059E1DA0B` (최종 계획·일지 재복사 전 값이며 디렉터리 자체의 표준 archive hash는 아님)
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785992135151_091ee8179a71.mdpbackup`
- 패키지 SHA-256: `B1B8981AD7E730776EB60FDDB1776F1A1E8F54AEE70490CE9C0F757866E52B54`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785992134920_5db60198.sqlite`
- DB backup SHA-256: `B8050DB5057C6CB876794CBFB6B0704DE0FC39F3F31F8D9FD220495CB60E00AA`
- 완료 package는 schema v3, `integrity_check=ok`, foreign key 위반 0건, 사용자 FMA asset 1개(97,841,395 bytes)를 확인했다.

---

## 2026-08-06 13:06 KST — 작업 020 — Phase 7A SQLite 작업파일 보관함·FMA/FME 연결

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_workfiles_start_20260806_1254`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785988532963_ab897124c42e.mdpbackup`
- 패키지 SHA-256: `659EDFE97B356086001FBCC163389008BF9DA33BD791D6699EB1D5BE7596D427`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785988532866_6b9041de.sqlite`
- DB backup SHA-256: `EB914B998D8E990A77558075F4C4E4F26816254480C54AB19B910DC578750B56`
- 작업 전 package의 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.

### 단계 범위와 호환 정책

- 기존 FMA/FMA(WebP) 파일 다운로드, FME 파일 다운로드·불러오기, IndexedDB SaveDB와 DB 히스토리를 삭제하거나 대체하지 않았다.
- 메인 앱의 저장 모드가 `sqlite`일 때만 새 SQLite 작업파일 기능을 사용하며, inDB 모드에서는 SQLite로 조용히 우회 저장하지 않는다.
- FMA/FME 원본 바이트는 관리되는 `data/assets/workfiles/`에 저장하고 SQLite에는 검색·버전·checksum 메타데이터를 기록한다.
- 같은 checksum의 원본 asset은 한 번만 보관하되 사용자가 저장한 시점별 `file_entries`는 각각 유지한다.
- 브라우저는 로컬 파일 경로를 서버에 전달하지 않으며 파일명·앱 ID·허용된 작업 형식과 바이너리만 전달한다.

### 실제 구현

1. 범용 작업파일 저장 코어
   - `WorkFileService`를 추가해 raw binary를 임시 파일에 streaming 저장하면서 SHA-256과 크기를 계산한다.
   - 관리 경로는 `assets/workfiles/{app}/{checksum-prefix}/{checksum}.{extension}`으로 서버가 결정한다.
   - `workspace_sources`의 `internal_library`, `assets`의 filesystem attachment, `file_entries`를 트랜잭션으로 연결했다.
   - 동일 asset의 중복 파일 생성을 생략하고 논리 저장 entry는 별도 ID·시각·작업 형식으로 남긴다.

2. 형식·경로 검증
   - FMA는 ZIP 구조, 안전한 archive path, 암호화 여부, entry·압축 해제 크기 한도, `manifest.json`, format `fma-archive`, version 3 이상, image/media 참조를 검증한다.
   - FME는 UTF-8 JSON, format `FMA_EDIT_PROJECT`, version 1 이상, source와 config 구조를 검증한다.
   - 확장자·앱 ID·파일명·Content-Length·MIME 허용 목록과 최대 업로드 크기를 검사한다.
   - 다운로드 전 관리 경로, 크기, streaming SHA-256을 다시 검증한다.

3. API
   - health/session capability `workFiles=true`를 추가했다.
   - `POST /api/sqlite/workfiles`에 세션 보호된 바이너리 저장을 추가했다.
   - `GET /api/sqlite/workfiles?app=&q=&type=&limit=`에 세션 보호된 목록·검색을 추가했다.
   - `GET /api/sqlite/workfiles/{id}/download`에 세션 보호, 원본 MIME·UTF-8 파일명 다운로드를 추가했다.

4. fmaviewer 연결
   - File 메뉴에 `SQLite에 FMA 저장`, `SQLite에 FMA(WebP) 저장`, `SQLite 작업파일 열기`를 추가했다.
   - SaveDB 메뉴에 현재 상태를 원본 보존 FMA로 저장하는 `SQLite SaveDB 저장`을 추가했다.
   - 이미지 편집기에 `FME SQLite 저장`, `FME SQLite 불러오기`를 추가했다.
   - 작업파일 창에서 파일명 debounce 검색, 형식 필터, 날짜·크기·checksum 표시, 열기와 원본 다운로드를 제공한다.
   - FMA 생성 코드를 `createFmaArchiveFile()`로 공용화해 기존 파일 다운로드와 SQLite 저장이 같은 archive 생성기를 사용한다.
   - SQLite에서 받은 FMA는 기존 `loadFMA(File)`, FME는 기존 `importImageEditorProject(File)`로 복구한다.

5. 백업 연계
   - 작업파일 asset은 기존 `BackupPackageService._collect_assets()`의 filesystem asset 수집 경로를 그대로 사용한다.
   - 임시 DB에서 FMA/FME asset 2개가 `.mdpbackup` manifest와 `assets/`에 포함되는 것을 검증했다.
   - 스키마 v3의 기존 세 테이블을 재사용했으므로 schema version 변경은 없다.

### 변경 파일

- 추가: `LocalSave_sqlite/server/work_files.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `Apps/fmaviewer/js/files/fileHandlers.js`
- 추가: `Apps/fmaviewer/js/storage/sqliteWorkfiles.js`
- 변경: `Apps/fmaviewer/index.html`
- 변경: `Apps/fmaviewer/css/styles.css`
- 추가: `scripts/test-sqlite-work-files.py`
- 변경: `scripts/test-sqlite-http-api.py`
- 추가: `Apps/fmaviewer/tests/sqlite-workfiles.test.cjs`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python/Node 변경 파일 구문 검사: 통과
- FMA 원본과 FMA WebP 작업 형식의 바이트·SHA-256 왕복: 통과
- 같은 바이트 2회 저장 시 asset 1개, 논리 file entry 2개 보존: 통과
- FME UTF-8 JSON 저장·파일명 검색·형식 필터·원본 왕복: 통과
- 잘못된 FMA manifest, 잘못된 FME format, 틀린 확장자 저장 차단: 통과
- 세션 없는 저장·목록·다운로드 403과 세션 사용 HTTP 왕복: 통과
- 작업파일 asset의 `.mdpbackup` 포함·검증: 통과
- SQLite server core, work-file service, HTTP API, backup package, IndexedDB migration, storage service 테스트: 통과
- fmaviewer auth/background remove/SaveDB restore/image editor/MD Viewer bridge/SQLite adapter 회귀 테스트 6종: 통과
- 변경 파일 `git diff --check`: 통과

### 운영 서버 검증

- 기존 PID `42340`이 이 프로젝트의 `python.exe run.py`인지 확인하고 새 코드로 PID `32704`에서 재기동했다.
- schema v3, `available=true`, `workFiles=true`, `integrity_check=ok`, foreign key 위반 0건을 확인했다.
- 운영 작업파일 목록은 0개이며 검증을 위해 사용자 DB에 테스트 FMA/FME를 저장하지 않았다.
- 실제 바이너리 저장·검색·다운로드는 같은 router를 사용하는 격리 임시 data root HTTP 테스트로 검증했다.

### 오류와 복구 기록

- 첫 작업 전 패키지 요청에서 세션 헤더를 `X-MDPro-Session`으로 잘못 보내 `INVALID_SESSION`이 반환됐다. 데이터 변경은 없었으며 실제 서버 규약인 `X-MDViewer-Session`으로 다시 생성했다.
- 전체 회귀 실행 중 존재하지 않는 `scripts/test-sqlite-core.py`를 지정해 Python file-not-found가 발생했다. 실제 파일 `scripts/test-sqlite-server.py`를 찾아 재실행해 통과했다.
- HTTP 탐색기 테스트는 새 작업파일 source와 entry가 추가되어 기존 고정 수량 1/2가 2/3으로 바뀌어 1회 실패했다. 새 source가 별도로 존재하는 것이 정상임을 확인하고 기대 수량을 보정한 뒤 전체 통과했다.
- 구현 중 운영 DB·IndexedDB 데이터의 삭제나 사용자 작업파일 업로드는 실행하지 않았다.

### 복구 방법

- 코드 복구는 `backup/sqlite_workfiles_start_20260806_1254`의 같은 상대 경로 파일을 사용한다. 새로 추가된 `work_files.py`, `sqliteWorkfiles.js`, 관련 테스트 파일은 제거 대상이다.
- 전체 데이터 복구는 작업 전 `.mdpbackup`을 설정의 복원 미리보기에서 검증한 후 적용한다.
- DB만 수동 복구해야 하면 현재 DB와 `data/assets/`를 먼저 별도 보존하고 서버를 종료한 상태에서 작업 전 online backup의 SHA-256·무결성을 확인한 뒤 복원한다.
- SQLite 작업파일 저장이 실패해도 기존 파일 다운로드와 IndexedDB SaveDB는 유지되므로 해당 경로로 즉시 저장할 수 있다.
- 이전 코드로 복구한 뒤 PID `32704` 서버를 재시작해야 capability와 정적 파일 cache version이 반영된다.

### 완료 복구 지점

- 코드: `backup/sqlite_workfiles_20260806_1306`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785989181765_8a02bf27b16b.mdpbackup`
- 패키지 SHA-256: `3460C0CF29119A6CC439F7FF8188BACD35AFEEB08E06F4902B3D7056AF3A2829`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785989181558_cbbdb342.sqlite`
- DB backup SHA-256: `4FA069233CDDAC0EEBE2CB17B9CD188635A24F03E0B5B16993708D2194963FA1`
- 완료 package 생성 시 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.

---

## 2026-08-06 13:36 KST — 작업 022 — Phase 7A-2 SQLite 탐색기 FMA 내용·경량 갤러리

상태: 완료

### 작업 전 복구 지점

- 코드: `backup/sqlite_fma_explorer_start_20260806_1325`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785990356459_bb115a5ba461.mdpbackup`
- 패키지 SHA-256: `7B3B81E167C592D9547010556FA4BD68089AB6DF27244D6FFD335D3C31DF30C1`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785990356252_29bdbef7.sqlite`
- DB backup SHA-256: `FD77768048C8054731CB4E7AC0EEDC5C201428C0F251BF675A0BEDE57A54A8B8`
- 작업 전 package는 사용자 FMA asset 1개를 포함하며 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.

### 범위와 경량화 원칙

- SQLite 작업파일 보관함이 관리하는 FMA v3 ZIP만 미리보기 대상으로 허용한다.
- 원본 FMA와 manifest/media는 변경하지 않으며 탐색기 화면은 읽기 전용이다.
- summary 응답에는 manifest 개수·MIME·제한된 메타데이터만 포함하고 ZIP 원본 경로와 media bytes를 넣지 않는다.
- 갤러리는 최대 24개만 표시하고 썸네일 요청 동시 실행을 4개로 제한한다.
- Pillow 사용 가능 시 최대 240x240 WebP를 생성한다. 없는 환경은 PNG/JPEG/WebP/GIF/AVIF 중 2MB 이하만 제한 전송한다.
- 영상·오디오·SVG·큰 이미지·지원하지 않는 형식은 원본 전체를 보내지 않고 placeholder와 종류·크기만 표시한다.

### 실제 구현

1. FMA summary와 썸네일 서비스
   - `FmaPreviewService`를 추가해 file entry/source/asset 연결, workspace, FMA 작업 유형, filesystem 관리 경로를 검증한다.
   - ZIP absolute/parent 경로, 중복 entry, 암호화 entry, 16MB 초과 manifest, 누락 media를 차단한다.
   - 갤러리 항목·고유 media·이미지·영상·오디오·기타 개수와 MIME/확장자 분포, 전체 media bytes를 계산한다.
   - manifest images 순서에서 최대 24개만 이름·종류·MIME·크기·크기 메타데이터로 반환한다.
   - 이미지 썸네일은 `data/previews/fma/{checksum-derived-key}`에 cache하며 FMA checksum이 바뀌면 새 cache key를 사용한다.
   - preview cache는 재생성 가능 데이터라 SQLite asset에 등록하지 않고 `.mdpbackup`에도 포함하지 않는다.

2. API와 세션 보호
   - health/session capability `fmaPreview=true`를 추가했다.
   - `GET /api/sqlite/explorer/files/{id}/fma-preview`에서 summary와 갤러리 metadata를 반환한다.
   - `GET /api/sqlite/explorer/files/{id}/fma-thumbnail/{mediaId}`에서 제한된 image response만 반환한다.
   - summary와 thumbnail 모두 `X-MDViewer-Session`을 요구한다.
   - thumbnail 응답은 실제 MIME·Content-Length·nosniff와 private cache header를 제공한다.

3. 저장 파사드와 탐색 UI
   - `SqliteApiAdapter`에 session-protected GET과 preview Blob 요청을 추가했다.
   - `MDPStorage`에 FMA summary·thumbnail 읽기 전용 함수를 공개했다.
   - FMA 파일 상세에 갤러리 항목·고유 미디어·이미지·영상·오디오·기타 요약 카드와 MIME 분포를 표시한다.
   - 미리보기 카드에는 파일명·MIME·크기를 표시하고 영상·미지원 항목은 아이콘 placeholder를 사용한다.
   - 파일 변경·탭 변경·새로고침·탐색기 닫기 때 모든 thumbnail object URL을 해제한다.
   - Markdown 등 일반 파일은 기존 `파일 내용` `<pre>` 표시를 그대로 유지한다.
   - 정적 cache version을 `20260806-fma-preview-1`로 갱신했다.

### 변경 파일

- 추가: `LocalSave_sqlite/server/fma_previews.py`
- 변경: `LocalSave_sqlite/server/api.py`
- 변경: `js/storage/sqlite-api-adapter.js`
- 변경: `js/storage/storage-service.js`
- 변경: `Setting/settings-ui.js`
- 변경: `index.html`
- 추가: `scripts/test-sqlite-fma-previews.py`
- 추가: `scripts/test-sqlite-fma-explorer-ui.js`
- 변경: `scripts/test-sqlite-http-api.py`
- 변경: `scripts/test-storage-service.js`
- 변경: `scripts/test-backup-packages.py`
- 변경: `LocalSave_sqlite/SQLITE_LOCAL_STORAGE_IMPLEMENTATION_PLAN.md`
- 변경: `LocalSave_sqlite/SQLITE_IMPLEMENTATION_HISTORY.md`

### 자동 검증

- Python/Node 변경 파일 구문 검사: 통과
- FMA 갤러리/고유 media/이미지/영상/MIME 개수 계산: 통과
- 최대 24개 갤러리 제한과 영상 placeholder: 통과
- 제한 preview 생성·2MB cap·cache 재사용: 통과
- preview cache의 `.mdpbackup` 제외: 통과
- 세션 없는 summary/thumbnail 403과 세션 HTTP image 왕복: 통과
- UI summary 카드·MIME·4 worker 동시성 제한·object URL 정리 계약: 통과
- SQLite server/work-file/model/FMA preview/HTTP/backup/storage service와 fmaviewer adapter 회귀 테스트: 통과
- 변경 파일 `git diff --check`: 통과

### 운영 서버·실데이터 검증

- 기존 PID `26676`이 이 프로젝트의 `python.exe run.py`인지 확인하고 새 코드로 PID `27312`에서 재기동했다.
- schema v3, `available=true`, `fmaPreview=true`를 확인했다.
- 실제 사용자 FMA `project_export_1785989415008.fma`(97,841,395 bytes)를 변경 없이 읽었다.
- 실제 결과: 갤러리 항목 31, 고유 media 30, 이미지 29, 영상 1, 화면 표시 24개가 정확히 반환됐다.
- 실제 PNG 1개를 2,690바이트 `image/webp` 썸네일로 생성해 session-protected HTTP로 반환했다.
- 운영 FMA/SQLite metadata에는 쓰지 않았고 재생성 가능한 preview cache만 생성했다.

### 오류와 복구 기록

- 도구 sandbox의 Python에서는 사용자 site-packages 접근이 제한돼 `PIL` import가 1회 실패했다. 운영 서버에서는 Pillow가 확인됐지만 다른 PC 호환성을 위해 Pillow 없는 경우 2MB 이하 browser image 제한 전송 폴백을 추가했다.
- 전체 회귀에서 backup test가 이전 cache version `20260806-restore-apply-1`을 고정 비교해 1회 실패했다. 현재 통합 version `20260806-fma-preview-1`로 기대값을 갱신한 뒤 통과했다.
- 완료 package 크기 약 104MB는 기존 사용자 FMA asset 97,841,395 bytes 때문이며 preview cache는 포함되지 않았다.
- 사용자 FMA, SQLite metadata, ONNX 모델, IndexedDB 데이터는 삭제하거나 변경하지 않았다.

### 복구 방법

- 코드 복구는 `backup/sqlite_fma_explorer_start_20260806_1325`의 같은 상대 경로 파일을 사용한다. 새 `fma_previews.py`와 FMA preview 테스트 파일은 제거 대상이다.
- 생성된 미리보기 cache만 정리하려면 서버 종료 후 `LocalSave_sqlite/data/previews/fma/`만 제거할 수 있으며 원본 FMA와 SQLite metadata에는 영향이 없다.
- 전체 데이터 복구는 작업 전 `.mdpbackup`을 복원 미리보기에서 검증한 후 적용한다.
- 이전 코드로 복구한 뒤 PID `27312` 서버를 재시작해야 capability와 정적 cache version이 반영된다.

### 완료 복구 지점

- 코드: `backup/sqlite_fma_explorer_20260806_1336`
- 전체 패키지: `LocalSave_sqlite/data/exports/mdviewer_1785990980827_5b1d22057881.mdpbackup`
- 패키지 SHA-256: `99B5A68004345A9F0860D168B061C06555E3D493197123EBCD773CEBBF5E5715`
- SQLite online backup: `LocalSave_sqlite/data/backups/manual_1785990980612_2f8fe469.sqlite`
- DB backup SHA-256: `7693B0AE1CA1317930DDC2B22CE2F4A72017BC19CD2E7EE7CC3F9F0B860567B5`
- 완료 package는 사용자 FMA asset 1개(97,841,395 bytes)를 포함하며 schema v3, `integrity_check=ok`, foreign key 위반 0건을 확인했다.
