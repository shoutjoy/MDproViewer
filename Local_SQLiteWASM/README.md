# Local_SQLiteWASM

MD Viewer의 Python SQLite HTTP API를 단계적으로 대체하는 브라우저 SQLite WASM 구현이다.

- 계획 및 상태: `SQLITE_WASM_MIGRATION_PLAN.md`
- 공식 런타임: `vendor/sqlite3/`
- 데이터 저장: 브라우저 OPFS
- DB 가상 경로: `/mdpro.sqlite`
- 기본 VFS: `opfs-sahpool`
- DB 이동: 설정의 `WASM DB 파일 내보내기` / `WASM DB 파일 불러오기` (내보내기 이름: `mdproYYYYMMDD.sqlite`)
- FMA 작업파일: 일반 FMA·WebP FMA를 SQLite BLOB으로 저장·불러오기
- FMA 탐색: 설정의 `SQLite보기` 파일 탭에서 manifest 요약과 내부 이미지 갤러리 제공
- AI 도구 설정: ScholarAI·sspimgAI·AI Jena·FMA AI Jena의 비밀값이 아닌 실행 설정을 profile `toolSettingsCatalog`에 자동 저장·복원
- 주소 모음: Sites 이름·URL과 Share 사용자 추가 URL·선택 상태를 workspace 설정에 자동 저장·복원

AI 카탈로그에는 사전 프롬프트·톤·provider·모델·이미지 옵션·응답/검색/레이아웃 설정만 저장한다.
API 키·토큰·비밀번호는 포함하지 않으며 `encryptedToolVault`의 AES-GCM 암호문으로만 보관한다.

DB 불러오기는 schema·필수 테이블·설정 정책·integrity·foreign key를 먼저 검사한다.
검증이 통과하면 현재 DB를 OPFS `/pre-import.sqlite`에 백업하고 `/mdpro.sqlite`를 교체한다.

이 폴더는 전체 `.mdpbackup`, FMA 이외 작업파일, ONNX 모델, 이미지 프록시 또는 정적 웹 서버를
대체하지 않는다.
