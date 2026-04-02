(function (global) {
  'use strict';

  const DIM_MAP = {
    LAYOUT_WIDE: { w: 13.33, h: 7.5 },
    LAYOUT_16x9: { w: 10, h: 5.625 },
    LAYOUT_4x3: { w: 10, h: 7.5 }
  };

  function ensureLibs() {
    if (typeof global.html2canvas !== 'function') {
      throw new Error('html2canvas is not loaded.');
    }
    if (typeof global.PptxGenJS !== 'function') {
      throw new Error('PptxGenJS is not loaded.');
    }
  }

  function blankCanvas(msg) {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#888888';
    ctx.font = '18px Arial';
    ctx.fillText('Render failed: ' + (msg || ''), 40, 360);
    return c.toDataURL('image/jpeg', 0.93);
  }

  function captureSlide(html, options) {
    const opts = options || {};
    const width = Number(opts.width || 1280);
    const height = Number(opts.height || 720);
    const waitMs = Number(opts.waitMs || 500);

    return new Promise((resolve) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + width + 'px;height:' + height + 'px;z-index:-999;overflow:hidden;';
      document.body.appendChild(wrapper);

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:' + width + 'px;height:' + height + 'px;border:none;';
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      wrapper.appendChild(iframe);

      function cleanup() {
        try { document.body.removeChild(wrapper); } catch (e) {}
      }

      iframe.onload = function () {
        setTimeout(function () {
          try {
            const doc = iframe.contentDocument;
            if (!doc) {
              cleanup();
              resolve(blankCanvas('iframe document not available'));
              return;
            }

            global.html2canvas(doc.documentElement, {
              width,
              height,
              windowWidth: width,
              windowHeight: height,
              backgroundColor: '#ffffff',
              scale: 1,
              useCORS: true,
              allowTaint: true,
              logging: false
            }).then(function (canvas) {
              cleanup();
              resolve(canvas.toDataURL('image/jpeg', 0.93));
            }).catch(function (err) {
              cleanup();
              resolve(blankCanvas(err && err.message ? err.message : 'html2canvas failed'));
            });
          } catch (e) {
            cleanup();
            resolve(blankCanvas(e && e.message ? e.message : 'capture exception'));
          }
        }, waitMs);
      };

      iframe.onerror = function () {
        cleanup();
        resolve(blankCanvas('iframe load error'));
      };

      iframe.srcdoc = String(html || '');
    });
  }

  function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function isComplexHtml(html) {
    const s = String(html || '').toLowerCase();
    if (!s.trim()) return false;
    if (/<script\b/.test(s)) return true;
    if (/<canvas\b/.test(s)) return true;
    if (/<svg\b/.test(s)) return true;
    if (/chart\.?js|mermaid|plotly|echarts|d3\./.test(s)) return true;
    if (/class\s*=\s*"[^"]*(\bgrid\b|\bflex\b|\babsolute\b|\brelative\b|\bw-\d|\bh-\d|\bpx-\d|\bpy-\d|\bbg-|\bshadow\b|\brounded\b)[^"]*"/.test(s)) return true;
    return false;
  }

  function parseBlocksFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ''), 'text/html');
    const root = doc.body || doc.documentElement;
    if (!root) return [];

    const blocks = [];
    const nodes = root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,table,img');
    nodes.forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      if (!tag) return;

      if (tag !== 'table' && el.closest('table')) return;
      if (tag === 'p' && el.closest('li')) return;

      if (tag === 'table') {
        const rows = [];
        el.querySelectorAll('tr').forEach((tr) => {
          const row = [];
          tr.querySelectorAll('th,td').forEach((cell) => {
            row.push(normalizeText(cell.textContent));
          });
          if (row.length) rows.push(row);
        });
        if (rows.length) blocks.push({ type: 'table', rows });
        return;
      }

      if (tag === 'img') {
        const src = normalizeText(el.getAttribute('src'));
        if (src) blocks.push({ type: 'image', src });
        return;
      }

      const text = normalizeText(el.textContent);
      if (!text) return;
      if (tag === 'li') blocks.push({ type: 'text', level: 'li', text: '• ' + text });
      else blocks.push({ type: 'text', level: tag, text });
    });

    return blocks;
  }

  function textStyleForLevel(level) {
    switch (level) {
      case 'h1': return { fontSize: 34, bold: true, color: '1F2937', h: 0.55 };
      case 'h2': return { fontSize: 28, bold: true, color: '1F2937', h: 0.5 };
      case 'h3': return { fontSize: 22, bold: true, color: '1F2937', h: 0.45 };
      case 'h4': return { fontSize: 18, bold: true, color: '1F2937', h: 0.4 };
      case 'h5': return { fontSize: 16, bold: true, color: '1F2937', h: 0.36 };
      case 'h6': return { fontSize: 14, bold: true, color: '1F2937', h: 0.34 };
      case 'li': return { fontSize: 14, bold: false, color: '334155', h: 0.3 };
      default: return { fontSize: 14, bold: false, color: '334155', h: 0.3 };
    }
  }

  function addImageBlock(slide, src, x, y, w, h) {
    if (!src) return false;
    try {
      if (/^data:image\//i.test(src)) {
        slide.addImage({ data: src, x, y, w, h });
      } else {
        slide.addImage({ path: src, x, y, w, h });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function addHybridSlide(pptx, html, dims) {
    if (isComplexHtml(html)) return false;

    const blocks = parseBlocksFromHtml(html);
    if (!blocks.length) return false;

    let slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    const marginX = 0.55;
    const maxW = dims.w - (marginX * 2);
    const bottomLimit = dims.h - 0.45;
    let y = 0.35;

    const ensureSpace = (needH) => {
      if (y + needH <= bottomLimit) return;
      slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      y = 0.35;
    };

    blocks.forEach((b) => {
      if (b.type === 'text') {
        const st = textStyleForLevel(b.level);
        const textLen = Math.max(1, String(b.text).length);
        const extraLines = Math.floor(textLen / 80);
        const h = st.h + (extraLines * 0.16);
        ensureSpace(h + 0.08);
        slide.addText(String(b.text), {
          x: marginX,
          y,
          w: maxW,
          h,
          fontFace: 'Noto Sans KR',
          fontSize: st.fontSize,
          bold: st.bold,
          color: st.color,
          valign: 'top'
        });
        y += h + 0.08;
        return;
      }

      if (b.type === 'table') {
        const rowCount = b.rows.length;
        const rowH = 0.28;
        const h = Math.max(0.7, rowCount * rowH + 0.08);
        ensureSpace(h + 0.1);
        slide.addTable(b.rows, {
          x: marginX,
          y,
          w: maxW,
          h,
          fontFace: 'Noto Sans KR',
          fontSize: 12,
          border: { type: 'solid', color: 'D1D5DB', pt: 1 },
          color: '334155',
          fill: 'FFFFFF',
          valign: 'middle'
        });
        y += h + 0.1;
        return;
      }

      if (b.type === 'image') {
        const h = Math.min(3.2, bottomLimit - y);
        if (h <= 0.2) {
          ensureSpace(2.4);
        }
        const useH = Math.min(2.8, bottomLimit - y);
        const ok = addImageBlock(slide, b.src, marginX, y, maxW, useH);
        if (ok) y += useH + 0.1;
      }
    });

    return true;
  }

  async function addImageSlide(pptx, html, dims) {
    const imgData = await captureSlide(html);
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addImage({ data: imgData, x: 0, y: 0, w: dims.w, h: dims.h });
  }

  async function exportSlides(options) {
    const opts = options || {};
    const slides = Array.isArray(opts.slides) ? opts.slides : [];
    const filename = String(opts.filename || 'presentation');
    const author = String(opts.author || 'Slide Editor');
    const layout = String(opts.layout || 'LAYOUT_WIDE');
    const mode = String(opts.mode || 'image');
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const dims = DIM_MAP[layout] || DIM_MAP.LAYOUT_WIDE;

    ensureLibs();
    if (!slides.length) throw new Error('No slides to export.');

    const pptx = new global.PptxGenJS();
    pptx.layout = layout;
    pptx.author = author;
    pptx.title = filename;

    for (let i = 0; i < slides.length; i += 1) {
      if (onProgress) onProgress({ phase: 'analyze', index: i, total: slides.length });
      const slideItem = slides[i];
      const html = typeof slideItem === 'string' ? slideItem : (slideItem && slideItem.html) || '';

      if (mode === 'editable') {
        if (onProgress) onProgress({ phase: 'capture', index: i, total: slides.length });
        const ok = addHybridSlide(pptx, html, dims);
        if (!ok) {
          await addImageSlide(pptx, html, dims);
        }
      } else {
        if (onProgress) onProgress({ phase: 'capture', index: i, total: slides.length });
        await addImageSlide(pptx, html, dims);
      }

      await new Promise((r) => setTimeout(r, 20));
    }

    if (onProgress) onProgress({ phase: 'writing', index: slides.length, total: slides.length });
    await pptx.writeFile({ fileName: filename + '.pptx' });
    if (onProgress) onProgress({ phase: 'done', index: slides.length, total: slides.length });
  }

  global.Html2PptxExport = {
    captureSlide,
    exportSlides
  };
})(window);