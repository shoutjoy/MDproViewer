# MDpro SQLite 데이터베이스 설계서 v3.0

**대상 앱:** MDpro / md_viewer  
**기준:** 실제 `md_viewer.zip` 저장 코드 및 기존 IndexedDB·localStorage 구조  
**권장 실행 구조:** Tauri + Rust + SQLite  
**작성일:** 2026-07-25

---

## 1. 설계 목적

MDpro의 현재 데이터는 `MarkdownProDB`, `mdpro-indb-v1`, `mdpro-fm-v3`, `mdpro_history_v1`, `md_viewer_ai_chat`, `GenSlideDB`, Highlight 전용 DB 및 다수의 `localStorage` 키에 분산되어 있다. 이 상태에서는 문서·서지정보·AI 대화·프롬프트·이미지·작업 이력을 하나의 연구 프로젝트 단위로 조회하거나 백업하기 어렵다.

본 설계의 목적은 다음과 같다.

1. SQLite를 영속 데이터의 **기준원장 Source of Truth**으로 사용한다.
2. IndexedDB는 편집 중 자동저장, AI 스트리밍, 쓰기 실패 대기열, 비정상 종료 복구에 한정한다.
3. 이미지·오디오·비디오·첨부파일 실물은 파일 시스템에 저장하고 SQLite에는 메타데이터와 관계만 저장한다.
4. GitHub·WebDAV·Google Docs·로컬 폴더를 하나의 `workspace_sources + file_entries` 모델로 통합한다.
5. 문서, 참고문헌, 인용, AI 대화, 프롬프트, 하이라이트, 슬라이드가 동일한 워크스페이스 안에서 연결되도록 한다.
6. Tauri 프런트엔드는 SQL을 직접 실행하지 않고 Rust의 Service/Repository 계층만 호출하도록 한다.

---

## 2. 가장 중요한 설계 결정

### 2.1 SQLite와 IndexedDB의 역할을 분리한다

```text
SQLite
= 사용자가 명시적으로 보존해야 하는 영속 데이터

IndexedDB
= 아직 확정되지 않은 작업 중 데이터와 장애복구 데이터

파일 시스템
= 대형 바이너리 실물

OS Credential Store
= API Key, 토큰, 비밀번호

localStorage
= 테마, 패널 크기, 접힘 상태 등 유실 가능한 UI 상태
```

### 2.2 현재 inDB를 그대로 자동저장 DB로 사용하지 않는다

현재 `mdpro-indb-v1`은 단순 초안 저장소가 아니라 경로 기반 가상 파일과 작업공간 백업을 저장한다. 따라서 다음과 같이 분해한다.

| 현재 inDB 역할 | 새 저장 위치 |
|---|---|
| 편집 중 최신 초안 | IndexedDB `document_drafts` |
| SQLite 저장 실패 대기 | IndexedDB `pending_operations` |
| 스트리밍 중인 AI 답변 | IndexedDB `streaming_messages` |
| 경로 기반 가상 파일 | SQLite `workspace_sources`, `file_entries` |
| 전체 작업공간 백업 | SQLite `workspace_snapshots`, `snapshot_documents`, `snapshot_files` |
| 이미지·오디오 임시 업로드 | IndexedDB `temporary_assets` |

### 2.3 내부 문서와 외부 파일을 동일한 데이터로 취급하지 않는다

- `documents.content`는 MDpro 내부 문서의 기준 본문이다.
- `file_entries.content_text`는 로컬 폴더·GitHub·WebDAV·기존 inDB에서 읽어온 파일 원본 또는 동기화 캐시이다.
- 두 데이터의 관계는 `document_sources`가 관리한다.
- 외부 파일을 MDpro 문서로 연 경우에는 `documents`가 편집 기준이 되고, 동기화 완료 시 외부 원천에 반영한다.

이 원칙이 없으면 동일한 Markdown 본문이 여러 테이블에 중복 저장되어 어느 값이 최신인지 판단하기 어려워진다.

---

## 3. 저장 계층 아키텍처

![MDpro 저장 계층](storage_architecture.png)

### 3.1 호출 흐름

```text
MDpro 기능 모듈
  → MDP.storage Storage Facade
  → Tauri invoke command
  → Rust Service
  → Repository
  → SQLite prepared statement / transaction
```

프런트엔드의 `app.js`, `scholarref.js`, `ai-chat.js`, `imageDB.js`, `GenSlide save.js`는 SQLite 테이블을 직접 알지 않아야 한다. 기능 코드는 저장 의도를 전달하고, 실제 테이블·트랜잭션·충돌 검사는 Rust 계층이 담당한다.

---

## 4. 저장해야 할 데이터의 분류

