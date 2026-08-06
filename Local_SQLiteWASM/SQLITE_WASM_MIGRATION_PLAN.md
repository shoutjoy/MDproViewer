# MD Viewer SQLite WASM 전환 계획

## 1. 목표

Python `run.py`의 SQLite HTTP API를 브라우저의 SQLite WASM + OPFS 저장소로 대체한다.
기존 UI는 `MDPStorage` 파사드를 계속 사용하고, HTTP `fetch()` 대신 Web Worker RPC로 SQLite를 호출한다.

1차 범위는 문서 중심 저장 기능이다. 2026-08-06 추가 범위로 FMA Viewer의 FMA/FMA WebP
작업파일 저장·불러오기와 SQLite보기 갤러리 미리보기를 포함한다. 전체 패키지 백업,
ONNX 모델, 이미지 프록시와 정적 웹 제공은 계속 제외한다.

## 2. 현재 구조

```text
브라우저 UI
   |
   v
MDPStorage
   +-- IndexedDbAdapter ----------------> IndexedDB
   +-- RecoveryBuffer ------------------> IndexedDB
   +-- SqliteApiAdapter -- HTTP --------> Python run.py
                                           |
                                           v
                                      SqliteApiRouter
                                      +-- StorageRepository
                                      +-- MigrationService
                                      +-- BackupService
                                      +-- WorkFileService
                                      +-- ModelAssetService
                                      +-- FmaPreviewService
                                           |
                                           +-- mdpro.sqlite
                                           +-- assets/
                                           +-- backups/
                                           +-- exports/
                                           +-- previews/
```

관련 코드:

- `js/storage/storage-service.js`: 저장 모드와 활성 어댑터 선택
- `js/storage/sqlite-api-adapter.js`: `/api/sqlite` HTTP 호출
- `LocalSave_sqlite/server/api.py`: SQLite API 라우터
- `LocalSave_sqlite/server/database.py`: 연결, 트랜잭션, 무결성 검사, 백업
- `LocalSave_sqlite/server/repositories.py`: 문서·폴더·설정 SQL
- `js/storage/recovery-buffer.js`: SQLite 장애 시 IndexedDB 복구 버퍼

### 2.1 Python SQLite 서버가 실제로 동작하는 위치

- 실행 진입점은 `md_viewer/run.py`이다.
- 기본 주소는 `127.0.0.1:8765`이며 `MD_VIEWER_HOST`, `MD_VIEWER_PORT` 환경 변수로 바뀔 수 있다.
- 별도 SQLite 프로세스가 있는 구조가 아니다. `run.py` 한 프로세스가 정적 파일 제공과
  `/api/sqlite` 요청 처리를 모두 맡고, 내부에서 `SqliteApiRouter`와 `DatabaseManager`를 호출한다.
- 기본 DB 파일은 `md_viewer/LocalSave_sqlite/data/mdpro.sqlite`이다.
- 브라우저는 `sqlite-api-adapter.js`의 `fetch()`로 Python API를 호출하며, Python 프로세스가
  파일 잠금·트랜잭션·Repository SQL을 실행한다.
- WASM 전환 뒤에는 동일 브라우저 안의 전용 Worker가 그 역할을 맡고 DB는 Windows 파일 경로가
  아닌 해당 origin의 OPFS `/mdpro.sqlite`에 저장된다.

## 3. 목표 구조

```text
브라우저 UI
   |
   v
MDPStorage
   +-- IndexedDbAdapter ----------------> IndexedDB
   +-- RecoveryBuffer ------------------> IndexedDB
   +-- WasmSqliteAdapter -- postMessage -> SQLite 전용 Web Worker
                                               |
                                               +-- Repository JS
                                               +-- SQLite WASM
                                               +-- OPFS SAH Pool VFS
                                                       |
                                                       v
                                                /mdpro.sqlite
```

SQLite는 메인 UI 스레드에서 실행하지 않는다. 전용 Worker 하나가 데이터베이스 연결을 소유하고
모든 작업을 직렬화한다. 기존 API 어댑터는 전환 기간의 호환·복구 수단으로 유지한다.

## 4. 범위

