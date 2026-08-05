# SQLite runtime migrations

`001_initial_v3.sql`은 `sqliatemake/MDpro_SQLite_schema_v3.sql`의 실행용 사본이다.

설계 패키지의 `validation_manifest.json` checksum은 현재 작업 트리의 SQL 파일 SHA-256과 일치하지 않으므로 원본 검증 기록으로만 보존한다. 로컬 서버는 이 폴더의 `manifest.json`과 실행용 migration의 실제 바이트 checksum을 비교한 뒤 스키마를 적용한다.

새로운 스키마 변경은 기존 migration을 덮어쓰지 않고 다음 번호 파일로 추가한다. 적용 전에 DB online backup과 이전/신규 migration checksum 검증이 필요하다.

