# Export Logic Guide

## 1) File Structure
- `../export.js`
  - Export entry manager (module map / overview only)
- `pptExport.js`
  - PPTX export coordinator (mode selection, progress, per-slide orchestration)
- `pptModeImage.js`
  - `image` mode renderer (whole slide bitmap)
- `pptModeObject.js`
  - Object classification/renderer used by `image_text` and `full`
  - Handles text extraction (`addText`) and visual/image slicing (`addImage`)
- `pptModeImageText.js`
  - `image_text` mode renderer (visual=image + text=editable)
- `pptModeFull.js`
  - `full` mode renderer (aggressive object extraction)
- `mppExport.js`
  - MPP save/load logic
  - Includes IndexedDB image pack/unpack (`internal://` image restore)
- `imageExport.js`
  - Image export logic
  - Supports:
    - current page -> PNG
    - all pages -> ZIP (page-wise PNG)
    - all pages -> one vertical PNG

## 2) PPTX Export: 3 Modes
PPTX export uses three modes and each mode is selected before export.


## 2) PPTX Export: 3 Modes
PPTX export uses three modes and each mode is selected before export.

1. `image`
- Whole slide is rendered as one bitmap.
- Fast and stable visual fidelity.
- In PPT, objects are not editable as text/shapes.
- This feature also allows you to save the page as an image;
- NotebookLM-style pages 
- **Technical Approach**: 
  - Use rendering libraries (`html2canvas`) with a scale multiplier (e.g., `scale: 2` or `3`) to ensure High-DPI (Retina) clarity.
  - Await `document.fonts.ready` and ensure all `<img src>` elements are fully loaded (via Promises) before capturing.
  - Handle cross-origin (CORS) image constraints by pre-converting remote images to Base64.

2. `image_text`
- Mixed mode. After capturing the details in an image, add text on top 
- Visual/decorative objects are exported as images.
- Text objects are exported as native PPT text (`addText`) when possible.
- Recommended default mode for editability + visual consistency.
- In summary, the slide page is captured as an image, excluding the text. The text is then separated and placed in the appropriate position 
- **Technical Approach**:
  - **Phase 1 (Ghost Background)**: Clone the DOM, traverse and set all text nodes to `color: transparent` (preserving layout and text-wrapping). Capture the result as a single background image.
  - **Phase 2 (Text Positioning)**: Traverse the original DOM. Use `getBoundingClientRect()` to calculate the absolute `x, y, w, h` of text elements relative to the slide container, converting pixels to PPT inches (px / 96).
  - **Phase 3 (Style Mapping)**: Use `window.getComputedStyle()` to map CSS properties (font-size, font-family, font-weight, color, text-align, line-height) to `PptxGenJS` properties.

3. `full`
- Aggressive object extraction mode for maximum element-level export.
- Tries to split/render more DOM objects individually.
- Can be slower and may need layout-specific tuning.
- The principle involves separating and storing the images and text within each container, and converting icons into separate images to facilitate editing 
- It enables professional slide editing by storing and providing all elements—including those within containers, PyCon, text and images—as separate, individual components. 
- **Technical Approach**:
  - **Z-Index & DOM Sorting**: Traverse the DOM AST and sort extracted elements based on visually rendered z-index and DOM hierarchy. PPT draws objects based on insertion order.
  - **Shape Translation**: Identify `div` elements with background colors, borders, and border-radius, mapping them directly to `slide.addShape(PptxGenJS.ShapeType.rect)` instead of images.
  - **SVG Conversion**: Extract inline `<svg>` elements and convert them into Data URIs, inserting them as individual high-resolution image objects for loss-less scaling.
  - **Grouping Mechanism**: Map HTML container boundaries to PPT `slide.addGroup()`, ensuring icons, shapes, and texts inside a card/box move together when edited in PowerPoint.



## 3) PPTX Pipeline (High-level)
1. Load dependencies (`html2canvas`, `PptxGenJS`).
2. Build `internal://` image URL map from IndexedDB.



## 3) PPTX Pipeline (High-level)
1. Load dependencies (`html2canvas`, `PptxGenJS`).
2. Build `internal://` image URL map from IndexedDB.
3. For each slide:
- Create offscreen iframe with slide HTML.
- Wait until DOM/font/image/chart is visually stable.
- Render by mode:
  - `image`: full frame -> one `addImage`
  - `image_text`/`full`: classify DOM -> image/text/shape operations
4. Write `.pptx` file.
5. Revoke temporary object URLs.

## 4) MPP Pipeline (High-level)
### exportMpp
1. Collect slide JSON (`slides`, `currentIndex`).
2. Resolve `internal://` image ids used in slides.
3. Read matching image blobs from IndexedDB.
4. Serialize as base64 and store in `images[]`.
5. Download `.mpp` JSON package.