| 대분류 | 저장 대상 | 기준 저장 위치 | 이유 |
|---|---|---|---|
| 사용자 핵심 콘텐츠 | 문서 본문, 제목, 폴더, 문서 메타데이터 | SQLite | 관계·검색·버전·백업이 필요함 |
| 연구자료 | 참고문헌, 저자, DOI, 인용, 학술검색 기록 | SQLite | 중복검사와 문서 연결이 필요함 |
| AI 작업 | 대화방, 메시지, 모델, 사용량, 출처 | SQLite | 대화 재사용과 연구 추적이 필요함 |
| 작업 중 AI 출력 | 아직 끝나지 않은 스트리밍 본문 | IndexedDB | 강제 종료 시 복구가 필요함 |
| 프롬프트 | 프롬프트 본문, 변수, 버전, 실행 이력 | SQLite | 템플릿화·재현성·버전 관리가 필요함 |
| 하이라이트 | 발췌문, 노트, 태그, 출처 위치 | SQLite | 문서·참고문헌과 연결해야 함 |
| 슬라이드 | 덱, 슬라이드 HTML, 순서, 상태 | SQLite | GenSlide 자동저장을 영속화해야 함 |
| 대형 파일 | 이미지, PDF, 오디오, 비디오, 첨부파일 | 파일 시스템 + SQLite 메타 | DB 비대화와 백업 지연을 방지함 |
| 작은 바이너리 | 썸네일, 소형 아이콘 | SQLite BLOB 선택 | 빠른 접근이 유리한 경우에 한함 |
| 외부 저장소 | GitHub SHA, WebDAV ETag, Google Doc ID, 경로 | SQLite | 동기화 상태·충돌 판정에 필요함 |
| 인증정보 | GitHub token, API key, WebDAV password | OS Keychain | 평문 DB/localStorage 저장을 방지함 |
| 자동저장 | 최신 편집 초안, 커서, 스크롤 | IndexedDB | 키 입력 중 빠른 저장과 복구에 적합함 |
| UI 상태 | 테마, 패널 너비, 접힘 상태 | localStorage | 유실되어도 본문 손실이 없음 |
| 파생 인덱스 | FTS5 전문검색 인덱스 | SQLite virtual table | 원본에서 다시 만들 수 있는 파생 데이터임 |

---

## 5. 공통 데이터 규칙

### 5.1 식별자

- 기본키는 `TEXT`형 ULID 또는 UUID v7을 권장한다.
- ULID는 시간 순서 정렬이 가능하므로 `doc_`, `ref_`, `msg_`와 같은 접두어 없이도 충분하다.
- 기존 `doc_<timestamp>` ID는 마이그레이션 과정에서 그대로 유지한다.

### 5.2 시각

- 모든 시각은 UTC 기준 Unix epoch millisecond를 `INTEGER`로 저장한다.
- 화면 표시 단계에서 한국 시간 등 사용자의 locale로 변환한다.

### 5.3 JSON 사용 원칙

JSON은 다음과 같은 저빈도·가변 필드에만 사용한다.

- AI 모델 옵션
- 검색 필터와 원본 응답
- UI 복원 상태
- 공급자별 확장 메타데이터

제목, 본문, 연도, DOI, 폴더, 상태처럼 자주 검색·정렬·조인하는 값은 반드시 정규 컬럼으로 둔다.

### 5.4 삭제 정책

문서·참고문헌·대화·프롬프트·자산은 `deleted_at`을 이용한 soft delete를 기본으로 한다. 휴지통 보관 기간이 지난 뒤에만 실제 `DELETE`를 수행한다.

### 5.5 동시성

`documents`, `bibliographic_items`, `ai_messages`, `prompts`, `slide_decks`에는 `version`을 둔다. 수정 쿼리는 다음 조건을 사용한다.

```sql
WHERE id = :id AND version = :expected_version
```

영향받은 행이 0개이면 다른 저장이 먼저 이루어진 것이므로 충돌로 처리한다.

### 5.6 체크섬

- 문서 본문: UTF-8 정규화 후 SHA-256
- 파일 자산: 원본 byte SHA-256
- 외부 동기화: `local_checksum`, `remote_revision`, `last_synced_checksum`을 함께 사용한다.

---

## 6. 전체 ER 구조

![MDpro ER 개요](erd_overview_small.png)

전체 스키마는 **57개의 일반 테이블, 5개의 FTS5 가상 테이블, 4개의 조회용 View**로 구성한다. 그러나 모든 테이블을 첫 버전에 구현할 필요는 없다. 1차 구현은 문서·폴더·설정·원천·자산·복구를 중심으로 한다.

---

## 7. 테이블 설계

### 7.1 시스템·사용자·워크스페이스

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `schema_migrations` | DB 스키마 변경 이력 | `version`, `name`, `checksum`, `applied_at` |
| `app_meta` | 앱 전체 메타데이터 | `key`, `value_json`, `updated_at` |
| `profiles` | 사용자 정보 | `display_name`, `academic_id`, `major`, `email` |
| `workspaces` | 연구·책·수업·일반 프로젝트 단위 | `name`, `workspace_type`, `default_citation_style` |

`workspaces`는 모든 자료를 프로젝트 단위로 분리하는 최상위 개념이다. 예를 들어 “평생교육 논문”, “생성형 AI 수업”, “책 집필”을 서로 다른 워크스페이스로 관리할 수 있다.

### 7.2 문서·폴더·버전·탭

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `folders` | 중첩 폴더 트리 | `workspace_id`, `parent_id`, `name`, `sort_order` |
| `documents` | 문서의 현재 확정본 | `title`, `content`, `folder_id`, `checksum`, `version` |
| `document_metadata` | 문서별 가변 속성 | `meta_key`, `value_json` |
| `document_versions` | 수동저장·복원·동기화 버전 | `version_no`, `content`, `change_type` |
| `document_links` | 문서 간 관련 링크와 백링크 | `source_document_id`, `target_document_id`, `link_type` |
| `tags` | 워크스페이스 공통 태그 사전 | `name`, `color` |
| `document_tags` | 문서와 태그 다대다 관계 | `document_id`, `tag_id` |
| `editor_sessions` | 앱 실행 세션 | `started_at`, `close_state` |
| `editor_tabs` | 열린 탭 메타데이터 | `document_id`, `is_dirty`, `cursor_position` |

