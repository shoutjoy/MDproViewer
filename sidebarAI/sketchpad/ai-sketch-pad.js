/* AI image seed sketch pad. Creates a lightweight drawing board and sends PNG output to AiImage seed. */
const AiSketchPad = (() => {
    let overlay = null;
    let canvas = null;
    let ctx = null;
    let drawing = false;
    let last = null;
    let targetMode = 'seed';
    let lastImgBBUrl = '';
    let draggingWindow = false;
    let dragOffset = { x: 0, y: 0 };

    const DEFAULT_W = 1024;
    const DEFAULT_H = 768;
    const ASSET_BASE = 'Apps/sketchpad/';

    function qs(id) { return document.getElementById(id); }

    function assetUrl(fileName) {
        const script = document.currentScript || Array.from(document.scripts).find((item) => (item.src || '').includes('ai-sketch-pad.js'));
        if (script && script.src) return new URL(fileName, script.src).href;
        return ASSET_BASE + fileName;
    }

    function loadExternalTemplate() {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', assetUrl('sketchpad.html'), false);
            xhr.send(null);
            if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) return xhr.responseText;
        } catch (err) {
            console.warn('Sketchpad template fallback used:', err);
        }
        return '';
    }

    function ensureStyles() {
        if (!qs('ai-sketch-pad-css')) {
            const link = document.createElement('link');
            link.id = 'ai-sketch-pad-css';
            link.rel = 'stylesheet';
            link.href = assetUrl('sketchpad.css');
            document.head.appendChild(link);
        }
        if (qs('ai-sketch-pad-style')) return;
        const style = document.createElement('style');
        style.id = 'ai-sketch-pad-style';
        style.textContent = `
#ai-sketch-pad-overlay{position:fixed;inset:0;z-index:2147483650;background:transparent;backdrop-filter:none;display:none;pointer-events:none}
#ai-sketch-pad-box{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1120px,92vw);height:min(820px,88vh);min-width:520px;min-height:360px;max-width:98vw;max-height:96vh;background:#f8fbff;color:#1e2a3d;border:1px solid #b9c9e7;border-radius:14px;box-shadow:0 22px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;resize:both;pointer-events:auto}
#ai-sketch-pad-box::after{content:"";position:absolute;right:4px;bottom:4px;width:14px;height:14px;border-right:3px solid #7a91b8;border-bottom:3px solid #7a91b8;border-radius:2px;pointer-events:none;opacity:.75}
#ai-sketch-pad-head{height:46px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px;border-bottom:1px solid #d5e0f2;background:linear-gradient(135deg,#edf5ff,#f7fbff);cursor:move;user-select:none}
#ai-sketch-pad-head b{font-size:14px;color:#173c71}
#ai-sketch-pad-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid #dce6f5;background:#f2f7ff}
#ai-sketch-pad-tools label{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#38506f}
#ai-sketch-pad-tools input[type=color]{width:30px;height:26px;padding:0;border:1px solid #aebddd;border-radius:6px;background:white}
#ai-sketch-pad-tools input[type=range]{width:90px}
#ai-sketch-pad-tools select,#ai-sketch-pad-tools input[type=number]{height:28px;border:1px solid #b9c9e7;border-radius:7px;background:white;color:#22324a;font-size:12px;padding:3px 7px}
#ai-sketch-pad-tools .tool-split{width:1px;height:26px;background:#c9d6eb}
.ai-sketch-btn{border:1px solid #b9c9e7;background:#fff;color:#23406a;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer}
.ai-sketch-btn:hover{background:#eaf2ff}
.ai-sketch-btn.primary{background:#4f46e5;border-color:#4f46e5;color:white}
.ai-sketch-btn.danger{background:#fff1f2;border-color:#f0a8b0;color:#b4232f}
.ai-sketch-tool-btn{border:1px solid #b9c9e7;background:#fff;color:#23406a;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer}
.ai-sketch-tool-btn.active{background:#4f46e5;border-color:#4f46e5;color:white;box-shadow:0 2px 8px rgba(79,70,229,.24)}
#ai-sketch-pad-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto;background:#dfe8f6;padding:14px}
#ai-sketch-pad-canvas{background:white;border:1px solid #b6c5dd;box-shadow:0 8px 30px rgba(31,54,91,.18);touch-action:none;max-width:none}
#ai-sketch-pad-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-top:1px solid #d5e0f2;background:#f7fbff;font-size:12px;color:#667b99}
#ai-sketch-imgbb-result-bar{display:none;align-items:center;gap:8px;padding:10px 12px;background:#f8fbf1;border-top:1px solid #d8e2cc;border-bottom:1px solid #d8e2cc;color:#1f4332;font-size:12px}
#ai-sketch-imgbb-result-bar strong{font-weight:700;color:#20503c}
#ai-sketch-imgbb-result-bar a{color:#1d4ed8;text-decoration:none;word-break:break-all}
#ai-sketch-imgbb-result-bar a:hover{text-decoration:underline}
#painttools-toolbar-sketch{background:rgba(255,255,255,.08)!important;border:1px solid rgba(255,255,255,.12)!important;color:var(--tx)!important;font-weight:700!important;border-radius:6px!important;padding:0 10px!important}
#painttools-toolbar-sketch:hover{background:rgba(255,255,255,.14)!important;color:var(--tx)!important}
[data-theme=light] #painttools-toolbar-sketch{background:rgba(15,23,42,.06)!important;border:1px solid rgba(15,23,42,.1)!important;color:#0f172a!important}
[data-theme=light] #painttools-toolbar-sketch:hover{background:rgba(15,23,42,.12)!important;color:#0f172a!important}
`;
        document.head.appendChild(style);
    }

    function build() {
        if (overlay) return;
        ensureStyles();
        overlay = document.createElement('div');
        overlay.id = 'ai-sketch-pad-overlay';
        overlay.innerHTML = `
<div id="ai-sketch-pad-box" role="dialog" aria-modal="true" aria-label="스케치 그림판">
  <div id="ai-sketch-pad-head">
    <b>스케치 그림판</b>
    <div style="display:flex;gap:6px;align-items:center">
      <button type="button" class="ai-sketch-btn" id="ai-sketch-export">그림내보내기</button>
      <button type="button" class="ai-sketch-btn" id="ai-sketch-imgbb">ImgBB링크</button>
      <button type="button" class="ai-sketch-btn" id="ai-sketch-imgbb-insert">이미지 링크삽입</button>
      <button type="button" class="ai-sketch-btn" id="ai-sketch-doc-insert">문서 이미지삽입</button>
      <button type="button" class="ai-sketch-btn primary" id="ai-sketch-send">이미지 붙여넣기로 넣기</button>
      <button type="button" class="ai-sketch-btn" id="ai-sketch-close">닫기</button>
    </div>
  </div>
  <div id="ai-sketch-imgbb-result-bar">
    <strong>ImgBB URL</strong>
    <a id="ai-sketch-imgbb-result-link" href="#" target="_blank" rel="noreferrer"></a>
  </div>
  <div id="ai-sketch-pad-tools">
    <input type="hidden" id="ai-sketch-tool" value="pen">
    <span style="font-size:12px;color:#38506f;font-weight:700">도구</span>
    <button type="button" class="ai-sketch-tool-btn active" data-tool="pen">펜</button>
    <button type="button" class="ai-sketch-tool-btn" data-tool="highlighter">형광펜</button>
    <button type="button" class="ai-sketch-tool-btn" data-tool="eraser">지우개</button>
    <label>펜 종류
      <select id="ai-sketch-pen-type">
        <option value="pencil">연필</option>
        <option value="ball">볼펜</option>
        <option value="pen">펜</option>
      </select>
    </label>
    <label>펜 색 <input type="color" id="ai-sketch-pen-color" value="#15233d"></label>
    <label>선두께 <input type="range" id="ai-sketch-pen-size" min="1" max="36" value="5"></label>
    <span class="tool-split"></span>
    <label>형광 색 <input type="color" id="ai-sketch-high-color" value="#fff176"></label>
    <label>두께 <input type="range" id="ai-sketch-high-size" min="4" max="80" value="26"></label>
    <label>알파 <input type="range" id="ai-sketch-high-alpha" min="5" max="80" value="35"></label>
    <span class="tool-split"></span>
    <label>지우개 <input type="range" id="ai-sketch-eraser-size" min="8" max="100" value="28"></label>
    <button type="button" class="ai-sketch-btn danger" id="ai-sketch-clear">전체 지우기</button>
    <button type="button" class="ai-sketch-btn" id="ai-sketch-import-btn">그림불러오기</button>
    <input type="file" id="ai-sketch-import" accept="image/*" style="display:none">
  </div>
  <div id="ai-sketch-pad-stage">
    <canvas id="ai-sketch-pad-canvas" width="${DEFAULT_W}" height="${DEFAULT_H}"></canvas>
  </div>
  <div id="ai-sketch-pad-foot">
    <span id="ai-sketch-target-help">간단한 개형을 그리고 “이미지 붙여넣기로 넣기”를 누르면 현재 AI-image/AI-tryon 시드 이미지로 들어갑니다.</span>
    <span id="ai-sketch-status">1024 x 768</span>
  </div>
</div>`;
        const externalTemplate = loadExternalTemplate();
        if (externalTemplate) overlay.innerHTML = externalTemplate;
        document.body.appendChild(overlay);
        canvas = qs('ai-sketch-pad-canvas');
        ctx = canvas.getContext('2d', { willReadFrequently: false });
        bind();
        clearCanvas();
    }

    function clearCanvas() {
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    function getPoint(ev) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (ev.clientX - r.left) * (canvas.width / r.width),
            y: (ev.clientY - r.top) * (canvas.height / r.height)
        };
    }

    function applyStrokeStyle() {
        const tool = qs('ai-sketch-tool').value;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (tool === 'eraser') {
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = 1;
            ctx.lineWidth = Number(qs('ai-sketch-eraser-size').value) || 28;
            return;
        }
        if (tool === 'highlighter') {
            ctx.strokeStyle = qs('ai-sketch-high-color').value || '#fff176';
            ctx.globalAlpha = (Number(qs('ai-sketch-high-alpha').value) || 35) / 100;
            ctx.lineWidth = Number(qs('ai-sketch-high-size').value) || 26;
            return;
        }
        const penType = qs('ai-sketch-pen-type').value;
        ctx.strokeStyle = qs('ai-sketch-pen-color').value || '#15233d';
        ctx.lineWidth = Number(qs('ai-sketch-pen-size').value) || 5;
        ctx.globalAlpha = penType === 'pencil' ? 0.58 : 1;
        if (penType === 'pencil') {
            ctx.lineCap = 'butt';
            ctx.shadowBlur = 0.6;
            ctx.shadowColor = ctx.strokeStyle;
        } else if (penType === 'ball') {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        } else {
            ctx.lineCap = 'square';
            ctx.lineJoin = 'round';
        }
    }

    function startDraw(ev) {
        if (!canvas) return;
        drawing = true;
        last = getPoint(ev);
        canvas.setPointerCapture?.(ev.pointerId);
        ev.preventDefault();
    }

    function moveDraw(ev) {
        if (!drawing || !last) return;
        const p = getPoint(ev);
        ctx.save();
        applyStrokeStyle();
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
        last = p;
        ev.preventDefault();
    }

    function endDraw(ev) {
        drawing = false;
        last = null;
        if (ev && ev.pointerId != null) canvas.releasePointerCapture?.(ev.pointerId);
    }

    function exportDataUrl() {
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        const octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, out.width, out.height);
        octx.drawImage(canvas, 0, 0);
        return out.toDataURL('image/png');
    }

    function download() {
        const a = document.createElement('a');
        a.href = exportDataUrl();
        a.download = 'ai-sketch-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function importFile(file) {
        if (!file || !file.type || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = function () {
            const img = new Image();
            img.onload = function () {
                clearCanvas();
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (canvas.width - w) / 2;
                const y = (canvas.height - h) / 2;
                ctx.drawImage(img, x, y, w, h);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    function dispatchPasteLike(dataUrl) {
        const zone = qs('aiimg-seed-paste-zone');
        if (!zone) return false;
        try {
            const bin = atob(dataUrl.split(',')[1] || '');
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const file = new File([bytes], 'sketch.png', { type: 'image/png' });
            const dt = new DataTransfer();
            dt.items.add(file);
            const ev = new Event('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(ev, 'clipboardData', { value: dt });
            zone.dispatchEvent(ev);
            return true;
        } catch (e) {
            return false;
        }
    }

    function sendToTarget() {
        const dataUrl = exportDataUrl();
        if (targetMode === 'ssp') {
            if (!window.viewerSSPApplySketchImage || !window.viewerSSPApplySketchImage(dataUrl)) {
                alert('sspimgAI 이미지 입력 영역을 찾을 수 없습니다.');
                return;
            }
        } else if (targetMode === 'insert') {
            applyToImageInsert(dataUrl);
        } else if (targetMode === 'tryon' && window.AiImage && typeof AiImage.applyVirtualTryOnFromDataUrl === 'function') {
            AiImage.applyVirtualTryOnFromDataUrl(dataUrl, '스케치 그림판');
        } else if (window.AiImage && typeof AiImage.applySeedFromDataUrl === 'function') {
            AiImage.applySeedFromDataUrl(dataUrl);
        } else if (!dispatchPasteLike(dataUrl)) {
            alert('이미지 입력 영역을 찾을 수 없습니다.');
            return;
        }
        const useCb = qs('aiimg-seed-use-cb');
        if (targetMode === 'seed' && useCb) useCb.checked = true;
        if (typeof App !== 'undefined' && App._toast) {
            App._toast(targetMode === 'tryon'
                ? '스케치가 Virtual try-on 이미지로 들어갔습니다.'
                : targetMode === 'insert'
                    ? '스케치가 이미지삽입 탭에 들어갔습니다.'
                    : targetMode === 'ssp'
                        ? '스케치가 sspimgAI에 들어갔습니다.'
                        : '스케치가 시드 이미지로 들어갔습니다.');
        }
        close();
    }

    function applyToImageInsert(dataUrl) {
        if (window.applyImageInsertDataUrl && window.applyImageInsertDataUrl(dataUrl, 'sketch.png')) {
            return;
        }
        const urlEl = qs('img-insert-url') || qs('img-url');
        const altEl = qs('img-alt');
        const dropText = qs('img-drop-text');
        const cropBtn = qs('img-insert-crop-btn');
        if (!urlEl) {
            alert('이미지삽입 입력 영역을 찾을 수 없습니다.');
            return;
        }
        urlEl.value = dataUrl;
        if (altEl && !altEl.value) altEl.value = '스케치 그림';
        if (typeof window._showImgpv === 'function') window._showImgpv(dataUrl);
        else {
            const preview = qs('img-insert-preview') || qs('imgpv-preview');
            const placeholder = qs('imgpv-placeholder');
            if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
            if (placeholder) placeholder.style.display = 'none';
        }
        if (dropText) {
            dropText.textContent = '스케치 그림판 이미지 준비됨';
            dropText.style.color = 'var(--ok)';
        }
        if (cropBtn) cropBtn.disabled = false;
        urlEl.dispatchEvent(new Event('input', { bubbles: true }));
        urlEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function uploadInsertImageToImgBB(ev) {
        if (targetMode === 'ssp' && window.viewerSSPApplySketchImage && window.viewerSSPUploadToImgbb) {
            const dataUrl = exportDataUrl();
            window.viewerSSPApplySketchImage(dataUrl);
            await window.viewerSSPUploadToImgbb(dataUrl);
            const sspUrlEl = qs('ssp-image-link-url');
            const url = sspUrlEl ? String(sspUrlEl.value || '').trim() : '';
            if (url) lastImgBBUrl = url;
            return url;
        }
        if (targetMode === 'insert') applyToImageInsert(exportDataUrl());
        if (targetMode === 'insert' && typeof window.uploadImageInsertToImgbb === 'function') {
            await window.uploadImageInsertToImgbb();
            const currentUrlEl = qs('img-insert-url');
            const currentUrl = currentUrlEl ? String(currentUrlEl.value || '').trim() : '';
            if (currentUrl) lastImgBBUrl = currentUrl;
            return currentUrl;
        }
        if (!window.ImgBBUpload || typeof ImgBBUpload.uploadFromInsertPanel !== 'function') {
            alert('ImgBB 업로드 기능을 찾을 수 없습니다.');
            return;
        }
        const btn = ev && ev.target ? ev.target.closest('button') : null;
        const url = await ImgBBUpload.uploadFromInsertPanel({ target: btn });
        if (url) {
            lastImgBBUrl = url;
            const resultBar = qs('ai-sketch-imgbb-result-bar');
            const resultLink = qs('ai-sketch-imgbb-result-link');
            if (resultBar && resultLink) {
                resultLink.textContent = url;
                resultLink.href = url;
                resultBar.style.display = 'flex';
            }
            const urlEl = qs('img-insert-url') || qs('img-url');
            if (urlEl) {
                urlEl.value = url;
                urlEl.dispatchEvent(new Event('input', { bubbles: true }));
                urlEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        if (url && navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(url);
                if (typeof App !== 'undefined' && App._toast) App._toast('ImgBB 링크가 생성되고 복사되었습니다.');
            } catch (e) {}
        }
        return url;
    }

    async function insertImageLinkToDocument() {
        const imageUrlEl = qs('img-insert-url') || qs('img-url');
        const url = String(lastImgBBUrl || (imageUrlEl ? imageUrlEl.value : '') || '').trim();
        if (!url) {
            alert('먼저 ImgBB 업로드를 완료하여 링크를 생성하세요.');
            return;
        }
        const urlEl = qs('img-insert-url') || qs('img-url');
        const altEl = qs('img-alt');
        if (urlEl) {
            urlEl.value = url;
            urlEl.dispatchEvent(new Event('input', { bubbles: true }));
            urlEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (altEl && !altEl.value) altEl.value = '스케치 그림';
        if (window.ImgBBUpload && typeof ImgBBUpload.insertFromInsertPanel === 'function') {
            ImgBBUpload.insertFromInsertPanel();
            return;
        }
        alert('문서에 삽입할 수 있는 ImgBB 삽입 기능을 찾을 수 없습니다.');
    }

    async function insertCurrentImageToDocument() {
        if (targetMode === 'ssp') applyToImageInsert(exportDataUrl());
        if (targetMode === 'insert') applyToImageInsert(exportDataUrl());
        const urlEl = qs('img-insert-url') || qs('img-url');
        const url = urlEl ? String(urlEl.value || '').trim() : '';
        if (!url) {
            alert('먼저 이미지삽입 탭에서 이미지를 불러오거나 스케치 그림판으로 이미지를 넣으세요.');
            return;
        }
        if (targetMode === 'insert' && typeof window.saveImageInsertToInternalDb === 'function' && typeof window.insertImageFromModal === 'function') {
            if (url.startsWith('data:image')) await window.saveImageInsertToInternalDb();
            window.insertImageFromModal('markdown');
            return;
        }
        const imgInsertApi = (typeof ImgInsert !== 'undefined') ? ImgInsert : (window && window.ImgInsert ? window.ImgInsert : null);
        if (url.startsWith('data:image')) {
            if (!imgInsertApi || typeof imgInsertApi.saveToInDB !== 'function' || typeof imgInsertApi.doInsertToEditor !== 'function') {
                alert('문서 내부 저장 기능을 찾을 수 없습니다.');
                return;
            }
            await imgInsertApi.saveToInDB();
            imgInsertApi.doInsertToEditor();
            return;
        }
        if (window.ImgBBUpload && typeof ImgBBUpload.insertFromInsertPanel === 'function') {
            ImgBBUpload.insertFromInsertPanel();
            return;
        }
        alert('문서 이미지삽입 기능을 찾을 수 없습니다.');
    }

    function bind() {
        canvas.addEventListener('pointerdown', startDraw);
        canvas.addEventListener('pointermove', moveDraw);
        canvas.addEventListener('pointerup', endDraw);
        canvas.addEventListener('pointercancel', endDraw);
        canvas.addEventListener('pointerleave', endDraw);
        qs('ai-sketch-close').onclick = close;
        qs('ai-sketch-clear').onclick = clearCanvas;
        qs('ai-sketch-export').onclick = download;
        qs('ai-sketch-send').onclick = sendToTarget;
        qs('ai-sketch-imgbb').onclick = uploadInsertImageToImgBB;
        qs('ai-sketch-imgbb-insert').onclick = insertImageLinkToDocument;
        qs('ai-sketch-doc-insert').onclick = insertCurrentImageToDocument;
        qs('ai-sketch-import-btn').onclick = () => qs('ai-sketch-import').click();
        overlay.querySelectorAll('.ai-sketch-tool-btn').forEach((btn) => {
            btn.onclick = () => {
                qs('ai-sketch-tool').value = btn.getAttribute('data-tool') || 'pen';
                overlay.querySelectorAll('.ai-sketch-tool-btn').forEach((b) => b.classList.toggle('active', b === btn));
            };
        });
        qs('ai-sketch-import').onchange = (ev) => {
            importFile(ev.target.files && ev.target.files[0]);
            ev.target.value = '';
        };
        bindFloatingWindow();
    }

    function clampWindowPosition(box) {
        const margin = 8;
        const rect = box.getBoundingClientRect();
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        const left = Math.min(Math.max(rect.left, margin), maxLeft);
        const top = Math.min(Math.max(rect.top, margin), maxTop);
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.transform = 'none';
    }

    function bindFloatingWindow() {
        const box = qs('ai-sketch-pad-box');
        const head = qs('ai-sketch-pad-head');
        if (!box || !head || box._aiSketchFloatingBound) return;
        box._aiSketchFloatingBound = true;
        head.addEventListener('pointerdown', (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest('button,input,select,label')) return;
            const rect = box.getBoundingClientRect();
            draggingWindow = true;
            dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
            box.style.left = rect.left + 'px';
            box.style.top = rect.top + 'px';
            box.style.transform = 'none';
            head.setPointerCapture?.(ev.pointerId);
            ev.preventDefault();
        });
        head.addEventListener('pointermove', (ev) => {
            if (!draggingWindow) return;
            const rect = box.getBoundingClientRect();
            const margin = 8;
            const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
            const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
            const left = Math.min(Math.max(ev.clientX - dragOffset.x, margin), maxLeft);
            const top = Math.min(Math.max(ev.clientY - dragOffset.y, margin), maxTop);
            box.style.left = left + 'px';
            box.style.top = top + 'px';
            ev.preventDefault();
        });
        const stopDrag = (ev) => {
            draggingWindow = false;
            if (ev && ev.pointerId != null) head.releasePointerCapture?.(ev.pointerId);
        };
        head.addEventListener('pointerup', stopDrag);
        head.addEventListener('pointercancel', stopDrag);
        window.addEventListener('resize', () => {
            if (overlay && overlay.style.display !== 'none') clampWindowPosition(box);
        });
    }

    function open(mode) {
        build();
        targetMode = mode === 'tryon' ? 'tryon' : mode === 'insert' ? 'insert' : mode === 'ssp' ? 'ssp' : 'seed';
        const sendBtn = qs('ai-sketch-send');
        const help = qs('ai-sketch-target-help');
        if (sendBtn) sendBtn.textContent = targetMode === 'tryon'
            ? 'Virtual try-on 이미지로 넣기'
            : targetMode === 'insert'
                ? '이미지삽입에 넣기'
                : targetMode === 'ssp'
                    ? 'sspimgAI에 넣기'
                    : '이미지 붙여넣기로 넣기';
        if (help) help.textContent = targetMode === 'tryon'
            ? '간단한 개형을 그리고 버튼을 누르면 Virtual try-on 이미지로 들어갑니다.'
            : targetMode === 'insert'
                ? '간단한 개형을 그리고 버튼을 누르면 이미지삽입 탭의 업로드 이미지로 들어갑니다.'
                : targetMode === 'ssp'
                    ? '간단한 개형을 그리고 버튼을 누르면 sspimgAI 이미지 입력과 결과 이미지로 들어갑니다.'
                    : '간단한 개형을 그리고 “이미지 붙여넣기로 넣기”를 누르면 현재 AI-image/AI-tryon 시드 이미지로 들어갑니다.';
        overlay.style.display = 'block';
        clampWindowPosition(qs('ai-sketch-pad-box'));
    }

    function close() {
        if (overlay) overlay.style.display = 'none';
    }

    function installButton() {
        const wrap = qs('aiimg-seed-actions-wrap');
        if (!wrap || qs('aiimg-sketch-pad-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'aiimg-sketch-pad-btn';
        btn.className = 'btn btn-p btn-sm';
        btn.style.fontSize = '11px';
        btn.textContent = '스케치 그림판';
        btn.title = '간단한 개형을 그려 시드 이미지로 넣기';
        btn.onclick = () => open('seed');
        wrap.insertBefore(btn, wrap.firstChild);
    }

    function installTryonButton() {
        const clearBtn = qs('aiimg-virtual-tryon-clear');
        if (!clearBtn || qs('aiimg-tryon-sketch-pad-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'aiimg-tryon-sketch-pad-btn';
        btn.className = 'btn btn-p btn-sm';
        btn.style.fontSize = '11px';
        btn.textContent = '스케치 그림판';
        btn.title = '간단한 개형을 그려 Virtual try-on 이미지로 넣기';
        btn.onclick = () => open('tryon');
        clearBtn.parentElement.insertBefore(btn, clearBtn);
    }

    function installInsertButton() {
        const cropBtn = qs('img-insert-crop-btn');
        if (!cropBtn || qs('img-insert-sketch-pad-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'img-insert-sketch-pad-btn';
        btn.className = 'btn btn-p btn-sm';
        btn.style.fontSize = '11px';
        btn.textContent = '스케치 그림판';
        btn.title = '간단한 그림을 그려 이미지삽입 탭에 넣기';
        btn.onclick = () => open('insert');
        cropBtn.parentElement.insertBefore(btn, cropBtn);
    }

    function installToolbarSketchButton() {
        const existing = qs('painttools-toolbar-wrap');
        if (existing) {
            existing.querySelectorAll('#painttools-toolbar-imgbb,#painttools-toolbar-insert').forEach((btn) => btn.remove());
            const sketch = qs('painttools-toolbar-sketch');
            if (sketch) {
                styleToolbarSketchButton(sketch);
                sketch.onclick = () => open('insert');
                return;
            }
        }
        const buttons = Array.from(document.querySelectorAll('button'));
        const transcribeBtn = buttons.find((btn) => {
            const text = (btn.textContent || '').trim();
            return text.includes('전사') && btn.title === '전사';
        });
        if (!transcribeBtn) return;
        const transcribeGroup = transcribeBtn.closest('.tg') || transcribeBtn.parentElement;
        if (!transcribeGroup || !transcribeGroup.parentElement) return;
        const wrap = document.createElement('div');
        wrap.className = 'tg';
        wrap.id = 'painttools-toolbar-wrap';
        wrap.innerHTML = '<button class="tb tb-util painttools-toolbar-sketch-btn" type="button" id="painttools-toolbar-sketch" title="스케치그림판" data-tooltip="스케치 그림판을 열어 이미지삽입 탭에 넣기">스케치그림판</button>';
        transcribeGroup.parentElement.insertBefore(wrap, transcribeGroup.nextSibling);
        styleToolbarSketchButton(qs('painttools-toolbar-sketch'));
        qs('painttools-toolbar-sketch').onclick = () => open('insert');
    }

    function removeWrongToolbarButtons() {
        const wrap = qs('painttools-toolbar-wrap');
        if (!wrap) return;
        wrap.querySelectorAll('#painttools-toolbar-imgbb,#painttools-toolbar-insert').forEach((btn) => btn.remove());
    }

    function styleToolbarSketchButton(btn) {
        if (!btn) return;
        if (btn.dataset.painttoolsStyled === 'toolbar-v3') return;
        btn.dataset.painttoolsStyled = 'toolbar-v3';
        btn.classList.add('painttools-sketch-top-btn');
        if ((btn.textContent || '').trim() !== '스케치그림판') btn.textContent = '스케치그림판';
        btn.title = '스케치그림판';
        btn.dataset.tooltip = '스케치 그림판을 열어 이미지삽입 탭에 넣기';
        btn.style.setProperty('display', 'inline-flex', 'important');
        btn.style.setProperty('align-items', 'center', 'important');
        btn.style.setProperty('justify-content', 'center', 'important');
        btn.style.setProperty('min-height', '24px', 'important');
        btn.style.setProperty('padding', '3px 10px', 'important');
        btn.style.setProperty('border-radius', '6px', 'important');
        btn.style.setProperty('background', 'transparent', 'important');
        btn.style.setProperty('border', 'none', 'important');
        btn.style.setProperty('color', '#5ac8d4', 'important');
        btn.style.setProperty('font-weight', '700', 'important');
        btn.style.setProperty('font-size', '12px', 'important');
        btn.style.setProperty('line-height', '1.2', 'important');
        btn.style.setProperty('letter-spacing', '0', 'important');
        btn.style.removeProperty('box-shadow');
        btn.style.removeProperty('text-shadow');
        btn.style.setProperty('opacity', '1', 'important');
        btn.onmouseenter = () => {
            btn.style.setProperty('background', 'rgba(90, 200, 212, .12)', 'important');
            btn.style.setProperty('color', '#5ac8d4', 'important');
        };
        btn.onmouseleave = () => {
            btn.style.setProperty('background', 'transparent', 'important');
            btn.style.setProperty('color', '#5ac8d4', 'important');
        };
    }

    function boot() {
        installButton();
        installTryonButton();
        installInsertButton();
        removeWrongToolbarButtons();
        installToolbarSketchButton();
        let observerTimer = 0;
        const mo = new MutationObserver(() => {
            if (observerTimer) return;
            observerTimer = setTimeout(() => {
                observerTimer = 0;
                installButton();
                installTryonButton();
                installInsertButton();
                removeWrongToolbarButtons();
                installToolbarSketchButton();
            }, 80);
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    return {
        open,
        close,
        sendToTarget,
        uploadInsertImageToImgBB,
        insertCurrentImageToDocument,
        installButton,
        installTryonButton,
        installInsertButton,
        removeWrongToolbarButtons,
        installToolbarSketchButton
    };
})();
window.AiSketchPad = AiSketchPad;
