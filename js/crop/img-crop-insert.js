/* ImgCrop — 이미지삽입 탭에서 crop.html로 크롭 (의존: CropPopup, _showImgpv) */

const ImgCrop = {
    /** 현재 Md_image/미리보기 이미지로 크롭 팝업을 연다 */
    openForInsert() {
        const urlEl = document.getElementById('img-url');
        const previewEl = document.getElementById('imgpv-preview');
        const src = (urlEl && urlEl.value && urlEl.value.trim()) || (previewEl && previewEl.src);
        if (!src || (!src.startsWith('data:') && !src.startsWith('http'))) {
            alert('먼저 이미지를 업로드하거나 URL을 입력하세요.');
            return;
        }
        if (src.startsWith('http') && previewEl && !previewEl.complete) {
            alert('이미지 로딩 중입니다. 잠시 후 다시 시도하세요.');
            return;
        }
        if (typeof CropPopup === 'undefined' || !CropPopup.openWithPostMessageFallback) {
            alert('CropPopup 모듈을 불러올 수 없습니다.');
            return;
        }
        window._imgCropTarget = 'insert';
        if (!CropPopup.openWithPostMessageFallback(src)) {
            alert('팝업이 차단되었습니다.');
            window._imgCropTarget = null;
            window._mdliveCropPending = null;
        }
    }
};
window.ImgCrop = ImgCrop;