| 현재 기능 | WASM 전환 | 구현 방향 |
|---|---:|---|
| 문서 CRUD | 쉬움 | Repository SQL을 Worker JS로 이식 |
| 폴더 CRUD | 쉬움 | 현재 어댑터 메서드와 반환 형식 유지 |
| 문서 버전·복원 | 보통 | 낙관적 잠금과 트랜잭션 유지 |
| 설정 저장 | 쉬움 | 안전 설정 허용 목록과 검증을 JS로 이식 |
| FTS5 검색 | 보통 | WASM 빌드의 FTS5를 시작 시 검증 |
| IndexedDB 이관 | 보통 | 기존 정규화 결과를 Worker에서 preview/apply |
| 자동저장·복구 버퍼 | 거의 그대로 | 기존 IndexedDB RecoveryBuffer 재사용 |
| 무결성 검사 | 쉬움 | `quick_check`, `integrity_check`, `foreign_key_check` 실행 |
| DB 파일 백업 | 가능 | OPFS DB를 독립 `.sqlite` 파일로 export |
| FMA 작업파일 저장·불러오기 | 보통 | FMA ZIP 전체를 `asset_blobs` BLOB으로 저장하고 Python과 동일한 Source/Asset/FileEntry 메타데이터 유지 |
| FMA WebP 저장 | 보통 | FMA Viewer의 기존 WebP 변환 archive 생성기를 사용한 뒤 WASM BLOB 저장 |
| FMA 갤러리 | 보통 | JSZip으로 manifest와 내부 media를 검증·조회하고 Canvas에서 최대 240px WebP 썸네일 생성 |

## 5. 제외 범위

아래 기능은 이번 구현에서 포팅하지 않는다. WASM health capability에서 `false`로 보고한다.

- 전체 `.mdpbackup` 생성·검증·복원
- FMA 외 작업파일(FME, 프리셋, GenSlide 파일) 저장 및 다운로드
- ONNX 모델 저장
- 이미지 프록시
- 정적 웹 제공

## 6. 기술 결정

### 6.1 SQLite 배포물

- SQLite 공식 WASM 3.53.4 배포물을 로컬에 포함한다.
- 런타임 CDN 의존성을 두지 않는다.
- `vendor/sqlite3/sqlite3.js`, `vendor/sqlite3/sqlite3.wasm`만 사용한다.

### 6.2 영속 저장

- 1차 VFS: `opfs-sahpool`
- DB 가상 경로: `/mdpro.sqlite`
- SAH pool 디렉터리: `.mdviewer-sqlite-wasm-v1`
- Worker 하나와 DB 연결 하나만 사용한다.
- 두 번째 탭의 동시 연결은 VFS 오류로 처리하며 향후 Web Locks 조정 단계로 남긴다.

### 6.3 Journal mode

네이티브 스키마의 `PRAGMA journal_mode = WAL`은 Worker에서 검증 후
`PRAGMA journal_mode = DELETE`로 치환하여 적용한다. WASM OPFS의 WAL은 배타 잠금이 필요하고
현재 단일 Worker 구조에서는 이점이 작기 때문이다.

### 6.4 호환 전환

- 기본 백엔드 정책은 `auto`이다.
- `auto`: Python API health 확인 후 성공하면 API, 실패하면 WASM 사용
- `api`: Python API만 사용
- `wasm`: SQLite WASM만 사용
- 선택값은 `mdpro_sqlite_backend_v1`에 저장한다.
- 기존 UI의 저장 모드 이름 `sqlite`는 유지하고 내부 backend만 구분한다.

### 6.5 기존 DB 이전

브라우저는 Windows의 기존 `LocalSave_sqlite/data/mdpro.sqlite`를 직접 열 수 없다.
기존 서버에서 online backup으로 완결된 `.sqlite` 파일을 만든 뒤 파일 선택 또는 드래그로
OPFS에 가져와야 한다. 설정 화면의 `WASM DB 파일 불러오기`는 후보 DB를 임시 OPFS 경로에서
검증한 뒤 현재 DB를 교체한다. 교체 직전 DB는 `/pre-import.sqlite`로 자동 백업한다.

불러오기 검증 항목:

- `SQLite format 3` 헤더와 512MB 크기 제한
- 현재 앱과 동일한 schema version
- 필수 테이블과 기본 profile/workspace/ROOT
- 설정 허용 목록과 민감 데이터 정책
- `quick_check`, `integrity_check`, `foreign_key_check`
- 실패 시 기존 DB 유지 또는 자동 백업 롤백

## 7. 구현 체크리스트

### A. 기반

