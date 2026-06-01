(() => {
  const UI_FILES = {
    main: "./ui/main.html",
    header: "./ui/header.html",
    leftSidebar: "./ui/leftSidebar.html",
    htmlCode: "./ui/htmlcode.html",
    editor: "./ui/editor.html"
  };
  const EMBEDDED_UI = {
    "./ui/main.html": `<div class="app">
  <div id="slot-header"></div>
  <div id="slot-left-sidebar"></div>
  <main class="main">
    <div class="toolbar">
      <span class="info">WYSIWYG Mode</span>
      <div class="view-mode-group" aria-label="View Mode">
        <button class="btn tiny primary" id="btnViewTwin" title="Twin mode">Twin</button>
        <button class="btn tiny" id="btnViewCode" title="HTML Code only">htmlCode</button>
        <button class="btn tiny" id="btnViewEditor" title="Editor only">Editor</button>
      </div>
      <div class="spacer"></div>
      <button class="btn tiny" id="btnSlideShow">Slide Show</button>
      <button class="btn tiny" id="btnSlideSettings" title="Slide Settings">Settings</button>
      <button class="btn tiny" id="btnThemeMode" title="Theme Mode">Theme: Light</button>
    </div>
    <div class="work" id="workSplitRoot">
      <div id="slot-htmlcode"></div>
      <div class="panel-splitter" id="panelSplitter" title="Resize panels"></div>
      <div id="slot-editor"></div>
    </div>
  </main>
</div>`
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
    "./js/Export/imageExport.js",
    "./js/Export/pptModeObject.js",
    "./js/Export/pptModeImage.js",
    "./js/Export/pptModeImageText.js",
    "./js/Export/pptModeFull.js",
    "./js/Export/pptExport.js",
    "./js/main.js"
  ];

  const loadedScripts = new Set();
  let booted = false;
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
    const embedded = EMBEDDED_UI[String(path || "")];
    if (embedded && String(embedded).trim()) return embedded;
    let lastErr = null;
    const urls = getCandidateUrls(path);
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
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

    root.innerHTML = normalizeFragmentHtml(await fetchHtml(UI_FILES.main));
    replaceSlot("slot-header", normalizeFragmentHtml(await fetchHtml(UI_FILES.header)));
    replaceSlot("slot-left-sidebar", normalizeFragmentHtml(await fetchHtml(UI_FILES.leftSidebar)));
    replaceSlot("slot-htmlcode", normalizeFragmentHtml(await fetchHtml(UI_FILES.htmlCode)));
    replaceSlot("slot-editor", normalizeFragmentHtml(await fetchHtml(UI_FILES.editor)));
  }

  async function loadScript(src) {
    if (loadedScripts.has(src)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = toAbsoluteUrl(src);
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
