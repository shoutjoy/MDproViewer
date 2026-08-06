# fmaviewer SQLite 저장 대상 분류

기준일: 2026-08-06  
적용 단계: Phase 7B-1

| 대상 | 현재 형식·경로 | 저장 분류 | SQLite 구현 상태/후속 작업 |
|---|---|---|---|
| FMA 원본·WebP·SaveDB snapshot | `.fma`, `application/vnd.fma+zip`, `loadFMA()` | 범용 작업파일 | Phase 7A 완료 |
| 이미지 편집 레이어·텍스트·그리기·채우기·주석 | `.fme`, `application/vnd.fma-edit+json`, `importImageEditorProject()` | 범용 작업파일 | Phase 7A 완료. 편집 상태는 FME에 함께 포함하므로 별도 중복 테이블을 만들지 않음 |
| AI Jena 얼굴·의상·배경·포즈 참고 세팅 | JSON `FMA-AI-JENA-REFERENCES` v1, `applyAiJenaReferencePreset()` | 범용 작업파일 `ai_jena_preset` | Phase 7B-1에서 구현. 최대 64MB, `application/vnd.fma-ai-jena-preset+json` |
| AI Jena 사용자 포즈 모음 | JSON `FMA-AI-JENA-POSES` v1, IndexedDB `fma_store` | 작은 설정 컬렉션 | 후속 adapter. 참고 이미지 원본과 분리 |
| 마스크 다각형 프리셋 | `localStorage` `fma_mask_polygon_presets_v1` | 작은 설정 컬렉션 | 후속 adapter. 바이너리 asset 불필요 |
| 이미지/영상 색감 preset | JavaScript 기본 상수 | 코드 내장값 | 사용자 저장값이 생길 때만 설정 컬렉션 추가 |
| 이미지·FMA·FME 내보내기 이력 | 현재 영구 이력 없음 | 전용 내보내기 이력 메타데이터 | 후속 단계에서 결과 파일을 중복 저장하지 않고 파일 entry/checksum을 참조하도록 설계 |

## AI Jena 참고 세팅 안전 제한

- JSON 전체 최대 크기는 64MB이다.
- 허용 역할은 `face`, `clothing`, `background`, `pose` 네 가지뿐이다.
- 참고 이미지는 `data:image/...;base64,` 형식만 허용한다.
- 이미지 한 개의 디코딩 크기는 최대 16MB, 네 이미지 합계는 최대 48MB이다.
- 세팅 이름·파일명·포즈 문자열 길이를 제한하며, 서버 검증을 통과하기 전에는 asset과 SQLite 메타데이터를 생성하지 않는다.
- 저장된 원본은 기존 `.mdpbackup`의 asset 수집·checksum 검증 경로를 재사용한다.