#### `documents` 핵심 컬럼

| 컬럼 | 형식 | 의미 |
|---|---|---|
| `id` | TEXT PK | 문서 고유 ID |
| `workspace_id` | TEXT FK | 소속 프로젝트 |
| `folder_id` | TEXT FK | 내부 폴더 |
| `title` | TEXT | 문서 제목 |
| `content` | TEXT | 현재 확정 Markdown/HTML 본문 |
| `content_format` | TEXT | markdown, html, plain_text 등 |
| `document_type` | TEXT | 연구노트, 강의안, 책 장, 논문 초안 등 |
| `source_mode` | TEXT | internal, github, webdav, local_file 등 |
| `checksum` | TEXT | 본문 SHA-256 |
| `version` | INTEGER | 낙관적 잠금 버전 |
| `deleted_at` | INTEGER | 휴지통 시각 |

#### 문서 버전 생성 정책

- `Ctrl+S` 수동 저장: 버전 생성
- AI 결과 대량 삽입: 버전 생성
- 외부 파일 가져오기: 버전 생성
- GitHub/WebDAV pull: 버전 생성
- 복원: 새 버전으로 생성
- 키 입력마다 실행되는 자동저장: SQLite 버전을 만들지 않고 IndexedDB 초안만 갱신
- 장시간 편집: 10~20분 단위 checkpoint 버전 생성 가능

### 7.3 외부 원천·가상 파일·동기화

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `secret_refs` | 실제 비밀정보의 Keychain 참조 | `service`, `vault_backend`, `vault_key` |
| `integration_accounts` | GitHub·WebDAV·AI 공급자 설정 | `integration_type`, `config_json`, `secret_ref_id` |
| `workspace_sources` | 워크스페이스가 연결한 저장 원천 | `source_type`, `root_uri`, `sync_direction` |
| `file_entries` | 원천 내부 경로 기반 파일·폴더 | `path`, `content_text`, `asset_id`, `remote_revision` |
| `document_sources` | 문서와 외부 원천의 연결 | `document_id`, `source_id`, `remote_revision`, `sync_status` |
| `sync_jobs` | 동기화 실행 기록 | `job_type`, `status`, 진행 수치 |
| `sync_conflicts` | 로컬·원격 충돌 정보 | 체크섬, revision, 두 본문, 해결 상태 |

#### `workspace_sources` 사용 예

| 현재 기능 | `source_type` 값 |
|---|---|
| 내부 문서 라이브러리 | `internal_library` |
| 기존 inDB 가상 파일 | `legacy_indb` 또는 `virtual_workspace` |
| FM 로컬 폴더 | `local_folder` 또는 `legacy_fm` |
| GitHub 저장소 | `github` |
| WebDAV/NAS | `webdav` |
| Google Docs | `google_docs` |
| MDP 가져오기 | `mdp_import` |

`mdpro-indb-v1.files`와 `mdpro-fm-v3.files`는 동일한 개념의 파일 레코드로 보아 `file_entries`로 통합한다.

### 7.4 이미지·오디오·첨부파일

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `assets` | 파일 메타데이터 | `storage_type`, `relative_path`, `mime_type`, `checksum_sha256` |
| `asset_blobs` | 선택적 소형 BLOB | `asset_id`, `blob_data` |
| `asset_variants` | 썸네일·미리보기·파형 | `variant_type`, `relative_path` 또는 `blob_data` |
| `document_assets` | 문서와 자산 관계 | `usage_role`, `alt_text`, `caption` |
| `ai_message_assets` | AI 메시지 입력·생성 이미지 | `usage_role`, `sort_order` |
| `slide_assets` | 슬라이드 내부 자산 | `slide_id`, `element_id`, `usage_role` |

MDpro 기존 문서에 삽입된 `internal://<image-id>` 형식은 유지한다. 새 `asset_id`가 기존 이미지 ID 역할을 하며, `ImageDB.getImage(id)`의 외부 인터페이스는 그대로 두고 내부 구현만 Rust 자산 서비스로 변경한다.

#### 자산 저장 정책

```text
5 MB 이상의 이미지, PDF, 오디오, 비디오
→ 파일 시스템

썸네일과 수십 KB 수준의 작은 아이콘
→ asset_blobs 선택 가능

외부 imgBB 이미지
→ external_url + 공급자 메타 저장
```

### 7.5 전체 작업 이력과 스냅샷

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `workspace_snapshots` | 전체 작업상태 스냅샷 | `snapshot_type`, `state_json`, `memo` |
| `snapshot_documents` | 스냅샷이 가리키는 문서 버전 | `document_version_id`, `tab_order` |
| `snapshot_files` | 스냅샷 당시 가상 파일 | `path`, `content_text`, `asset_id`, `checksum` |

문서 하나의 변화는 `document_versions`, 전체 열린 탭·가상 파일·폴더 상태는 `workspace_snapshots`로 구분한다. 기존 `mdpro_history_v1`은 이 구조로 이전한다.

