# Mermaid Visual Editor 구현 계획

## 1) 목표
- `preview` 영역에 `Visual Editor` 모드를 추가한다.
- 사용자는 노드/간선을 마우스로 편집하고, `Apply` 버튼으로 코드 편집기(`raw-code-editor`)에 반영할 수 있어야 한다.
- 1차 구현은 `flowchart`에 한정한다.

## 2) 구현될 화면(구체 형태)
- 상단 토글: `Preview | Visual Editor`
- Visual Editor 레이아웃(3열)
  - 좌측: `Shapes` 패널 (Rectangle, Rounded, Circle, Diamond, Hexagon, Stadium)
  - 중앙: `Canvas` (노드 배치/선 연결/드래그 이동)
  - 우측: `Properties` 패널
    - Node 선택 시: `Label`, `Shape`, `BackgroundColor`, `BorderColor`, `TextColor`
    - Edge 선택 시: `Label`, `LineType(--> / -.-> / ==> / --- / ... )`
- 우상단 액션: `Unsaved changes` 배지 + `Apply` 버튼

## 3) 동작 정의
- 코드 -> 비주얼: 현재 flowchart 코드를 파싱해 캔버스 상태로 복원
- 비주얼 편집
  - 노드 생성: Shapes에서 클릭/드래그로 추가
  - 노드 이동: 드래그로 위치 이동
  - 노드 편집: 라벨/도형/색상 변경
  - 간선 생성: 소스 노드 선택 -> 타겟 노드 선택
  - 간선 편집: 라벨/선 타입 변경
- 비주얼 -> 코드
  - `Apply` 클릭 시 현재 상태를 Mermaid flowchart 코드로 직렬화
  - 코드 에디터 본문에 반영
  - 기존 Undo 스택과 연동되어 `Ctrl+Z`로 되돌리기 가능

## 4) 범위 (1차 / 2차)
### 1차(MVP)
- Flowchart만 지원
- 노드 추가/이동/라벨/도형 편집
- 간선 추가/라벨/선 타입 편집
- Apply 반영

### 2차(확장)
- 서브그래프 지원
- 다이어그램 타입 확장(Sequence, State 등)
- 자동 정렬/스냅/그리드 고도화
- 다중 선택/정렬 도구

## 5) 데이터 모델 초안
```ts
type NodeShape = 'rect' | 'round' | 'circle' | 'diamond' | 'hexagon' | 'stadium';

type VisualNode = {
  id: string;
  label: string;
  shape: NodeShape;
  x: number;
  y: number;
  style?: {
    fill?: string;
    stroke?: string;
    text?: string;
  };
};

type EdgeType = '-->' | '-.->' | '==>' | '---' | '<-->' | '--o' | '--x';

type VisualEdge = {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
};

type VisualGraphState = {
  direction: 'TD' | 'LR';
  nodes: VisualNode[];
  edges: VisualEdge[];
  dirty: boolean;
};
```

## 6) 파일별 작업 계획
- `index.html`
  - Visual Editor 탭/패널/버튼/속성 UI 추가
- `style.css`
  - 3열 레이아웃, 캔버스, 선택 하이라이트, 패널 스타일
- `app.js`
  - 상태관리(`visualGraphState`)
  - parser(코드->상태), serializer(상태->코드)
  - drag/select/edit/edge-create 이벤트
  - Apply 반영 + Undo 연동

## 7) 순서형 체크리스트 (구현 순서)
- [ ] 1. Visual Editor 탭 UI 뼈대 추가 (`index.html`)
- [ ] 2. Visual Editor 전용 CSS 레이아웃 추가 (`style.css`)
- [ ] 3. 상태 모델/초기화 코드 추가 (`app.js`)
- [ ] 4. flowchart 코드 파서 1차 구현 (node/edge/direction)
- [ ] 5. 캔버스 렌더러 1차 구현 (노드/간선 표시)
- [ ] 6. 노드 선택/드래그 이동 구현
- [ ] 7. Shapes 패널에서 노드 추가 구현
- [ ] 8. Properties 패널에서 노드 라벨/도형 수정 구현
- [ ] 9. 간선 생성(소스->타겟) 구현
- [ ] 10. 간선 라벨/선 타입 수정 구현
- [ ] 11. serializer 구현 (상태 -> Mermaid 코드)
- [ ] 12. `Apply` 버튼으로 코드 에디터 반영
- [ ] 13. Undo 스택 연동 검증 (`Ctrl+Z`)
- [ ] 14. 미리보기/비주얼 에디터 토글 동기화
- [ ] 15. 에러/예외 처리 (파싱 실패, 미지원 구문 안내)
- [ ] 16. 샘플 시나리오 테스트 및 버그 수정

## 8) 수용 기준(Definition of Done)
- [ ] Visual Editor에서 노드/간선 편집 후 `Apply` 시 코드가 정확히 갱신된다.
- [ ] 갱신된 코드는 Mermaid preview에서 정상 렌더링된다.
- [ ] 최소 10개 flowchart 샘플에서 편집/적용/복구(Undo)가 동작한다.
- [ ] 치명적 콘솔 에러 없이 동작한다.