- [x] `Local_SQLiteWASM` 작업 폴더 생성
- [x] 공식 SQLite WASM 배포물 로컬 포함
- [x] 배포물 버전·해시 문서화
- [x] SQLite 전용 Worker 생성
- [x] Worker RPC 어댑터 생성
- [x] OPFS SAH Pool 초기화
- [x] 기존 스키마 SHA-256 검증 후 적용
- [x] profile/workspace/root bootstrap 생성
- [x] SQLite/FTS5/JSON/STRICT 기능 self-test

### B. 문서

- [x] 문서 목록과 제목 필터
- [x] 문서 상세 조회
- [x] 문서 생성과 최초 버전 생성
- [x] `expectedVersion` 기반 문서 수정
- [x] soft delete와 버전 충돌 처리
- [x] 문서 버전 목록
- [x] 과거 버전 복원

### C. 폴더

- [x] 폴더 트리 목록
- [x] 폴더 생성
- [x] 폴더 수정과 순환 참조 방지
- [x] 폴더 삭제 시 문서를 ROOT로 이동
- [x] ROOT 폴더 수정·삭제 방지

### D. 설정

- [x] 안전 설정 허용 목록 이식
- [x] 민감 키·중첩 민감 데이터 차단
- [x] 설정 저장·목록
- [x] global/profile/workspace/feature/document 우선순위 해석

### E. 검색·검사·백업

- [x] 1~2글자 LIKE 검색
- [x] 3글자 이상 FTS5 검색
- [x] `quick_check`, `integrity_check`, `foreign_key_check`
- [x] OPFS DB `.sqlite` export
- [x] `.sqlite` 파일 검증·자동 백업·OPFS DB import
- [x] 브라우저 다운로드 헬퍼
- [x] 문서·폴더·설정·버전·이관 기록 읽기 전용 SQLite 탐색기

### F. IndexedDB 및 복구

- [x] IndexedDB 이관 preview
- [x] preview fingerprint 검증
- [x] 폴더·문서·설정 idempotent apply
- [x] 이관 checkpoint 저장
- [x] 기존 RecoveryBuffer 그대로 연결
- [x] 서버 offline 시 pending 문서 재시도
- [x] 버전 충돌 UI와 오류 형식 유지

### G. 통합·검증

- [x] `storage-service.js`에 API/WASM backend 선택 연결
- [x] `index.html`에 WASM 어댑터 로드
- [x] Node 기반 어댑터/RPC 계약 테스트
- [x] 실제 Chromium에서 Worker 시작 검증
- [x] 새로고침 후 OPFS 데이터 유지 검증
- [x] CRUD·버전·검색·이관·백업 통합 테스트
- [x] Python API 기존 회귀 테스트 유지
- [x] 구현 결과로 이 체크리스트 갱신

### H. FMA Viewer 작업파일·갤러리 추가 범위

- [x] FMA Viewer가 부모 `MDPStorage`를 사용하도록 WASM 저장 경로 연결
- [x] 일반 FMA와 WebP FMA의 기존 archive 생성 흐름 유지
- [x] WASM Worker에 FMA BLOB 저장·중복 Asset 재사용 구현
- [x] `workspace_sources`, `assets`, `asset_blobs`, `file_entries` 메타데이터 기록
- [x] FMA 작업파일 목록·다운로드 Worker RPC 구현
- [x] SQLite보기 Source·파일 목록과 파일 상세 연결
- [x] JSZip 기반 manifest/media 안전성 검증
- [x] 최대 24개 내부 미디어 갤러리와 240px WebP 썸네일 구현
- [x] Node 구문·기존 FMA/Python fallback 계약 테스트 통과
- [x] 실제 Chromium OPFS에서 저장→목록→갤러리→다운로드 통합 검증

### I. AI 도구 설정 SQLite 동기화

- [x] `toolSettingsCatalog`을 ScholarAI·sspimgAI·AI Jena·FMA AI Jena의 안전 설정 스냅샷으로 확장
- [x] ScholarAI 사전 프롬프트·톤·provider·모델·LM Studio 연결 옵션 저장·복원
- [x] sspimgAI 프롬프트 2개·모델·비율·텍스트 제외 옵션 저장·복원
- [x] AI Jena provider·모델·문체·응답 모드·추론 표시·학술 검색·레이아웃 저장·복원
- [x] FMA AI Jena 업스케일/배경 제거 프롬프트·해상도·기능 상태·영상 길이 저장·복원
- [x] 설정 변경 시 SQLite 모드에서 debounce 자동 동기화
- [x] SQLite 모드 시작·전환 시 카탈로그를 로컬 런타임과 열린 AI 패널에 복원
- [x] API 키·토큰·비밀번호는 카탈로그에서 제외하고 기존 AES-GCM 암호화 보관함만 사용
- [x] 프롬프트 속 의심 키 패턴 마스킹과 중첩 민감 필드 정책 차단 테스트
- [x] Node/Python 정책 및 저장·복원 라운드트립 테스트