### 7.6 참고문헌·인용·학술검색

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `bibliographic_items` | 서지자료의 중심 레코드 | `title`, `raw_text`, `doi_normalized`, `publication_year` |
| `bibliographic_contributors` | 저자·편집자 | `role`, `sequence_no`, 이름, ORCID |
| `bibliographic_identifiers` | DOI 외 식별자 | `scheme`, `normalized_value` |
| `bibliographic_keywords` | 키워드 | `keyword`, `normalized_keyword` |
| `document_citations` | 문서-서지자료 인용 관계 | `locator`, `citation_context`, `citation_count` |
| `reference_collections` | 참고문헌 폴더 | `parent_id`, `name` |
| `reference_collection_items` | 컬렉션-서지자료 관계 | `collection_id`, `item_id` |
| `academic_searches` | 검색 요청과 요약 | `provider`, `query_text`, `filters_json`, `status` |
| `academic_search_results` | 검색 결과 원본 | `rank_no`, `raw_json`, `saved_item_id` |
| `highlights` | 발췌문과 연구노트 | `content_markdown`, `source_locator`, `document_id/item_id` |
| `highlight_tags` | 하이라이트 태그 | `highlight_id`, `tag_id` |

#### 기존 `scholar_refs` 호환

현재 참고문헌 레코드는 대체로 `author`, `year`, `text`, `createdAt` 수준이다. 따라서 마이그레이션 시 원문을 반드시 `bibliographic_items.raw_text`에 보존한다. 제목·DOI·학술지·저자는 파싱에 성공한 경우에만 구조화 필드에 추가한다.

#### 참고문헌 중복 판정 순서

1. 정규화 DOI가 같으면 동일 자료로 본다.
2. DOI가 없으면 `normalized_title + publication_year`로 후보를 찾는다.
3. 저자와 학술지까지 비교하여 자동 병합 또는 사용자 확인을 수행한다.
4. 원본 `raw_text`는 병합 후에도 폐기하지 않는다.

### 7.7 AI 대화·출처·실행 이력

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `ai_provider_profiles` | 모델·URL·옵션 프로필 | `provider`, `model`, `options_json` |
| `ai_conversations` | 대화방 | `workspace_id`, `document_id`, `title` |
| `ai_messages` | 메시지 한 건 | `role`, `content_markdown`, `status`, `metadata_json` |
| `ai_message_sources` | AI 답변의 인용 출처 | `bibliographic_item_id`, `url`, `citation_label` |
| `ai_message_assets` | 입력·생성 이미지 | `asset_id`, `usage_role` |
| `ai_runs` | API 호출 단위 감사 기록 | `request_json`, `usage_json`, `latency_ms`, `status` |

현재 AI Chat의 `messages[]` 배열은 개별 행으로 정규화한다. 공급자마다 다른 희귀 필드는 `metadata_json`에 저장하되, `role`, `content`, `provider`, `model`, `usage`, `status`, `created_at`은 정규 컬럼으로 둔다.

#### AI 메시지 저장 흐름

```text
응답 시작
→ IndexedDB streaming_messages에 부분 본문 저장
→ 응답 완료
→ SQLite ai_messages에 한 번에 확정
→ 성공 시 IndexedDB 임시 메시지 제거
→ 실패 시 recovered/failed 상태로 복구 가능
```

### 7.8 프롬프트·양식·실행 재현성

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `prompt_folders` | 프롬프트 폴더 | `parent_id`, `name` |
| `prompts` | 현재 프롬프트 | `content`, `variables_json`, `model_options_json`, `version` |
| `prompt_versions` | 프롬프트 버전 | `version_no`, `content` |
| `prompt_runs` | 어떤 값으로 실행했는지 기록 | `input_values_json`, `output_message_id` |
| `templates` | Markdown·보고서·슬라이드 양식 | `template_type`, `content`, `variables_json` |
| `template_versions` | 양식 버전 | `version_no`, `content` |

`prompt_runs`를 두면 “어떤 프롬프트 버전, 어떤 변수, 어떤 모델 설정으로 결과를 만들었는가”를 재현할 수 있다.

### 7.9 GenSlide

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `slide_decks` | 슬라이드 프로젝트 | `title`, `current_slide_index`, `theme_json`, `state_json` |
| `slides` | 개별 슬라이드 | `slide_no`, `html_content`, `notes_markdown` |
| `slide_assets` | 슬라이드 자산 | `element_id`, `asset_id`, `usage_role` |

현재 `GenSlideDB.autosave`의 `slides:[{html}]` 배열을 `slide_decks`와 `slides`로 분해한다. 슬라이드 순서는 `slide_no`로 명시하며, 순서 변경은 하나의 트랜잭션으로 수행한다.

### 7.10 사이트·공유·설정·백업

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `sites` | 사용자 등록 사이트 | `name`, `url`, `category`, `sort_order` |
| `share_destinations` | Google Docs·GitHub 등 공유 대상 | `destination_type`, `config_json` |
| `settings` | 범위별 비민감 설정 | `scope_type`, `scope_id`, `setting_group`, `setting_key` |
| `backup_history` | 백업 생성·복원 이력 | `file_path`, `checksum_sha256`, `manifest_json` |

#### 설정 범위

