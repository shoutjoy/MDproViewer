# Image Upload Component

경로: `imageDB/components`

## 파일
- `image-upload-component.css`: 업로드 UI 스타일(네임스페이스: `mdvu-*`)
- `image-upload-component.js`: 컴포넌트 로직 (`window.ImageUploadComponent`)
- `image-upload-demo.html`: 단독 데모 페이지

## 사용법
```html
<link rel="stylesheet" href="./components/image-upload-component.css">
<script src="./imageDB.js"></script>
<script src="./components/image-upload-component.js"></script>
<div id="image-upload-slot"></div>
<script>
  ImageUploadComponent.mount('#image-upload-slot', {
    getImgbbApiKey: function () { return 'YOUR_IMGBB_KEY'; },
    onInsertMarkdown: function (url, alt) { console.log('md', url, alt); },
    onInsertHtml: function (url, alt) { console.log('html', url, alt); }
  });
</script>
```

## 옵션
- `db`: 이미 열려있는 IndexedDB 인스턴스 주입(선택)
- `dbName`: 기본값 `MarkdownProDB`
- `dbVersion`: 기본값 `4`
- `getImgbbApiKey()`: imgBB 키 반환 함수
- `onInsertMarkdown(url, alt)`: Markdown 삽입 콜백
- `onInsertHtml(url, alt)`: HTML 삽입 콜백

## 포함 기능
- 파일 선택 업로드
- 드래그 앤 드롭
- Ctrl+V 붙여넣기
- imgBB 업로드
- internal:// 내부 저장
- IndexedDB 갤러리 선택
- Markdown/HTML 삽입 이벤트 전달
