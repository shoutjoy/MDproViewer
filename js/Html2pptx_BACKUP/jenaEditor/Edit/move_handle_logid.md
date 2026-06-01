# Move Handle Logic (move_handle_logid)

## 목적
`MOVE` 핸들을 잡았을 때 객체가 어떻게 선택/승격/이동/저장되는지 정리한 문서입니다.

현재 증상(잡는 순간 깨짐, 위치 점프, 레이어 역전)은 보통 **absolute 승격 기준**과 **선택 대상(특히 canvas/chart)** 처리에서 발생합니다.

## 동작 흐름 (컨테이너 객체)
아래 흐름은 `js/editor.js`의 `bindContainerObjectEditor(doc)` 내부에서 동작합니다.

1. 선택 대상 결정
- `findSelectable(target)`
- 클릭한 DOM에서 실제 이동 가능한 요소를 고릅니다.
- `canvas`는 우선 `.chart-wrapper` 또는 parent를 선택하도록 보정되어 있습니다.

2. 핸들 입력 시작
- `hMove.addEventListener("mousedown", startMoveLazy, true)`
- 실제로는 `startMoveLazy(e)`가 먼저 실행되어 초기 좌표(`sx/sy`)와 요소 좌표(`sl/st`)를 기록합니다.
- 이 단계에서는 바로 `position:absolute`로 바꾸지 않습니다(lazy).

3. 첫 mousemove에서 승격
- `onMove(e)` 내부
- `mode === "move"` && `moveNeedsAbs === true` 이면
  - `ensureMovePlaceholder(activeEl)` 실행
  - `promoteToAbsoluteAtCurrentPosition(activeEl)` 실행
- 여기서 flow 요소를 absolute로 승격합니다.

4. 이동 적용
- 같은 `onMove(e)`에서
- `activeEl.style.left = sl + dx`, `top = st + dy`
- `syncBox()`로 선택 테두리 UI를 동기화

5. 마우스 업
- `onUp()`에서 mode 종료
- 즉시 저장은 하지 않고 pending 상태 유지

6. Apply로 저장
- `applyBtn` 클릭 시
- `getWysHtml()` -> `applyWysObjectChange(html, true)`
- placeholder 정리: `clearMovePlaceholder()`

## 동작 흐름 (이미지 객체)
`bindImageResizeEditor(doc)`의 이미지 이동도 유사한 흐름입니다.

1. `startMove(e)`에서 lazy 초기화
2. `onMove(e)`에서 필요 시 `promoteImageToAbsoluteAtCurrentPosition(activeImg)`
3. `left/top` 갱신
4. `Apply` 클릭 시 HTML 반영

## 깨짐/점프가 생기는 핵심 원인
1. 승격 기준 좌표 불일치
- flow 상태의 좌표계와 absolute 좌표계가 다르면 첫 이동에서 점프합니다.

2. 부모/쌓임 컨텍스트 변경
- 승격할 때 parent 기준이 바뀌거나 stacking context가 바뀌면 레이어가 뒤집혀 보일 수 있습니다.

3. canvas 직접 선택
- chart canvas를 직접 이동하면 wrapper와 분리되어 레이아웃 깨짐이 발생합니다.

## 현재 코드에서 MOVE에 직접 관련된 함수 목록
파일: `js/Html2pptx/jenaEditor/js/editor.js`

### 컨테이너/텍스트 아닌 일반 객체 MOVE
- `bindContainerObjectEditor(doc)`
- `findSelectable(target)`
- `startMoveLazy(e)`
- `onMove(e)`
- `onUp()`
- `ensureMovePlaceholder(el)`
- `clearMovePlaceholder()`
- `promoteToAbsoluteAtCurrentPosition(el)`
- `syncBox()`
- `syncApplyButton()`

### 이미지 MOVE
- `bindImageResizeEditor(doc)`
- `startMove(e)`
- `onMove(e)`
- `onUp()`
- `promoteImageToAbsoluteAtCurrentPosition(img)`
- `syncBox()`

### 저장/반영 공통
- `getWysHtml()`
- `applyWysObjectChange(nextHtml, recordHistory)`
- `scheduleAutoSave(html)`

## 디버깅 체크포인트
1. move 시작 직전 값
- `sx/sy`, `sl/st`, `moveNeedsAbs`

2. 승격 직후 값
- `activeEl.style.left/top/width/height`
- parent가 의도한 부모인지

3. 선택 객체 검증
- `findSelectable(target)`가 `canvas` 자체가 아닌 `chart-wrapper`를 반환하는지

4. 저장 시점
- `Apply` 이전/이후 HTML diff 확인

## 참고
동작 안정화 원칙은 `Edit/modalEditRule.md`에 정리되어 있으며,
MOVE 핸들에서는 "드래그 시작 시 레이아웃 붕괴를 만들지 않고, 첫 move에서 승격 후 좌표를 고정"하는 방식이 핵심입니다.
