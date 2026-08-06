# Local_SQLiteWASM

MD Viewer의 Python SQLite HTTP API를 단계적으로 대체하는 브라우저 SQLite WASM 구현이다.

- 계획 및 상태: `SQLITE_WASM_MIGRATION_PLAN.md`
- 공식 런타임: `vendor/sqlite3/`
- 데이터 저장: 브라우저 OPFS
- DB 가상 경로: `/mdpro.sqlite`
- 기본 VFS: `opfs-sahpool`

이 폴더는 전체 `.mdpbackup`, 작업파일, 모델, FMA, 이미지 프록시 또는 정적 웹 서버를
대체하지 않는다.

