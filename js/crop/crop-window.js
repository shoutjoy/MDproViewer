/**
 * crop.html 전용 — 캔버스에서 영역 선택 후 opener에 aiimg-cropped 전달
 * (부모 창은 crop-ready / crop 메시지로 이미지를 넘긴다)
 */
(function () {
    let img = null;
    const scale = { w: 1, h: 1 };
    let rect = { x: 0, y: 0, w: 0, h: 0 };
    let dragging = false;
    let start = { x: 0, y: 0 };
    const canvas = document.getElementById('crop-canvas');
    const ctx = canvas.getContext('2d');
    const previewEl = document.getElementById('crop-preview');

    /** 캔버스에 이미지와 선택 사각형·마스크를 그린다 */
    function draw() {
        if (!img) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (rect.w > 2 && rect.h > 2) {
            ctx.strokeStyle = '#6ac8f7';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
            ctx.fillStyle = 'rgba(0,0,0,.4)';
            ctx.fillRect(0, 0, canvas.width, rect.y);
            ctx.fillRect(0, rect.y, rect.x, rect.h);
            ctx.fillRect(rect.x + rect.w, rect.y, canvas.width - rect.x - rect.w, rect.h);
            ctx.fillRect(0, rect.y + rect.h, canvas.width, canvas.height - rect.y - rect.h);
            updatePreview();
        } else {
            previewEl.style.display = 'none';
        }
    }

    /** 선택 영역 미리보기 img를 갱신한다 */
    function updatePreview() {
        if (!img || rect.w < 5 || rect.h < 5) {
            previewEl.style.display = 'none';
            return;
        }
        const sw = Math.round(rect.w * scale.w);
        const sh = Math.round(rect.h * scale.h);
        const tc = document.createElement('canvas');
        tc.width = sw;
        tc.height = sh;
        const tctx = tc.getContext('2d');
        tctx.drawImage(img, rect.x * scale.w, rect.y * scale.h, sw, sh, 0, 0, sw, sh);
        previewEl.src = tc.toDataURL('image/png');
        previewEl.style.display = 'block';
    }

    /** data URL 또는 http(s) 이미지를 로드해 캔버스에 맞춘다 */
    function receiveImage(imageData) {
        if (!imageData) return;
        img = new Image();
        if (imageData.startsWith('data:')) {
            img.src = imageData;
        } else {
            img.crossOrigin = 'anonymous';
            img.src = imageData;
        }
        img.onerror = function () {
            document.body.insertAdjacentHTML('beforeend', '<p style="color:#e55">이미지를 불러올 수 없습니다.</p>');
        };
        img.onload = function () {
            const wrap = document.querySelector('.crop-canvas-wrap');
            const maxW = wrap ? Math.min(560, wrap.clientWidth) : 560;
            const maxH = wrap ? Math.min(280, wrap.clientHeight) : 280;
            let w = img.width;
            let h = img.height;
            if (w > maxW || h > maxH) {
                const r = Math.min(maxW / w, maxH / h);
                w = Math.round(w * r);
                h = Math.round(h * r);
            }
            canvas.width = w;
            canvas.height = h;
            scale.w = img.width / w;
            scale.h = img.height / h;
            rect = { x: 0, y: 0, w: w, h: h };
            draw();
        };
    }

    /** 부모 창에 crop-ready를 보내 이미지 요청 */
    function requestImage() {
        if (window.opener && !window.opener.closed) window.opener.postMessage({ type: 'crop-ready' }, '*');
    }

    let imageReceived = false;
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'crop' && e.data.image) {
            imageReceived = true;
            receiveImage(e.data.image);
        }
    });

    requestImage();
    let retryCount = 0;
    const retryId = setInterval(function () {
        if (imageReceived || img) {
            clearInterval(retryId);
            return;
        }
        if (++retryCount > 6) {
            clearInterval(retryId);
            return;
        }
        requestImage();
    }, 400);

    canvas.addEventListener('mousedown', function (e) {
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) * (canvas.width / r.width);
        const y = (e.clientY - r.top) * (canvas.height / r.height);
        dragging = true;
        start = { x: x, y: y };
        rect = { x: x, y: y, w: 0, h: 0 };
    });
    canvas.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) * (canvas.width / r.width);
        const y = (e.clientY - r.top) * (canvas.height / r.height);
        rect = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) };
        draw();
    });
    canvas.addEventListener('mouseup', function () {
        dragging = false;
    });
    canvas.addEventListener('mouseleave', function () {
        dragging = false;
    });

    document.getElementById('btn-apply').addEventListener('click', function () {
        if (!img || rect.w < 5 || rect.h < 5) {
            window.close();
            return;
        }
        const tc = document.createElement('canvas');
        tc.width = Math.round(rect.w * scale.w);
        tc.height = Math.round(rect.h * scale.h);
        const tctx = tc.getContext('2d');
        tctx.drawImage(img, rect.x * scale.w, rect.y * scale.h, tc.width, tc.height, 0, 0, tc.width, tc.height);
        let dataUrl = tc.toDataURL('image/png');
        if (dataUrl.length > 4000000) dataUrl = tc.toDataURL('image/jpeg', 0.92);
        if (!window.opener) {
            window.close();
            return;
        }
        window.opener.postMessage({ type: 'aiimg-cropped', dataUrl: dataUrl }, '*');
        window.addEventListener('message', function onAck(e) {
            if (e.data && e.data.type === 'crop-applied') {
                window.removeEventListener('message', onAck);
                window.close();
            }
        });
        setTimeout(function () {
            window.close();
        }, 500);
    });
    document.getElementById('btn-cancel').addEventListener('click', function () {
        window.close();
    });
})();
