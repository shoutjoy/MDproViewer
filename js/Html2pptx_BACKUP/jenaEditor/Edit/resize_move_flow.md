# Resize/Move Flow (JenaEditor)

## 목적
슬라이드 내부에서 객체를 선택/이동/리사이즈할 때 함수 관계를 한 곳에서 이해하기 위한 문서입니다.

## 핵심 파일
- `js/Html2pptx/jenaEditor/js/state.js`
- `js/Html2pptx/jenaEditor/js/editor.js`
- `js/Html2pptx/jenaEditor/js/Edit/Obj_layer.js`

## 1) 편집모드 진입/해제
### 진입
- 함수: `setObjectEditMode(true)` (`state.js`)
- 호출:
  - `freezeLayoutForObjectEdit(d)` (`editor.js`)  
    슬라이드 주요 요소를 absolute로 고정(좌표/크기 기록)하여 리플로우를 줄임
  - `d.__jenaImageEditor.setEnabled(true)`
  - `d.__jenaContainerEditor.setEnabled(true)`

### 해제
- 함수: `setObjectEditMode(false)` (`state.js`)
- 동작:
  - 선택 해제: `setWysLayerSelection(d, null)`
  - 코드 포커스 복귀

## 2) 선택 체계
### 선택 공통
- 함수: `setWysLayerSelection(doc, el)` (`state.js`)
- 역할:
  - 현재 선택 객체 저장 (`doc.__jenaLayerSelected`)
  - 선택 outline 클래스 적용
  - `jena-layer-selection` 이벤트 송출

### 컨테이너 선택
- 함수: `findSelectable(target)` (`editor.js`, `bindContainerObjectEditor` 내부)
- 우선순위:
  1. `canvas` 클릭 시 `.chart-wrapper` 우선
  2. `.jena-textbox` 우선
  3. 상위 container-like 요소 탐색

## 3) 이동/리사이즈 흐름 (컨테이너)
### 시작
- `hMove mousedown` -> `startMoveLazy(e)`
- `hX/hY/hXY mousedown` -> `startResizeLazy(e, mode)`

### 승격/고정
- 함수: `ensureMovePlaceholder(el)`  
  기존 자리 유지(placeholder)로 주변 요소 유입 방지
- 함수: `promoteToAbsoluteAtCurrentPosition(el)`  
  현재 위치 기준으로 absolute 승격
  - 부모 border 보정 포함
  - snapshot(`data-jena-geom-*`) 있으면 우선 사용

### 이동/리사이즈 적용
- 함수: `onMove(e)`
  - move: `left/top` 갱신
  - resize: `width/height` 갱신
  - UI 박스 갱신: `syncBox()`

### 종료
- 함수: `onUp()`
  - 드래그 모드 종료
  - 임시 z-index 복원
- 저장은 즉시가 아니라 `Apply`에서 반영

### 적용(저장)
- `Apply` 버튼 클릭
  - `getWysHtml()` -> `applyWysObjectChange(html, true)`
  - `clearMovePlaceholder()`

## 4) 이동/리사이즈 흐름 (이미지)
- 바인딩: `bindImageResizeEditor(doc)` (`editor.js`)
- 시작: `startMove(e)` / `startResize(...)`
- 승격: `promoteImageToAbsoluteAtCurrentPosition(img)`
- 반영: `onMove(e)` -> `left/top/width/height`
- 저장: `Apply` -> `applyWysObjectChange(...)`

## 5) 레이어 패널 연계
- 파일: `js/Edit/Obj_layer.js`
- 기능:
  - 선택 동기화 (`selectObjLayerItem`)
  - 순서 조정 (`moveObjLayerItem`, 내부적으로 `changeSelectedLayerOrder`)
  - 현재 선택 표시 (`Selected: ...`)

## 6) 저장/동기화 공통
- 즉시 적용 저장:
  - `applyWysObjectChange(nextHtml, true)` (`state.js`)
- 자동 저장:
  - `scheduleAutoSave(html)` (`state.js`)
- 코드/에디터 동기:
  - `loadWys(html)` (`editor.js`)
  - `getWysHtml()` (`state.js`)

## 7) 디버깅 체크 순서
1. `setObjectEditMode(true)`에서 `freezeLayoutForObjectEdit` 실행 여부
2. 대상 선택이 기대 요소인지 (`findSelectable` 결과)
3. 첫 move에서 placeholder 생성 여부 (`ensureMovePlaceholder`)
4. 승격 좌표 (`promoteToAbsoluteAtCurrentPosition`)의 left/top 계산값
5. `Apply` 후 HTML 반영 여부 (`applyWysObjectChange`)

## 8) 현재 규칙 요약
- 편집모드 ON에서 객체 편집 가능
- 코드 편집 시작 시 편집모드 OFF로 전환
- move/resize 중 리플로우 최소화를 위해 placeholder + absolute 승격 사용