```text
문서 설정(document)
  > 워크스페이스 설정(workspace)
  > 사용자 설정(profile)
  > 전역 설정(global)
```

예를 들어 인용 스타일은 특정 문서가 `apa7`을 지정하지 않았다면 워크스페이스 값, 그마저 없으면 전역 값을 사용한다.

---

## 8. IndexedDB 복구 DB 설계

SQLite와 별도로 `mdpro-working-buffer`를 둔다.

### 8.1 `document_drafts`

```json
{
  "documentId": "doc-id",
  "workspaceId": "workspace-id",
  "title": "현재 제목",
  "content": "현재 편집 본문",
  "baseVersion": 12,
  "checksum": "sha256",
  "cursorPosition": 1542,
  "scrollPosition": 0.37,
  "savedAt": 1784950000000,
  "dirty": true
}
```

### 8.2 `pending_operations`

```json
{
  "id": "operation-id",
  "operationType": "UPDATE",
  "entityType": "document",
  "entityId": "doc-id",
  "expectedVersion": 12,
  "payload": {},
  "retryCount": 2,
  "createdAt": 1784950000000,
  "lastAttemptAt": 1784950005000,
  "error": "database is locked"
}
```

### 8.3 그 밖의 Store

| Store | 목적 |
|---|---|
| `streaming_messages` | AI 응답 중간 본문 |
| `temporary_assets` | 이미지 업로드·변환 중 임시 Blob |
| `recovery_sessions` | 강제 종료 당시 탭 상태 |
| `migration_checkpoint` | 기존 DB 이관 재시작 지점 |

IndexedDB 데이터는 SQLite 기준원장을 대체하지 않는다. 앱 시작 시 SQLite와 비교하여 더 최신 초안만 복구 후보로 제시한다.

---

## 9. 전문검색 FTS 설계

### 9.1 가상 테이블

| FTS 테이블 | 검색 대상 |
|---|---|
| `document_fts` | 문서 제목과 본문 |
| `bibliography_fts` | 참고문헌 제목·초록·원문 |
| `prompt_fts` | 프롬프트 이름·설명·본문 |
| `ai_message_fts` | AI 메시지 본문 |
| `highlight_fts` | 하이라이트와 노트 |

### 9.2 한국어 검색

본 설계 SQL은 FTS5 `trigram case_sensitive 0` 토크나이저를 사용한다. 따라서 “인지공학” 검색으로 “인지공학을”도 찾을 수 있다. 한두 글자 검색은 trigram이 처리하지 못하므로 다음 중 하나를 사용한다.

- 3글자 미만 검색은 `LIKE` fallback
- Rust에서 초성·형태소·bigram 인덱스를 별도 생성
- 향후 SQLite 확장 형태소 분석기를 도입

### 9.3 통합검색

문서·참고문헌·프롬프트·AI 메시지·하이라이트 검색 결과를 `UNION ALL`로 합치고, 각 FTS의 `bm25()` 점수와 최근 활동 시각을 함께 사용한다.

---

## 10. 필요한 쿼리의 종류

| 쿼리 유형 | MDpro에서의 사용 예 |
|---|---|
| DDL·Migration | 테이블 생성, 컬럼 추가, 버전 업그레이드 |
| 단일 CRUD | 문서 열기, 폴더 이름 변경, 설정 읽기 |
| UPSERT | 파일 스캔 결과, 설정, DOI 참고문헌, 사이트 목록 |
| Transaction | 문서 저장+버전 생성, 자산 등록+문서 연결 |
| Recursive CTE | 중첩 폴더 트리, 폴더 이동 시 순환 검사 |
| FTS5 검색 | 문서·참고문헌·AI 대화 통합검색 |
| Aggregation | 워크스페이스 문서 수, 총 단어 수, 인용 횟수 |
| Optimistic Lock | 동시 저장·AI 삽입·외부 동기화 충돌 방지 |
| Sync Query | Git SHA/WebDAV ETag/체크섬 비교 |
| Snapshot Query | 전체 작업공간 이력 생성·복원 |
| Retention Query | 오래된 checkpoint와 자동 스냅샷 정리 |
| Integrity Query | `integrity_check`, `foreign_key_check` |
| Backup Query/API | SQLite online backup, WAL checkpoint |

전체 예제 쿼리는 별도 `MDpro_SQLite_query_catalog_v3.sql`에 수록하였다.

---

## 11. 핵심 쿼리 설계

### 11.1 문서 생성

하나의 트랜잭션에서 다음을 수행한다.

1. `documents` INSERT
2. 첫 `document_versions` INSERT
3. 필요한 `document_metadata` INSERT
4. 열린 탭의 `document_id` 연결

### 11.2 문서 수정과 버전 충돌

```sql
UPDATE documents
SET content = :content,
    checksum = :checksum,
    version = version + 1,
    updated_at = :now_ms
WHERE id = :document_id
  AND version = :expected_version
RETURNING version;
```

반환 행이 없으면 현재 SQLite 버전을 다시 읽어 차이를 비교한다. 사용자는 “현재 편집본 유지”, “DB 최신본 유지”, “새 문서로 복제”, “병합” 중 하나를 선택할 수 있어야 한다.

### 11.3 폴더 트리