### J. Sites·Share 주소 SQLite 동기화

- [x] Sites 목록의 이름·URL을 workspace `sitesList` 설정으로 저장·복원
- [x] Share 선택 대상과 사용자 추가 URL을 `shareSites`·`customShareDestinations`로 저장·복원
- [x] NaverBlog 대상 ID를 profile `naverBlogId` 설정으로 저장·복원
- [x] SQLite 모드 시작·전환 시 기존 IndexedDB 주소 설정 자동 백필
- [x] 설정창 저장과 Sites·Share 항목 변경 시 SQLite 즉시 반영
- [x] 실제 Chromium OPFS에서 Worker 재시작 후 주소 목록 유지 검증

## 8. 완료 기준

1. Python 서버가 꺼진 상태에서 `wasm` backend health가 성공한다.
2. 문서·폴더·설정 CRUD가 새로고침 뒤에도 유지된다.
3. 문서 수정 충돌이 `VERSION_CONFLICT`와 현재 버전을 반환한다.
4. 문서 버전 복원과 FTS5 검색이 동작한다.
5. IndexedDB 이관을 재실행해도 중복 데이터가 생성되지 않는다.
6. `integrity_check`와 `foreign_key_check`가 통과한다.
7. 내보낸 `.sqlite` 파일을 네이티브 SQLite에서 열 수 있다.
8. FMA/FMA WebP 작업파일은 SQLite보기 파일 탭과 내부 갤러리에서 확인할 수 있다.
9. 나머지 제외 기능은 숨겨진 성공이 아니라 capability `false` 또는 명시적 오류를 반환한다.
10. AI 도구의 비밀값이 아닌 설정은 SQLite 모드 재시작 뒤 복원되고 API 키 원문은 카탈로그에 포함되지 않는다.
11. Sites·Share 사용자 주소 목록은 SQLite 모드 재시작 뒤에도 이름·URL·선택 상태를 유지한다.

## 9. 구현 및 검증 결과 (2026-08-06)

- 실제 Chromium 통합 테스트 55개 항목 통과
- SQLite 3.53.4, schema v3, OPFS SAH Pool, FTS5 활성 확인
- Worker 종료·재시작 뒤 문서 version 유지 확인
- 동일 IndexedDB batch의 재-preview·재-apply에서 신규 0건 확인
- 내보낸 Blob 1,613,824 bytes 및 `SQLite format 3\0` 헤더 확인
- Node Worker RPC 계약, 기존 StorageService, 기존 IndexedDB 이관 테스트 통과
- 기존 Python SQLite core 및 HTTP API 회귀 테스트 통과
- 메인 설정 UI에서 API/WASM 전환과 WASM DB 내보내기 활성 상태 확인
- WASM 백엔드의 `SQLite보기` 탐색기와 문서 상세·버전 조회 확인
- 내보내기 → 문서 삭제 → DB 불러오기 → 문서·버전 복원 라운드트립 확인
- 잘못된 SQLite 파일 거부 후 현재 DB 보존 확인
- 일반 FMA와 `fma_webp` 작업 유형을 OPFS SQLite BLOB으로 저장하고 동일 원본 Asset 중복 제거 확인
- SQLite보기의 FMA Source·파일 상세·manifest 갤러리·썸네일·다운로드 확인
- 실제 데스크톱 SQLite 프로그램에서 다운로드 파일을 다시 여는 수동 검증은 후속 확인 항목
- ScholarAI·sspimgAI·AI Jena·FMA AI Jena 설정을 `toolSettingsCatalog`에 자동 동기화하고 시작 시 복원
- 설정 카탈로그에는 API 키 원문을 포함하지 않으며, 의심 키 패턴과 중첩 민감 필드는 정책 단계에서 거부

## 10. 후속 작업

- 다중 탭 Web Locks 또는 `opfs-wl` 평가
- 저장 quota와 `navigator.storage.persist()` 사용자 안내
- 안정적인 origin 정책 확정
- 제외 기능을 별도 프로젝트로 분리
