/* CropPopup — crop.html 팝업 열기·이미지 postMessage 전송 (의존: window._mdliveCropPending) */

const CropPopup = (() => {
    const URL = 'crop.html';
    const WIN_NAME = 'crop';
    const WIN_FEATURES = 'width=640,height=560,scrollbars=yes';

    /** 크롭 창만 연다. 실패 시 null */
    function openWindow() {
        try {
            return window.open(URL, WIN_NAME, WIN_FEATURES);
        } catch (e) {
            return null;
        }
    }

    /**
     * 크롭 팝업을 열고 전역에 전달할 이미지 소스를 저장한다.
     * @returns {Window|null} 열린 창 또는 null
     */
    function open(imageSrc) {
        const w = openWindow();
        if (!w) return null;
        window._mdliveCropPending = imageSrc;
        return w;
    }

    /** crop-ready 이전 초기 전달용 postMessage (지연 2회) */
    function flushImageToWindow(win, imageSrc) {
        if (!win || win.closed || !imageSrc) return;
        const send = () => {
            if (win.closed) return;
            try {
                win.postMessage({ type: 'crop', image: imageSrc }, '*');
            } catch (e) {}
        };
        setTimeout(send, 150);
        setTimeout(send, 500);
    }

    /**
     * 크롭 창을 열고 이미지를 곧바로 전송한다 (이미지삽입·갤러리 등).
     * @returns {boolean} 성공 여부
     */
    function openWithPostMessageFallback(imageSrc) {
        const w = open(imageSrc);
        if (!w) {
            window._mdliveCropPending = null;
            return false;
        }
        flushImageToWindow(w, imageSrc);
        return true;
    }

    return {
        open,
        openWindow,
        flushImageToWindow,
        openWithPostMessageFallback,
        URL,
        WIN_NAME,
        WIN_FEATURES
    };
})();
window.CropPopup = CropPopup;
