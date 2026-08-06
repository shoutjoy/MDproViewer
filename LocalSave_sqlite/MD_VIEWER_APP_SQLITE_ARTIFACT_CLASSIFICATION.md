# MD Viewer 하위 앱 SQLite 저장 대상 분류

기준일: 2026-08-06  
적용 작업: Work 026~027 / Phase 7B-2~7B-4

## 공통 원칙

- 기존 IndexedDB, 파일 다운로드, 파일 불러오기, GitHub 기능은 제거하지 않는다.
- 브라우저는 파일 바이트와 제한된 메타데이터만 로컬 API에 전달하며 파일시스템 경로를 전달하지 않는다.
- 편집 가능한 원본은 범용 작업파일 repository에 원본 바이트와 SHA-256으로 보관한다.
- 자주 부분 수정·검색해야 하는 데이터만 전용 구조화 테이블로 승격한다.
- 앱별 연결은 `기존 회귀 -> 엄격한 형식 검증 -> SQLite 저장/목록/불러오기 -> checksum/백업 검증` 순서로 진행한다.

## 저장 대상과 구현 순서

| 기능 | 현재 저장·입출력 | 형식·권장 제한 | SQLite 대상 | 단계 |
|---|---|---|---|---|
| GenSlide inDB | `GenSlideDB` v4의 `autosave`, `images`; `saveSlidesToInDb`, `listSavedSlidesFromInDb`, `loadSlidesFromInDbById` | 구조화 snapshot. 포함 이미지를 고려해 256MB | inDB 저장 시 MPP v2 원본 snapshot을 SQLite에 선택적으로 자동 보관 | 완료 |
| GenSlide MPP | `exportMpp`, `importMpp`; format `genslide-html2pptx-mpp`, version 2 | `.mpp`, UTF-8 JSON, vendor JSON; 256MB | `genslide_mpp` 작업파일. format/version/slides/images 엄격 검증 | 완료 |
| GenSlide PPTX | `exportPptx`, `importPptxToGenSlide`; PPTX/ PPSX import | `.pptx`, OOXML ZIP; 1GB. 가져오려면 원본 PPTX 보존 필수 | `genslide_pptx` 작업파일. ZIP 경로·엔트리·압축해제 상한 검증 | 완료 |
| GenSlide image | `exportImage`; 단일/세로 PNG, 전체 슬라이드 PNG ZIP | `.png` 최대 512MB, PNG ZIP 최대 1GB | `genslide_png`/`genslide_image_zip`; PNG signature/dimension과 ZIP entry 검증 | 완료 |
| 사용자 양식 | `templateCustomList`; `saveTemplateCustomListToSettings`가 `setAiSettings` 호출 | 배열형 비민감 설정, 서버 상한 4MB | 기존 `settings`의 `templateCustomList`. 별도 파일 저장소를 만들지 않음 | 완료 |
| 양식 Markdown | `exportSelectedTemplateMd`, `importTemplateMdFile`, 현재 문서/새 문서 삽입 | `.md`, UTF-8 | 가져온 내용은 `templateCustomList`에 합쳐져 SQLite 설정으로 미러링. 탐색기 설정 탭에서 전체 내용 확인 | 완료 |
| Reference management | `MarkdownProDB/scholar_refs`; `readAllRefs`, `addRefs`; MD/TXT import/export | `.md`, UTF-8, `text/markdown`; 8MB | `scholar_references_md` 작업파일. MD 원본을 다시 입력 탭으로 가져오며 기존 inDB는 유지 | 완료 |
| Reference GitHub | aggregate JSON format `mdproviewer-scholar-references` v1과 파생 MD | JSON은 id/author/year/createdAt 완전 왕복, MD는 휴대·열람용 | 현재 요구는 MD 원본. 향후 레코드 단위 동기화가 필요할 때 전용 citations 테이블/aggregate JSON 추가 | 후속 |
| Scholar Crossref | `formatMarkdown`, `openScholarCrossrefResults`, 편집 textarea, MD 다운로드, 현재 문서/GitHub 전달 | `.md`, UTF-8, `text/markdown`; 8MB | `crossref_markdown` 작업파일. 편집된 MD를 그대로 저장·목록·재로딩 | 완료 |

## 실제 코드 기준

