(function () {
  const PPTX_VENDOR_SCRIPTS = [
    "../../../vendor/pptxjs/js/jquery-1.11.3.min.js",
    "../../../vendor/pptxjs/js/jszip.min.js",
    "../../../vendor/pptxjs/filereader.js",
    "../../../vendor/pptxjs/js/d3.min.js",
    "../../../vendor/pptxjs/js/nv.d3.min.js",
    "../../../vendor/pptxjs/js/dingbat.js",
    "../../../vendor/pptxjs/js/pptxjs.js",
    "../../../vendor/pptxjs/js/divs2slides.js"
  ];
  const PPTX_VENDOR_STYLES = [
    "../../../vendor/pptxjs/css/pptxjs.css",
    "../../../vendor/pptxjs/css/nv.d3.min.css"
  ];
  let vendorPromise = null;

  function loadScriptOnce(relativeUrl) {
    const absoluteUrl = new URL(relativeUrl, window.location.href).href;
    const existing = Array.from(document.scripts).find((script) => script.src === absoluteUrl);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = absoluteUrl;
      script.onload = resolve;
      script.onerror = () => reject(new Error("PPTX library load failed: " + relativeUrl));
      document.head.appendChild(script);
    });
  }

  function loadStyleOnce(relativeUrl) {
    const absoluteUrl = new URL(relativeUrl, window.location.href).href;
    const existing = Array.from(document.styleSheets).some((sheet) => sheet.href === absoluteUrl);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = absoluteUrl;
      link.onload = resolve;
      link.onerror = () => reject(new Error("PPTX stylesheet load failed: " + relativeUrl));
      document.head.appendChild(link);
    });
  }

  function ensurePptxVendor() {
    if (vendorPromise) return vendorPromise;
    vendorPromise = Promise.all(PPTX_VENDOR_STYLES.map((src) => loadStyleOnce(src)))
      .then(() => PPTX_VENDOR_SCRIPTS.reduce(
        (promise, src) => promise.then(() => loadScriptOnce(src)),
        Promise.resolve()
      ));
    return vendorPromise;
  }

  function waitForRenderedSlides(host) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let lastCount = 0;
      let stableTicks = 0;
      const timer = setInterval(() => {
        const rendered = host.querySelectorAll("#all_slides_warpper > .slide, #all_slides_warpper > .pptx-slide");
        const count = rendered.length;
        if (count > 0 && count === lastCount) stableTicks += 1;
        else stableTicks = 0;
        lastCount = count;
        if (count > 0 && stableTicks >= 4) {
          clearInterval(timer);
          resolve(Array.from(rendered));
          return;
        }
        if (Date.now() - startedAt > 30000) {
          clearInterval(timer);
          reject(new Error("PPTX HTML 렌더링 시간이 초과되었습니다."));
        }
      }, 200);
    });
  }

  function inlineRenderedStyles(sourceRoot, cloneRoot) {
    const sourceNodes = [sourceRoot].concat(Array.from(sourceRoot.querySelectorAll("*")));
    const cloneNodes = [cloneRoot].concat(Array.from(cloneRoot.querySelectorAll("*")));
    const properties = [
      "color", "background-color", "font-family", "font-size", "font-weight", "font-style",
      "line-height", "letter-spacing", "text-align", "text-decoration", "opacity", "fill", "stroke"
    ];
    const count = Math.min(sourceNodes.length, cloneNodes.length);
    for (let i = 0; i < count; i++) {
      const source = sourceNodes[i];
      const target = cloneNodes[i];
      const computed = window.getComputedStyle(source);
      properties.forEach((property) => {
        const value = String(computed.getPropertyValue(property) || "").trim();
        if (!value || value === "inherit" || value === "initial" || value === "normal") return;
        if ((property === "background-color" || property === "fill" || property === "stroke")
          && (value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "none")) return;
        target.style.setProperty(property, value);
      });
    }
  }

  function fitPptxSlideHtmlToCanvas(html, targetWidth, targetHeight) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");
    const slide = doc.querySelector(".genslide-pptx-fit-frame > .slide, .genslide-pptx-fit-frame > .pptx-slide, body > .slide, body > .pptx-slide");
    if (!slide) return String(html || "");

    const targetW = Math.max(320, Number(targetWidth) || (typeof slideWidth !== "undefined" ? slideWidth : 1280) || 1280);
    const targetH = Math.max(240, Number(targetHeight) || (typeof slideHeight !== "undefined" ? slideHeight : 720) || 720);
    const previousFrame = slide.closest(".genslide-pptx-fit-frame");
    const originalW = Math.max(1,
      Number(previousFrame && previousFrame.getAttribute("data-source-width")) ||
      parseFloat(slide.style.width) || Number(slide.getAttribute("width")) || 1280);
    const originalH = Math.max(1,
      Number(previousFrame && previousFrame.getAttribute("data-source-height")) ||
      parseFloat(slide.style.height) || Number(slide.getAttribute("height")) || 720);
    const scale = Math.min(targetW / originalW, targetH / originalH);
    const fittedW = originalW * scale;
    const fittedH = originalH * scale;
    const offsetX = Math.max(0, (targetW - fittedW) / 2);
    const offsetY = Math.max(0, (targetH - fittedH) / 2);

    let frame = previousFrame;
    if (!frame) {
      frame = doc.createElement("div");
      frame.className = "genslide-pptx-fit-frame";
      slide.parentNode.insertBefore(frame, slide);
      frame.appendChild(slide);
    }
    frame.setAttribute("data-source-width", String(originalW));
    frame.setAttribute("data-source-height", String(originalH));
    frame.style.cssText = "position:relative;width:" + targetW + "px;height:" + targetH +
      "px;overflow:hidden;margin:0;background:#fff;box-sizing:border-box;";
    slide.style.setProperty("position", "absolute", "important");
    slide.style.setProperty("left", offsetX + "px", "important");
    slide.style.setProperty("top", offsetY + "px", "important");
    slide.style.setProperty("width", originalW + "px", "important");
    slide.style.setProperty("height", originalH + "px", "important");
    slide.style.setProperty("margin", "0", "important");
    slide.style.setProperty("transform-origin", "0 0", "important");
    slide.style.setProperty("transform", "scale(" + scale + ")", "important");
    doc.documentElement.style.width = targetW + "px";
    doc.documentElement.style.height = targetH + "px";
    doc.body.style.width = targetW + "px";
    doc.body.style.height = targetH + "px";
    doc.body.style.margin = "0";
    doc.body.style.overflow = "hidden";
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  }

  function makeSlideDocument(slideElement) {
    const clone = slideElement.cloneNode(true);
    inlineRenderedStyles(slideElement, clone);
    clone.removeAttribute("id");
    const cssUrl = new URL("../../../vendor/pptxjs/css/pptxjs.css", window.location.href).href;
    const chartCssUrl = new URL("../../../vendor/pptxjs/css/nv.d3.min.css", window.location.href).href;
    const documentHtml = "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<link rel=\"stylesheet\" href=\"" + cssUrl + "\">" +
      "<link rel=\"stylesheet\" href=\"" + chartCssUrl + "\">" +
      "<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden;}" +
      "body>.slide,body>.pptx-slide{position:relative!important;margin:0!important;transform:none!important;transform-origin:0 0!important;}</style>" +
      "</head><body>" + clone.outerHTML + "</body></html>";
    return fitPptxSlideHtmlToCanvas(documentHtml);
  }

  async function importPptxToGenSlide(file) {
    if (!file) throw new Error("PPTX 파일이 없습니다.");
    if (!/\.(pptx|ppsx)$/i.test(String(file.name || ""))) {
      throw new Error("PPTX 또는 PPSX 파일을 선택하세요.");
    }
    await ensurePptxVendor();
    if (!window.jQuery || !window.jQuery.fn || typeof window.jQuery.fn.pptxToHtml !== "function") {
      throw new Error("PPTX HTML renderer를 초기화하지 못했습니다.");
    }

    const buffer = await file.arrayBuffer();
    const host = document.createElement("div");
    host.id = "genslide-pptx-import-renderer";
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "0";
    host.style.width = "1280px";
    host.style.minHeight = "720px";
    host.style.visibility = "hidden";
    host.style.pointerEvents = "none";
    document.body.appendChild(host);

    try {
      if (!window.JSZipUtils) window.JSZipUtils = {};
      window.JSZipUtils.getBinaryContent = function (_url, callback) {
        setTimeout(() => callback(null, buffer), 0);
      };
      window.jQuery(host).pptxToHtml({
        pptxFileUrl: "memory-import.pptx",
        slidesScale: "100%",
        slideMode: false,
        keyBoardShortCut: false,
        mediaProcess: true,
        jsZipV2: false,
        themeProcess: "colorsAndImageOnly",
        incSlide: { width: 0, height: 0 }
      });
      const renderedSlides = await waitForRenderedSlides(host);
      const importedSlides = renderedSlides.map((slide) => ({ html: makeSlideDocument(slide) }));
      if (!importedSlides.length) throw new Error("변환된 슬라이드가 없습니다.");

      if (typeof pushHistory === "function") pushHistory();
      slides = importedSlides;
      cur = 0;
      if (typeof expandedSlideIndex !== "undefined") expandedSlideIndex = 0;
      loadCurrent();
      return importedSlides.length;
    } finally {
      host.remove();
    }
  }

  window.importPptxToGenSlide = importPptxToGenSlide;
  window.fitPptxSlideHtmlToCanvas = fitPptxSlideHtmlToCanvas;
})();
