(() => {
  const UI_FILES = {
    main: "./ui/main.html",
    header: "./ui/header.html",
    leftSidebar: "./ui/leftSidebar.html",
    htmlCode: "./ui/htmlcode.html",
    editor: "./ui/editor.html"
  };
  const INLINE_UI = {
    main: `<div class="app">
  <div id="slot-header"></div>
  <div id="slot-left-sidebar"></div>

  <main class="main">
    <div class="toolbar">
      <span class="info">WYSIWYG Mode</span>
      <div class="view-mode-group" id="viewModeGroup">
        <button class="btn tiny active" id="btnViewBoth" title="HTML Code + Editor">Both</button>
        <button class="btn tiny" id="btnViewCodeOnly" title="HTML Code only">Htmlcode</button>
        <button class="btn tiny" id="btnViewEditorOnly" title="Editor only">Editor</button>
      </div>
      <div class="spacer"></div>
      <button class="btn tiny" id="btnSlideShow">Slide Show</button>
      <button class="btn tiny" id="btnSlideSettings" title="Slide Settings">Settings</button>
      <button class="btn tiny" id="btnThemeMode" title="Theme Mode">Theme: Dark</button>
    </div>

    <div class="work" id="workSplitRoot">
      <div id="slot-htmlcode"></div>
      <div class="panel-splitter" id="panelSplitter" title="Resize panels"></div>
      <div id="slot-editor"></div>
    </div>
  </main>
</div>`,
    header: `<div class="top">
  <div class="title">JenaEditor</div>
  <button class="btn dark" id="btnPrev">Prev</button>
  <button class="btn dark" id="btnNext">Next</button>
  <button class="btn dark" id="btnGallery">Gallery</button>
  <div id="slideInfo">1 / 1</div>
  <div class="spacer"></div>
  <button class="btn" id="btnInDbSave">inDB Save</button>
  <button class="btn" id="btnInDbOpen">inDB Open</button>
  <button class="btn" id="btnImport">mpp Import</button>
  <button class="btn" id="btnPptxImport">pptx Import</button>
  <button class="btn" id="btnExport">mpp Export</button>
  <button class="btn" id="btnImageExport">image Export</button>
  <button class="btn" id="btnPptxExport">pptx Export</button>
  <button class="btn" id="btnScholarAI">ScholarAI</button>
  <input id="fileInput" type="file" accept=".mpp,.json,application/json,text/plain" style="display:none">
  <input id="pptxFileInput" type="file" accept=".pptx,.ppsx,application/vnd.openxmlformats-officedocument.presentationml.presentation" style="display:none">
</div>`,
    leftSidebar: `<aside class="side">
  <div class="side-head">
    <span>Slides</span>
    <div style="display:flex;gap:6px;align-items:center;">
      <button class="btn tiny" id="btnResetSlides" title="Reset all slides">Reset</button>
      <button class="btn tiny" id="btnAdd">+ Add</button>
    </div>
  </div>
  <div class="slides" id="slides"></div>
</aside>`,
    htmlCode: `<section class="panel" id="codePanel">
  <div class="tools">
    <button class="btn tiny" data-tag="b">b</button>
    <button class="btn tiny" data-tag="i">i</button>
    <button class="btn tiny" data-tag="u">u</button>
    <button class="btn tiny" data-tag="h1">h1</button>
    <button class="btn tiny" data-tag="p">p</button>
    <button class="btn tiny" data-tag="br" title="Insert &lt;br&gt; at cursor">Enter</button>
    <button class="btn tiny" id="btnFindReplace">Find</button>
    <button class="btn tiny" id="btnCodeFontDec">Zoom-</button>
    <div class="code-font-view" id="codeFontView">12px</div>
    <button class="btn tiny" id="btnCodeFontInc">Zoom+</button>
    <button class="btn tiny" id="btnCodeTheme">Code: Light</button>
    <button class="btn tiny" id="btnWrap">Wrap: Off</button>
    <button class="btn tiny" id="btnFormat">TidyFormat</button>
  </div>
  <div class="findbar hidden" id="find-replace-bar">
    <input id="find-input" class="find-input" type="text" placeholder="Find">
    <input id="replace-input" class="find-input" type="text" placeholder="Replace">
    <button class="btn tiny" id="btnFindPrev">Prev</button>
    <button class="btn tiny" id="btnFindNext">Next</button>
    <button class="btn tiny" id="btnReplaceOne">Replace</button>
    <button class="btn tiny" id="btnReplaceAll">All</button>
    <button class="btn tiny" id="btnFindClose">Close</button>
  </div>
  <div class="code-wrap" id="codeWrap">
    <div id="codeMarker"></div>
    <pre id="codeLines" aria-hidden="true">1</pre>
    <pre id="codeView" aria-hidden="true"></pre>
    <textarea id="code" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off"></textarea>
  </div>
  <div class="foot panel-foot">
    <div class="panel-foot-title">HTML Code</div>
    <div class="panel-foot-actions">
      <button class="btn" id="btnRevert">Revert</button>
      <button class="btn primary" id="btnSave">Save Apply</button>
    </div>
  </div>
</section>`,
    editor: `<section class="panel" id="editorPanel">
  <div class="tools">
    <button class="btn tiny" id="btnObjectEditMode" title="Object/Container Select Mode">Edit Mode: OFF</button>
    <button class="btn tiny" id="btnZoomOut" title="Zoom Out">-</button>
    <div class="zoom" id="zoomView">75%</div>
    <button class="btn tiny" id="btnZoomIn" title="Zoom In">+</button>
    <button class="btn tiny" id="btnFitPptxSlide" title="Fit imported PPTX slide to canvas">Fit</button>
    <button class="btn tiny" id="btnSyncToCode" data-action="sync-editor-to-code" title="Apply editor to code">Editor -> Code</button>
    <button class="btn tiny" data-cmd="bold"><b>B</b></button>
    <button class="btn tiny" data-cmd="italic"><i>I</i></button>
    <button class="btn tiny" data-cmd="underline"><u>U</u></button>
    <button class="btn tiny" data-cmd="justifyLeft">L</button>
    <button class="btn tiny" data-cmd="justifyCenter">C</button>
    <button class="btn tiny" data-cmd="justifyRight">R</button>
    <button class="btn tiny" data-cmd="insertUnorderedList">ul</button>
    <button class="btn tiny" data-cmd="insertOrderedList">ol</button>
    <button class="btn tiny" id="btnLink">link</button>
    <button class="btn tiny" id="btnImg">img</button>
    <button class="btn tiny" id="btnFontDec">A-</button>
    <select id="quickFontSize" class="find-input quick-select" title="Font Size">
      <option value="6">6px</option>
      <option value="8">8px</option>
      <option value="10">10px</option>
      <option value="12">12px</option>
      <option value="14">14px</option>
      <option value="16" selected>16px</option>
      <option value="18">18px</option>
      <option value="20">20px</option>
      <option value="24">24px</option>
      <option value="26">26px</option>
      <option value="28">28px</option>
      <option value="30">30px</option>
      <option value="32">32px</option>
      <option value="36">36px</option>
      <option value="40">40px</option>
      <option value="48">48px</option>
      <option value="60">60px</option>
      <option value="72">72px</option>
      <option value="100">100px</option>
    </select>
    <button class="btn tiny" id="btnFontInc">A+</button>
    <label class="quick-color-wrap" title="Text Color">T <input id="quickTextColor" type="color" value="#1a2233" class="quick-color"></label>
    <label class="quick-color-wrap" title="Highlight">H <input id="quickHiliteColor" type="color" value="#fff59d" class="quick-color"></label>
    <button class="btn tiny hidden" id="btnColorApplyPopup" title="Apply selected color">Apply</button>
    <button class="btn tiny" id="btnLayerPanelToggle" title="Toggle object layer panel">layer</button>
    <button class="btn tiny hidden" id="btnAbsCoordInfo" title="Show absolute coordinates">abs</button>
    <button class="btn tiny hidden" id="btnSetBaseLayer" title="Set selected container as base layer">base</button>
    <button class="btn tiny" id="btnTextBox">text</button>
    <select id="textPreset" class="find-input quick-select" title="Text Box Preset">
      <option value="basic" selected>txt-basic</option>
      <option value="note">txt-note</option>
      <option value="accent">txt-accent</option>
      <option value="dark">txt-dark</option>
    </select>
    <span id="textBoxSelectionTools" class="hidden"></span>
    <span id="objectLayerTools" class="hidden">
      <button class="btn tiny" id="btnObjectDel" title="Delete selected object">ObjectDel</button>
      <button class="btn tiny" id="btnLayerTop" title="Bring selected object to front">front</button>
      <button class="btn tiny" id="btnLayerBottom" title="Send selected object to back (above base)">back</button>
      <button class="btn tiny" id="btnLayerUp" title="Bring forward by one step">up1</button>
      <button class="btn tiny" id="btnLayerDown" title="Send backward by one step">down1</button>
    </span>
  </div>
  <div class="wys-wrap">
    <div class="editor-canvas-area">
      <div class="stage" id="stage">
        <iframe id="wys" sandbox="allow-same-origin allow-scripts"></iframe>
      </div>
    </div>
    <aside id="objLayerPanelHost" class="obj-layer-host"></aside>
  </div>
  <div class="editor-foot-info">
    <div class="panel-foot-title">Editor</div>
    <div id="slideSizeBottomInfo">Slide Size: 1280 x 720</div>
    <div class="editor-foot-actions">
      <button class="btn tiny" id="btnSaveChangesBottom" type="button">변경사항 저장</button>
      <button class="btn tiny" id="btnSlideSettingsBottom" type="button">슬라이드 세팅으로 복귀</button>
    </div>
  </div>
</section>`
  };

  const SCRIPT_ORDER = [
    "./js/state.js",
    "./js/Edit/edit_text.js",
    "./js/Edit/edit_obj.js",
    "./js/Edit/Obj_layer.js",
    "./js/ui.js",
    "./js/htmlcode.js",
    "./js/editor.js",
    "./js/save.js",
    "./js/export.js",
    "./js/Export/mppExport.js",
    "./js/Import/pptxImport.js",
    "./js/Export/imageExport.js",
    "./js/Export/pptModeObject.js",
    "./js/Export/pptModeImage.js",
    "./js/Export/pptModeImageText.js",
    "./js/Export/pptModeFull.js",
    "./js/Export/pptExport.js",
    "./js/main.js"
  ];
  const ASSET_VERSION = "20260628-pptx-import-fit-1";

  const loadedScripts = new Set();
  let booted = false;
  const IS_FILE_PROTOCOL = (() => {
    try { return String(window.location.protocol || "").toLowerCase() === "file:"; } catch (_) {}
    return false;
  })();
  const APP_BASE = (() => {
    try {
      const cs = document.currentScript;
      if (cs && cs.src) return String(new URL("../", cs.src).href);
    } catch (_) {}
    try { return String(new URL("./", window.location.href).href); } catch (_) {}
    return "./";
  })();

  function xhrReadText(url) {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "text";
        xhr.onload = () => {
          if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
            resolve(String(xhr.responseText || ""));
          } else {
            reject(new Error(`XHR failed: ${xhr.status} ${url}`));
          }
        };
        xhr.onerror = () => reject(new Error(`XHR network error: ${url}`));
        xhr.send();
      } catch (e) {
        reject(e);
      }
    });
  }

  function toAbsoluteUrl(path) {
    const p = String(path || "");
    if (!p) return "";
    try { return String(new URL(p, APP_BASE).href); } catch (_) {}
    try { return String(new URL(p, window.location.href).href); } catch (_) {}
    return p;
  }

  function withAssetVersion(url) {
    const raw = String(url || "");
    if (!raw) return raw;
    if (/^(?:data|blob):/i.test(raw)) return raw;
    const sep = raw.indexOf("?") >= 0 ? "&" : "?";
    return `${raw}${sep}v=${encodeURIComponent(ASSET_VERSION)}`;
  }

  function getCandidateUrls(path) {
    const out = [];
    const abs = toAbsoluteUrl(path);
    if (abs) out.push(abs);
    out.push(String(path || ""));
    const clean = String(path || "").replace(/^\.\//, "");
    if (clean) {
      const absClean = toAbsoluteUrl(clean);
      if (absClean) out.push(absClean);
      out.push(clean);
    }
    return Array.from(new Set(out.filter(Boolean)));
  }

  async function fetchHtml(path) {
    if (IS_FILE_PROTOCOL) {
      // file:// 에서는 fetch/xhr 자체가 CORS로 차단되는 환경이 많아
      // 인라인 fallback 경로를 우선 사용한다.
      throw new Error(`file:// protocol blocks fragment fetch: ${path}`);
    }
    let lastErr = null;
    const urls = getCandidateUrls(path);
    for (const url of urls) {
      try {
        const res = await fetch(withAssetVersion(url), { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
        const txt = await res.text();
        if (String(txt || "").trim()) return txt;
      } catch (e) {
        lastErr = e;
      }
      try {
        const txt = await xhrReadText(url);
        if (String(txt || "").trim()) return txt;
      } catch (e2) {
        lastErr = e2;
      }
    }
    throw lastErr || new Error(`Failed to load ${path}`);
  }

  function normalizeFragmentHtml(raw) {
    let src = String(raw || "");
    if (!src) return "";
    // Remove BOM and common mojibake prefixes from broken UTF-8 patching.
    src = src.replace(/^\uFEFF+/, "");
    src = src.replace(/^(?:ï»¿|癤\?)+/g, "");
    // Trim any garbage before the first HTML-like tag.
    const firstTag = src.search(/<[A-Za-z!/]/);
    if (firstTag > 0) src = src.slice(firstTag);
    src = src.trim();
    if (!src) return "";
    // If the fragment was wrapped into a full HTML document, extract body content only.
    if (/<html[\s>]/i.test(src) || /<body[\s>]/i.test(src)) {
      try {
        const doc = new DOMParser().parseFromString(src, "text/html");
        if (doc && doc.body) {
          let bodyHtml = String(doc.body.innerHTML || "").trim();
          bodyHtml = bodyHtml.replace(/^\uFEFF+/, "").replace(/^(?:ï»¿|癤\?)+/g, "").trim();
          if (bodyHtml) return bodyHtml;
        }
      } catch (_) {}
    }
    return src;
  }

  function replaceSlot(slotId, html) {
    const slot = document.getElementById(slotId);
    if (!slot) throw new Error(`Slot not found: ${slotId}`);
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html || "").trim();
    const nodes = Array.from(tpl.content.childNodes);
    if (!nodes.length) throw new Error(`Empty fragment for slot: ${slotId}`);
    slot.replaceWith(...nodes);
  }

  async function mountUi() {
    const root = document.getElementById("appRoot");
    if (!root) throw new Error("appRoot not found");

    const loadUi = async (key, path) => {
      try {
        return normalizeFragmentHtml(await fetchHtml(path));
      } catch (e) {
        const fallback = String((INLINE_UI && INLINE_UI[key]) || "").trim();
        if (fallback) {
          console.warn(`[GenSlide] fragment load failed (${path}), using inline fallback:`, e);
          return normalizeFragmentHtml(fallback);
        }
        throw e;
      }
    };

    root.innerHTML = await loadUi("main", UI_FILES.main);
    replaceSlot("slot-header", await loadUi("header", UI_FILES.header));
    replaceSlot("slot-left-sidebar", await loadUi("leftSidebar", UI_FILES.leftSidebar));
    replaceSlot("slot-htmlcode", await loadUi("htmlCode", UI_FILES.htmlCode));
    replaceSlot("slot-editor", await loadUi("editor", UI_FILES.editor));
  }

  async function loadScript(src) {
    if (loadedScripts.has(src)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = withAssetVersion(toAbsoluteUrl(src));
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Script load failed: ${src}`));
      document.body.appendChild(s);
    });
    loadedScripts.add(src);
  }

  async function loadAllScripts() {
    for (const src of SCRIPT_ORDER) {
      await loadScript(src);
    }
  }

  async function boot() {
    if (booted) return true;
    try {
      await mountUi();
      await loadAllScripts();
      if (typeof initApp !== "function") {
        throw new Error("initApp is not available");
      }
      await initApp();
      booted = true;
      return true;
    } catch (err) {
      console.error("[GenSlide] boot failed:", err);
      try {
        const root = document.getElementById("appRoot");
        if (root) {
          root.innerHTML =
            `<div style="padding:16px;border:1px solid #d7deef;border-radius:10px;background:#fff;color:#1a2233;font:13px/1.5 'Segoe UI',sans-serif;">` +
            `<div style="font-weight:700;margin-bottom:8px;">GenSlide boot failed</div>` +
            `<div style="white-space:pre-wrap;color:#4b5f87;">${String((err && err.message) || err || "Unknown error")}</div>` +
            `<div style="margin-top:8px;color:#6b7fa8;">Tip: Electron(file://) 환경에서는 UI fragment fetch가 실패할 수 있습니다. controller.js fallback(XHR)로 재시도합니다.</div>` +
            `</div>`;
        }
      } catch (_) {}
      return false;
    }
  }

  async function reboot() {
    booted = false;
    return boot();
  }

  function status() {
    return {
      booted,
      loadedScripts: Array.from(loadedScripts)
    };
  }

  window.GenSlideController = { boot, reboot, status };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { boot(); }, { once: true });
  } else {
    boot();
  }
})();