- 활성 GenSlide 구현은 `js/Html2pptx/**`이다. `js/GenSlide/README.md`가 새 기능의 활성 진입점을 `js/Html2pptx/**`로 안내하므로 후속 adapter는 복제 폴더가 아닌 이 경로에 연결한다.
- GenSlide MPP payload는 `currentIndex`, `slides`, `images`를 포함한다. 이미지가 base64일 수 있어 JSON 본문 크기와 이미지 개수 제한을 함께 둔다.
- PPTX import는 원본 OOXML ZIP을 다시 파싱하므로 SQLite에는 렌더 결과가 아닌 원본 파일을 보관한다.
- 사용자 양식은 `setAiSettings`를 거쳐 SQLite 모드에서 `saveSqliteSafeSettings`로 미러링된다. 서버 정책의 `templateCustomList`는 `collections/workspace/array/4MB`이다.
- 참고문헌 MD와 Crossref MD는 서버에서 확장자, UTF-8, 비어 있지 않음, 8MB 상한을 검증한다. 저장 자산은 전체 `.mdpbackup`에 포함된다.

## 다음 구현 단위

1. 하이라이트·태그를 전용 구조 또는 엄격 JSON snapshot 중 하나로 연결한다.
2. AI 대화·출처와 prompt/run 이력에서 API Key·원문 비밀이 제외되는 schema를 확정한다.
3. 주 문서 내부 이미지와 첨부를 자산 repository에 연결한다.
4. 참고문헌·prompt·message·highlight 본문 통합검색은 각 구조화 저장이 끝난 뒤 FTS index로 추가한다.

## 전체 하위 기능 데이터 인벤토리

| 기능군 | 현재 원본 | 생성 형식/MIME | 현재 SQLite 상태 | 다음 경계 |
|---|---|---|---|---|
| 문서·폴더·버전 | `MarkdownProDB/documents`, `folders` | Markdown/JSON | 전용 tables + FTS 완료 | 통합검색의 기준 데이터 |
| 양식 | `ai_settings.templateCustomList` | JSON array / Markdown export | 안전 설정 완료 | 전용 table 불필요 |
| 참고문헌·Crossref | `scholar_refs`, Crossref 편집 textarea | MD/TXT/aggregate JSON | MD 작업파일 완료 | 항목별 검색은 citations table 후속 |
| 하이라이트·태그 | `MDProViewer_Ultimate_DB/records`, `tags` -> `highlights` mirror | JSON, 선택 본문/태그 | IndexedDB 통합 백업만 완료 | 전용 highlight/tag table 또는 엄격 JSON snapshot |
| AI 대화·출처 | `md_viewer_ai_chat/conversations` -> `ai_chat` mirror | messages JSON/Markdown 파생 | IndexedDB 통합 백업만 완료 | 비밀 제거·출처 schema 확정 후 adapter |
| ScholarAI prompt/result | local history -> `scholar_ai` mirror | prompt TXT/result MD/JSON | IndexedDB 통합 백업만 완료 | prompt/run 전용 schema 후속 |
| sspimgAI 결과 | local history -> `ssp_image_ai` mirror | prompt JSON + image data URL | IndexedDB 통합 백업만 완료 | 이미지 asset 분리 후 adapter |
| 이미지·첨부 | `MarkdownProDB/images`, 문서 내부 URL | Blob/image MIME | FMA·ONNX·GenSlide 자산은 완료 | 주 문서 내부 이미지 repository 후속 |
| History/workspace snapshot | autosave, recovery buffer, feature stores | JSON/Markdown | 문서 복구 buffer와 backup package 완료 | 기능 전체 workspace snapshot은 후속 |
| GenSlide | `GenSlideDB/autosave`, `images` | MPP/PPTX/PNG/ZIP | 작업파일 저장·검색·불러오기 완료 | 덱 내부 부분 검색은 후속 |
| GitHub/WebDAV/Google Docs | settings/cache와 외부 provider 상태 | JSON metadata | 일반 설정 일부 완료, secret 제외 | provider별 revision/etag 전용 schema 후속 |
| 통합검색 | 문서 FTS5 + 작업파일 이름 검색 | FTS/LIKE | 문서·파일명 검색 완료 | refs/prompt/message/highlight 본문 index 후속 |

전체 생성 파일 목록과 원본 불러오기 함수는 이 표와 위의 작업파일 표를 기준으로 source contract 테스트에서 고정한다. 아직 전용 schema가 없는 기능은 기존 IndexedDB 통합 백업을 유지하며 완료로 오인하지 않는다.