`WITH RECURSIVE`를 사용하여 `parent_id` 기반 계층을 한 번에 조회한다. 폴더 이동 전에는 이동 대상이 자기 하위 폴더인지 검사한다.

### 11.4 참고문헌 UPSERT

- DOI가 있으면 `(workspace_id, doi_normalized)` unique index를 사용한다.
- DOI가 없으면 제목·연도로 후보를 찾은 뒤 애플리케이션 계층에서 저자를 비교한다.
- 기존 `raw_text`보다 새 원문이 더 완전한 경우에만 교체한다.

### 11.5 자산 저장

1. Rust가 임시 파일을 기록한다.
2. SHA-256을 계산한다.
3. 동일 체크섬 자산이 있는지 조회한다.
4. 없으면 최종 경로로 원자적 rename 후 `assets` INSERT한다.
5. `document_assets`를 연결한다.
6. DB 트랜잭션 실패 시 파일을 quarantine 또는 삭제한다.

### 11.6 AI 메시지

- 사용자 메시지는 즉시 SQLite에 INSERT한다.
- AI 답변의 부분 스트림은 IndexedDB에 둔다.
- 완료 시 `ai_messages`와 `ai_message_sources`를 트랜잭션으로 저장한다.
- API 요청은 `ai_runs`에 latency, usage, error를 남긴다.

### 11.7 설정 UPSERT

`settings`의 복합 기본키를 이용한다.

```text
(scope_type, scope_id, setting_group, setting_key)
```

예:

```text
workspace / ws-1 / scholar / citationStyle
feature   / aiChat / model / selectedModel
profile   / user-1 / editor / fontSize
```

---

## 12. 저장 이벤트 흐름

### 12.1 일반 편집

```text
사용자 입력
→ Editor state 갱신
→ 300~800 ms debounce
→ IndexedDB document_drafts 저장
→ UI: “자동저장됨”
→ 2~5초 idle 또는 Ctrl+S
→ Rust document service
→ SQLite optimistic update
→ 성공 시 draft.dirty=false 또는 제거
```

### 12.2 강제 종료 복구

```text
앱 시작
→ SQLite 문서 version/checksum 읽기
→ IndexedDB draft 읽기
→ draft.savedAt과 checksum 비교
→ 더 최신인 draft만 복구 후보
→ 자동 복구 또는 비교 UI
→ 복구 후 SQLite 새 버전 생성
```

### 12.3 외부 동기화

```text
원격 목록 스캔
→ file_entries UPSERT
→ remote_revision과 last synced revision 비교
→ 로컬 문서 checksum 비교
→ 한쪽만 변경: pull/push
→ 양쪽 변경: sync_conflicts 생성
→ 사용자 병합 후 document_versions 생성
```

---

## 13. 트랜잭션 경계

다음 작업은 반드시 원자적으로 처리한다.

| 업무 | 한 트랜잭션에 포함할 작업 |
|---|---|
| 문서 신규 저장 | 문서 INSERT + 최초 버전 + 메타데이터 |
| 문서 수동 저장 | 문서 UPDATE + 버전 INSERT + FTS trigger |
| 문서 복원 | 현재 문서 UPDATE + 복원 버전 INSERT |
| 참고문헌 저장 | 서지항목 + 저자 + 식별자 + 키워드 |
| 인용 삽입 | 문서 본문 저장 + `document_citations` 갱신 |
| AI 답변 확정 | 메시지 + 출처 + 첨부 + run 상태 |
| 프롬프트 수정 | 현재 프롬프트 UPDATE + 버전 INSERT |
| 자산 삽입 | 자산 메타 + 사용 관계; 파일 작업은 보상 처리 포함 |
| 스냅샷 생성 | snapshot + 문서 버전 링크 + 파일 사본 |
| 슬라이드 순서 변경 | 모든 `slide_no` 재배치 |

SQLite 쓰기는 문서 ID별로 직렬화하고, 전체 DB에는 짧은 트랜잭션만 유지한다.

---

## 14. 인덱스 설계 원칙

### 반드시 필요한 인덱스

- `documents(workspace_id, folder_id, updated_at)`
- `documents(workspace_id, last_opened_at)`
- `folders(workspace_id, parent_id, sort_order)`
- `document_versions(document_id, version_no DESC)`
- `file_entries(source_id, path)` unique
- `file_entries(source_id, sync_status)`
- `bibliographic_items(workspace_id, doi_normalized)` partial unique
- `bibliographic_items(workspace_id, normalized_title, publication_year)`
- `document_citations(document_id)`와 `(item_id)`
- `ai_conversations(workspace_id, updated_at)`
- `ai_messages(conversation_id, sequence_no)` unique
- `prompts(workspace_id, folder_id, updated_at)`
- `workspace_snapshots(workspace_id, created_at)`

인덱스를 지나치게 많이 만들면 문서 저장 속도가 느려진다. 실제 `EXPLAIN QUERY PLAN` 결과와 사용 빈도를 측정해 추가한다.

---

## 15. 보안 설계

### SQLite에 평문으로 저장하지 않을 값

- GitHub Personal Access Token
- Gemini/OpenAI 호환 API Key
- imgBB API Key
- WebDAV 비밀번호
- Google OAuth refresh token

SQLite에는 `secret_refs.vault_key`만 저장한다. 실제 값은 Windows Credential Manager 또는 Tauri Stronghold에 저장한다.

