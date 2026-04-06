(() => {
  const UI_FILES = {
    main: "./ui/main.html",
    header: "./ui/header.html",
    leftSidebar: "./ui/leftSidebar.html",
    htmlCode: "./ui/htmlcode.html",
    editor: "./ui/editor.html"
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

  async function fetchHtml(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.text();
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

    root.innerHTML = await fetchHtml(UI_FILES.main);
    replaceSlot("slot-header", await fetchHtml(UI_FILES.header));
    replaceSlot("slot-left-sidebar", await fetchHtml(UI_FILES.leftSidebar));
    replaceSlot("slot-htmlcode", await fetchHtml(UI_FILES.htmlCode));
    replaceSlot("slot-editor", await fetchHtml(UI_FILES.editor));
  }

  async function loadScript(src) {
    if (loadedScripts.has(src)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
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
