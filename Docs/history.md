# 작업 ഹി스토리 (Work History)

## 2026년 3월 14일 23:46
**작업 내용:** 단일 HTML 파일에서 HTML, CSS, JS 분리

* **변경 사항 요약:**
  * **`index.html`**: 내부에 있던 `<style>` 및 `<script>` 요소를 제거하고, 외부 리소스로 불러오도록 링크 코드(`css/style.css`, `js/app.js`)를 갱신 및 추가했습니다.
  * **`css/style.css`**: `index.html` 내부에 있던 스타일 및 디자인 요소를 모두 분리하여 저장하는 폴더 및 파일 생성.
  * **`js/app.js`**: `index.html` 하단에 있던 애플리케이션 핵심 로직(IndexedDB, 마크다운 파싱, 사이드바 처리, 문서 관리 등) 전체를 분리하여 생성.
* **목적:** 코드 가독성 증대, 유지보수성 향상 및 프론트엔드 모듈화.
c:\CusorApps\md_viewer\
├── index.html       (기존의 UI 마크다운 뷰어 구조를 선언하는 역할, css와 js를 링크)
├── css/
│   └── style.css    (내부 <style> 태그에 있던 모든 디자인 및 레이아웃 요소)
└── js/
    └── app.js       (마크다운 렌더링, 사이드바, IndexedDB 등 모든 JS 로직)



c:\CusorApps\md_viewer\
├── Docs/
│   └── history.md   (현재 작업 내용 및 일시 기록 저장됨)
├── css/
│   └── style.css
├── js/
│   └── app.js
└── index.html