`integration_accounts.config_json`에는 repository, branch, base URL, 사용자명 등 비민감 설정만 둔다.

---

## 16. 백업 구조

```text
mdpro-backup-YYYYMMDD-HHMMSS.mdpbackup
├── manifest.json
├── mdpro.sqlite
├── assets/
└── checksums.json
```

### 백업 정책

- 스키마 마이그레이션 전 자동 백업
- 앱 업데이트 전 자동 백업
- 최근 7개 일별 백업
- 최근 4개 주별 백업
- 사용자가 만든 수동 백업은 별도 보관
- SQLite는 Rust의 online backup API를 우선 사용
- 자산 폴더는 체크섬 기반 증분 복사 가능

### 복원 전 검증

1. manifest format/version 확인
2. DB SHA-256 확인
3. `PRAGMA integrity_check`
4. `PRAGMA foreign_key_check`
5. 자산 파일 체크섬 확인
6. 현재 데이터 자동 백업 후 복원

---

## 17. 현재 저장소에서 새 테이블로의 마이그레이션

| 현재 저장소 | 현재 Store/키 | 새 위치 |
|---|---|---|
| `MarkdownProDB` | `documents` | `documents`, 최초 `document_versions` |
| `MarkdownProDB` | `folders` | `folders` |
| `MarkdownProDB` | `autosave` | IndexedDB `document_drafts` |
| `MarkdownProDB` | `images` | `assets` + 파일 시스템 또는 `asset_blobs` |
| `MarkdownProDB` | `scholar_refs` | `bibliographic_items.raw_text` 중심 |
| `MarkdownProDB` | `ai_settings` | `settings`, `integration_accounts`, `secret_refs` |
| `mdpro-indb-v1` | `meta`, `files` | `workspace_sources(legacy_indb)`, `file_entries`, `workspace_snapshots` |
| `mdpro-fm-v3` | `meta`, `files` | `workspace_sources(legacy_fm)`, `file_entries` |
| `mdpro_history_v1` | `state` snapshots | `workspace_snapshots`, `snapshot_documents`, `snapshot_files` |
| `md_viewer_ai_chat` | `conversations` | `ai_conversations`, `ai_messages`, `ai_message_sources` |
| `GenSlideDB` | `autosave`, `images` | `slide_decks`, `slides`, `assets`, `slide_assets` |
| Highlight DB | `records`, `tags` | `highlights`, `tags`, `highlight_tags` |
| localStorage | `mdpro_tabs_v1` | `editor_sessions`, `editor_tabs`; dirty content는 IndexedDB |
| localStorage | `mdpro_v7` | IndexedDB `document_drafts` |
| localStorage | UI 토글·패널 상태 | localStorage 유지 |
| localStorage | API Key·토큰 | OS Keychain으로 이전 |

### 마이그레이션 검증 지표

- 원본 레코드 수와 삽입 레코드 수
- 문서 ID·폴더 관계 유지 여부
- 문서 본문 SHA-256 일치율
- 이미지 Blob과 파일 체크섬 일치율
- AI 대화별 메시지 수 일치
- 참고문헌 `raw_text` 누락 여부
- orphan 관계와 FK 위반 수

기존 IndexedDB는 마이그레이션 성공 후에도 일정 기간 읽기 전용으로 유지한다.

---

## 18. Rust Repository와 Tauri Command 범위

### 문서

```text
document_create
document_get
document_list
document_update
document_soft_delete
document_restore
document_search
document_list_versions
document_restore_version
```

### 워크스페이스·파일 원천

```text
workspace_create
folder_get_tree
folder_move
source_register
source_scan
file_entry_upsert_batch
sync_start
sync_resolve_conflict
snapshot_create
snapshot_restore
```

### 연구자료

```text
reference_upsert
reference_search
reference_add_contributors
citation_attach
citation_list_by_document
academic_search_save
highlight_create
```

### AI·프롬프트

```text
conversation_create
message_append
message_finalize
message_add_sources
prompt_create
prompt_update
prompt_run_log
```

### 자산·설정·운영

```text
asset_import
asset_resolve
asset_delete
settings_get_effective
settings_upsert
backup_create
backup_restore
db_health
db_integrity_check
```

명령은 SQL 문자열을 받지 않아야 한다. 구조화된 DTO만 받아 SQL injection과 스키마 의존성을 프런트엔드에서 차단한다.

---

## 19. 구현 우선순위

### Phase 1: 저장 파사드와 문서 기준원장

- `MDP.storage` 생성
- 기존 IndexedDB adapter로 회귀 테스트
- Tauri SQLite bridge
- `profiles`, `workspaces`, `folders`, `documents`
- `document_metadata`, `document_versions`
- IndexedDB `document_drafts`, `pending_operations`
- 설정과 백업 최소 기능

### Phase 2: inDB·FM·History 통합

- `workspace_sources`
- `file_entries`
- `document_sources`
- `workspace_snapshots`
- 기존 inDB/FM/history 마이그레이션

### Phase 3: 자산

- `assets`, `document_assets`
- `internal://id` 호환 adapter
- 파일 시스템 이동과 체크섬 검증

### Phase 4: 학술자료

- 참고문헌 정규화
- 학술검색 기록
- 인용 관계
- 하이라이트
- FTS 검색

### Phase 5: AI·프롬프트