### importMpp
1. Parse `.mpp` JSON.
2. Restore `images[]` to IndexedDB as blobs.
3. Restore `slides[]` and `currentIndex`.
4. Reload current slide/editor state.

## 5) Notes
- `image_text` is usually best for user-facing PPT editing.
- Text box editability depends on DOM classification rules in `pptExport.js`.
- If a template has custom widgets/icons, add explicit rules in `pptExport.js` classification step.



# 설명자료 
```
const text = `1. image 모드 (전체 슬라이드 이미지화)
가장 빠르고 레이아웃 붕괴가 없는 모드지만, 고해상도 처리와 비동기 리소스 로딩이 관건입니다.

정밀 구현 로직:
고해상도(HiDPI) 캡처: html2canvas 적용 시 반드시 scale: 2 또는 3을 주어 레티나 디스플레이나 큰 화면에서 픽셀이 깨지지 않도록 방지해야 합니다.
비동기 리소스 대기 (Pre-flight): 캡처 전 document.fonts.ready를 통해 웹 폰트가 완전히 로드되었는지 확인하고, 슬라이드 내 모든 <img> 태그의 onload 이벤트를 Promise.all()로 대기하는 로직이 필수입니다.
CORS (교차 출처 리소스 공유) 처리: 외부 URL의 이미지는 Canvas 오염(Tainted Canvas)을 유발해 캡처가 실패할 수 있습니다. 이미지를 fetch로 가져와 Blob/Base64로 변환한 뒤 캡처를 진행하는 전처리 단계가 필요합니다.

2. image_text 모드 (배경 이미지 + 네이티브 텍스트)
레이아웃의 정확성과 텍스트 편집 기능을 동시에 잡는 핵심 모드입니다. 배경과 텍스트를 분리하는 "고스트 텍스트(Ghost Text)" 기법이 필요합니다.

정밀 구현 로직:
배경 추출 (Ghost Text 기법): 텍스트를 단순히 display: none 처리하면 레이아웃이 무너집니다. 대신 원본 DOM을 복제(Clone)한 뒤, 모든 텍스트 노드의 CSS를 color: transparent로 변경합니다. 줄바꿈과 여백은 유지된 상태에서 글자만 투명해지므로, 이 상태로 Canvas 캡처를 떠서 배경 이미지로 삽입합니다.
좌표 및 크기 매핑: 원본 DOM을 순회하며 getBoundingClientRect()를 사용해 슬라이드 컨테이너 기준 텍스트의 상대 좌표(x, y)와 크기(width, height)를 추출합니다. 이를 PptxGenJS가 사용하는 단위(주로 inch)로 변환(픽셀 ÷ 96)합니다.
스타일 매핑 (CSS to PPTX): window.getComputedStyle()을 이용해 각 텍스트 노드의 font-size, font-family, font-weight, color, text-align, line-height를 추출하고 PPTX의 텍스트 속성으로 1:1 매핑합니다.

3. full 모드 (모든 객체 개별 추출)
가장 난이도가 높은 모드로, HTML DOM 트리 구조를 PPT 객체 트리로 변환하는 일종의 AST(Abstract Syntax Tree) 컴파일러 역할을 해야 합니다.

정밀 구현 로직:
DOM 기반 Z-index 정렬기: HTML은 DOM 트리 순서와 Z-index에 의해 화면에 그려지지만, PPT는 객체가 삽입되는 순서대로 위로 쌓입니다. 따라서 추출한 객체 배열을 화면에 렌더링되는 Z-index 및 DOM 순서 기준으로 재정렬한 후 slide.addShape(), slide.addText() 등을 호출해야 합니다.
컨테이너 및 도형(Shape) 변환: 배경색(background-color)이나 테두리(border), 둥근 모서리(border-radius)를 가진 <div> 요소는 이미지로 캡처하는 대신 PptxGenJS의 addShape(PptxGenJS.ShapeType.rect) 등으로 변환하여 배경으로 깔아줍니다.
SVG 및 아이콘 백터화 처리: <svg> 요소는 단순히 캡처하지 않고, SVG 문자열을 Data URI로 묶어 개별 이미지 객체로 변환하거나, 가능할 경우 네이티브 도형 Path로 해석하여 삽입해야 PPT 안에서 크기를 키워도 깨지지 않습니다.
Grouping 기능 구현: 상위 컨테이너(예: 카드 컴포넌트)에 속한 텍스트, 아이콘, 배경 도형을 하나의 단위로 묶기 위해 부모 노드 기준으로 slide.addGroup() 처리하면 PPT 내에서 드래그/이동 편집이 훨씬 수월해집니다.`;

// 한글 및 특수문자를 \uXXXX 형식으로 변환합니다.
const unicodeEscapedText = text.replace(/[\u0080-\uFFFF]/g, 
  (ch) => '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4)
);

console.log(unicodeEscapedText);
```