- 대화·메시지 정규화
- 스트리밍 복구
- 출처 연결
- 프롬프트 버전·실행 재현성

### Phase 6: GenSlide·공유·고급 동기화

- 슬라이드 정규화
- Sites·Share 설정
- GitHub/WebDAV/Google Docs 충돌 UI
- 통합 백업과 복원

---

## 20. 운영·성능 정책

- SQLite 연결은 앱당 하나의 pool 또는 제한된 연결 수로 관리한다.
- 쓰기는 `BEGIN IMMEDIATE`와 짧은 트랜잭션을 사용한다.
- WAL 모드를 사용한다.
- 문서 목록에서는 `content`를 조회하지 않는다.
- 대량 파일 스캔은 100~500개 batch UPSERT로 처리한다.
- 이미지 Blob을 문서 본문이나 설정 JSON에 base64로 넣지 않는다.
- `PRAGMA optimize`는 종료 또는 유휴 시 실행한다.
- `VACUUM`은 사용자가 요청한 유지관리 시점에만 실행한다.
- FTS는 원본에서 재생성할 수 있으므로 백업 manifest에 재생성 가능 여부를 기록한다.

권장 PRAGMA는 다음과 같다.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
PRAGMA recursive_triggers = ON;
```

---

## 21. 데이터 보존 정책

| 데이터 | 권장 보존 |
|---|---|
| 수동 저장·복원·가져오기 문서 버전 | 제한 없이 유지 또는 사용자 관리 |
| 자동 checkpoint 버전 | 문서당 최근 20개 |
| History/Recovery 스냅샷 | 유형별 최근 30개 |
| 휴지통 | 30일 |
| 완료된 sync job | 90일 |
| 실패한 sync job | 해결 후 180일 |
| AI run 세부 요청 데이터 | 사용자가 정한 연구 감사 정책에 따라 90일 이상 |
| 일별 백업 | 7개 |
| 주별 백업 | 4개 |

민감한 AI 요청 원문을 장기 보존하지 않으려면 `ai_runs.request_json`에서 개인정보를 제거하거나 보존 기간을 별도로 둔다.

---

## 22. 검증 체크리스트

### 데이터 무결성

- [ ] `PRAGMA integrity_check`가 `ok`인가
- [ ] `PRAGMA foreign_key_check` 결과가 비어 있는가
- [ ] 문서 본문 체크섬이 마이그레이션 전후 동일한가
- [ ] 폴더 순환 참조가 없는가
- [ ] DOI unique index가 중복을 막는가
- [ ] `internal://asset-id`가 실제 자산으로 해석되는가

### 저장·복구

- [ ] 키 입력 후 IndexedDB 초안이 생성되는가
- [ ] SQLite가 잠겨도 편집이 계속되는가
- [ ] pending operation이 재시작 후 재처리되는가
- [ ] 강제 종료 후 최신 초안을 복구할 수 있는가
- [ ] 수동 저장 시 문서 버전이 생성되는가
- [ ] 버전 충돌 시 기존 본문을 덮어쓰지 않는가

### 연구기능

- [ ] 기존 참고문헌 `raw_text`가 모두 유지되는가
- [ ] DOI 검색과 제목·연도 후보 검색이 동작하는가
- [ ] 문서별 참고문헌과 참고문헌별 문서 역조회가 가능한가
- [ ] 학술검색 결과를 저장해도 검색 원본이 남는가
- [ ] AI 답변과 사용한 출처가 연결되는가

### 외부 동기화

- [ ] GitHub SHA/WebDAV ETag가 저장되는가
- [ ] 로컬만 변경·원격만 변경·양쪽 변경을 구분하는가
- [ ] 충돌 해결 전에 어느 쪽도 자동 덮어쓰지 않는가
- [ ] 폴더 이름 변경과 파일 삭제 충돌을 처리하는가

### 백업

- [ ] DB와 자산을 포함한 전체 백업이 생성되는가
- [ ] 다른 PC에서 복원 가능한가
- [ ] 복원 전 현재 데이터가 자동 백업되는가
- [ ] 누락된 자산을 보고하는가

---

## 23. 제공 SQL 파일

- `MDpro_SQLite_schema_v3.sql`: 전체 테이블·인덱스·FTS·trigger·view 생성문
- `MDpro_SQLite_query_catalog_v3.sql`: 문서·폴더·검색·인용·AI·자산·백업 쿼리 예제

스키마 SQL은 SQLite 3.46.1 환경에서 생성·FTS·FK·무결성 smoke test를 통과하도록 검증하였다.

---

## 24. 최종 권고

MDpro의 DB 전환은 “IndexedDB의 테이블을 SQLite로 그대로 복사하는 작업”이 아니다. 다음 세 가지를 먼저 확정해야 한다.

1. `documents`를 내부 문서의 유일한 기준 본문으로 정한다.
2. 기존 inDB와 FM의 경로 파일을 `workspace_sources + file_entries`로 통합한다.
3. 자동저장과 AI 스트리밍만 IndexedDB의 복구 계층으로 남긴다.

이 구조를 따르면 MDpro는 단순 Markdown 편집기를 넘어 문서·서지관리·AI 연구대화·프롬프트·슬라이드·외부 동기화가 연결된 로컬 연구 데이터 플랫폼으로 확장될 수 있다.
