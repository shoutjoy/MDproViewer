function bindImageResizeEditor(doc) {
  if (!doc || doc.__jenaImgResizeBound) return;
  doc.__jenaImgResizeBound = true;
  let enabled = !!objectEditMode;

  const ui = doc.createElement("div");
  ui.id = "jena-img-resize-ui";
  ui.setAttribute("data-jena-ui", "1");
  ui.style.cssText = "position:absolute;display:none;border:2px solid #2f66d2;z-index:2147483647;pointer-events:none;box-sizing:border-box;";
  doc.body.appendChild(ui);
  const applyBtn = doc.createElement("button");
  applyBtn.type = "button";
  applyBtn.textContent = "Apply";
  applyBtn.setAttribute("data-jena-ui", "1");
  applyBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #2f66d2;background:#2f66d2;color:#fff;border-radius:6px;padding:4px 10px;font:600 12px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(applyBtn);
  const frontBtn = doc.createElement("button");
  frontBtn.type = "button";
  frontBtn.textContent = "Front";
  frontBtn.setAttribute("data-jena-ui", "1");
  frontBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #1f7a3b;background:#1f7a3b;color:#fff;border-radius:6px;padding:4px 8px;font:700 11px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(frontBtn);
  const backBtn = doc.createElement("button");
  backBtn.type = "button";
  backBtn.textContent = "Back";
  backBtn.setAttribute("data-jena-ui", "1");
  backBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #7a3f1f;background:#7a3f1f;color:#fff;border-radius:6px;padding:4px 8px;font:700 11px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(backBtn);

  const unit = (v) => (typeof v === "number" ? `${v}px` : String(v));

  function mkHandle(cursor, right, bottom, width, height) {
    const h = doc.createElement("div");
    h.style.cssText = [
      "position:absolute",
      `right:${unit(right)}`,
      `bottom:${unit(bottom)}`,
      `width:${unit(width)}`,
      `height:${unit(height)}`,
      "background:#2f66d2",
      "border:1px solid #fff",
      "border-radius:2px",
      `cursor:${cursor}`,
      "pointer-events:auto"
    ].join(";");
    ui.appendChild(h);
    return h;
  }

  const hX = mkHandle("ew-resize", -6, "calc(50% - 4px)", 10, 10);
  const hY = mkHandle("ns-resize", "calc(50% - 4px)", -6, 10, 10);
  const hXY = mkHandle("nwse-resize", -7, -7, 12, 12);

  let activeImg = null;
  let mode = "";
  let sx = 0;
  let sy = 0;
  let sw = 0;
  let sh = 0;
  let sl = 0;
  let st = 0;
  let hasPendingResize = false;
  let moveNeedsAbs = false;

  function syncApplyButton() {
    if (!activeImg) {
      applyBtn.style.display = "none";
      frontBtn.style.display = "none";
      backBtn.style.display = "none";
      return;
    }
    const r = activeImg.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    const left = Math.round(r.left + dx);
    const top = Math.round(r.bottom + dy + 8);
    if (hasPendingResize) {
      applyBtn.style.left = `${left}px`;
      applyBtn.style.top = `${top}px`;
      applyBtn.style.display = "inline-block";
    } else {
      applyBtn.style.display = "none";
    }
    frontBtn.style.left = `${left + (hasPendingResize ? 64 : 0)}px`;
    frontBtn.style.top = `${top}px`;
    backBtn.style.left = `${left + (hasPendingResize ? 124 : 60)}px`;
    backBtn.style.top = `${top}px`;
    frontBtn.style.display = enabled ? "inline-block" : "none";
    backBtn.style.display = enabled ? "inline-block" : "none";
  }

  function syncBox() {
    if (!activeImg) return;
    const r = activeImg.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    ui.style.left = `${r.left + dx}px`;
    ui.style.top = `${r.top + dy}px`;
    ui.style.width = `${r.width}px`;
    ui.style.height = `${r.height}px`;
    syncApplyButton();
  }

  function showFor(img) {
    activeImg = img;
    setWysLayerSelection(doc, img);
    const w = Math.max(1, img.offsetWidth || img.width || 1);
    const h = Math.max(1, img.offsetHeight || img.height || 1);
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.maxWidth = "none";
    img.style.cursor = "move";
    ui.style.display = "block";
    hasPendingResize = false;
    applyBtn.style.display = "none";
    syncBox();
  }

  function hide() {
    setWysLayerSelection(doc, null);
    activeImg = null;
    mode = "";
    hasPendingResize = false;
    ui.style.display = "none";
    applyBtn.style.display = "none";
    frontBtn.style.display = "none";
    backBtn.style.display = "none";
  }

  function startResize(e, nextMode) {
    if (!enabled) return;
    if (!activeImg) return;
    e.preventDefault();
    e.stopPropagation();
    mode = nextMode;
    sx = e.clientX;
    sy = e.clientY;
    sw = activeImg.offsetWidth || 1;
    sh = activeImg.offsetHeight || 1;
  }

  function startMove(e) {
    if (!enabled) return;
    if (!activeImg) return;
    e.preventDefault();
    e.stopPropagation();
    mode = "move";
    sx = e.clientX;
    sy = e.clientY;
    const cs = doc.defaultView.getComputedStyle(activeImg);
    if (cs && cs.position !== "absolute") {
      const r = activeImg.getBoundingClientRect();
      const parent = activeImg.parentElement;
      const pr = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
      sl = Math.round(r.left - pr.left + (parent ? (parent.scrollLeft || 0) : 0));
      st = Math.round(r.top - pr.top + (parent ? (parent.scrollTop || 0) : 0));
      sw = Math.max(16, Math.round(r.width));
      sh = Math.max(16, Math.round(r.height));
      moveNeedsAbs = true;
    } else {
      sl = parseFloat(activeImg.style.left) || 0;
      st = parseFloat(activeImg.style.top) || 0;
      moveNeedsAbs = false;
    }
  }

  function promoteImageToAbsoluteAtCurrentPosition(img) {
    if (!img || !img.parentElement) return;
    const parent = img.parentElement;
    const pcs = doc.defaultView.getComputedStyle(parent);
    if (pcs && pcs.position === "static") {
      parent.style.position = "relative";
    }
    const r = img.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const left = Math.round(r.left - pr.left + (parent.scrollLeft || 0));
    const top = Math.round(r.top - pr.top + (parent.scrollTop || 0));
    img.style.position = "absolute";
    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
    img.style.width = `${Math.max(16, Math.round(r.width))}px`;
    img.style.height = `${Math.max(16, Math.round(r.height))}px`;
    img.style.float = "none";
    img.style.margin = "0";
  }

  function onMove(e) {
    if (!enabled) return;
    if (!activeImg || !mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (mode === "move") {
      if (moveNeedsAbs) {
        promoteImageToAbsoluteAtCurrentPosition(activeImg);
        sl = parseFloat(activeImg.style.left) || 0;
        st = parseFloat(activeImg.style.top) || 0;
        sw = activeImg.offsetWidth || Math.max(16, parseFloat(activeImg.style.width) || sw || 16);
        sh = activeImg.offsetHeight || Math.max(16, parseFloat(activeImg.style.height) || sh || 16);
        moveNeedsAbs = false;
        sx = e.clientX;
        sy = e.clientY;
        syncBox();
        return;
      }
      activeImg.style.left = `${Math.round(sl + dx)}px`;
      activeImg.style.top = `${Math.round(st + dy)}px`;
      hasPendingResize = true;
      syncBox();
      return;
    }
    const w = Math.max(16, sw + ((mode === "x" || mode === "xy") ? dx : 0));
    const h = Math.max(16, sh + ((mode === "y" || mode === "xy") ? dy : 0));
    if (mode === "x") {
      activeImg.style.width = `${w}px`;
    } else if (mode === "y") {
      activeImg.style.height = `${h}px`;
    } else {
      activeImg.style.width = `${w}px`;
      activeImg.style.height = `${h}px`;
    }
    hasPendingResize = true;
    syncBox();
  }

  function onUp() {
    if (!enabled) return;
    if (!mode) return;
    mode = "";
    moveNeedsAbs = false;
    if (activeImg && activeImg.parentElement) {
      const parent = activeImg.parentElement;
      const r = activeImg.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      const pcs = doc.defaultView.getComputedStyle(parent);
      const bt = parseFloat(String((pcs && pcs.borderTopWidth) || "0")) || 0;
      const bl = parseFloat(String((pcs && pcs.borderLeftWidth) || "0")) || 0;
      const left = r.left - pr.left - bl + (parent.scrollLeft || 0);
      const top = r.top - pr.top - bt + (parent.scrollTop || 0);
      activeImg.setAttribute("data-jena-geom-left", String(Math.round(left)));
      activeImg.setAttribute("data-jena-geom-top", String(Math.round(top)));
      activeImg.setAttribute("data-jena-geom-width", String(Math.max(16, Math.round(r.width))));
      activeImg.setAttribute("data-jena-geom-height", String(Math.max(16, Math.round(r.height))));
    }
    syncApplyButton();
  }

  hX.addEventListener("mousedown", (e) => startResize(e, "x"));
  hY.addEventListener("mousedown", (e) => startResize(e, "y"));
  hXY.addEventListener("mousedown", (e) => startResize(e, "xy"));
  applyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeImg || !hasPendingResize) return;
    const html = getWysHtml();
    applyWysObjectChange(html, true);
    hasPendingResize = false;
    syncApplyButton();
  });
  frontBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeImg) return;
    if (typeof bringLayerToFront === "function") {
      bringLayerToFront(doc, activeImg, true);
      syncBox();
    }
  });
  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeImg) return;
    if (typeof sendLayerToBack === "function") {
      sendLayerToBack(doc, activeImg, true);
      syncBox();
    }
  });
  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("mouseup", onUp, true);
  doc.addEventListener("mousedown", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (!t || !t.tagName) return;
    if (String(t.tagName).toLowerCase() !== "img") return;
    showFor(t);
    if (e.button !== 0) return;
    startMove(e);
  }, true);
  doc.addEventListener("scroll", () => { if (activeImg) syncBox(); }, true);
  doc.defaultView.addEventListener("resize", () => { if (activeImg) syncBox(); });

  doc.addEventListener("click", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (t && t.tagName && String(t.tagName).toLowerCase() === "img") {
      showFor(t);
      return;
    }
    if (t === applyBtn || applyBtn.contains(t) || t === frontBtn || frontBtn.contains(t) || t === backBtn || backBtn.contains(t)) return;
    if (!ui.contains(t)) hide();
  }, true);

  doc.__jenaImageEditor = {
    setEnabled(next) {
      enabled = !!next;
      if (!enabled) hide();
    },
    select(el) {
      if (!enabled || !el || !el.tagName) return false;
      if (String(el.tagName).toLowerCase() !== "img") return false;
      showFor(el);
      return true;
    }
  };
}

function bindContainerObjectEditor(doc) {
  if (!doc || doc.__jenaContainerEditBound) return;
  doc.__jenaContainerEditBound = true;
  let enabled = !!objectEditMode;

  const ui = doc.createElement("div");
  ui.id = "jena-obj-resize-ui";
  ui.setAttribute("data-jena-ui", "1");
  ui.style.cssText = "position:absolute;display:none;border:2px dashed #18a0fb;z-index:2147483646;pointer-events:none;box-sizing:border-box;";
  doc.body.appendChild(ui);

  const unit = (v) => (typeof v === "number" ? `${v}px` : String(v));
  function mkHandle(cursor, right, bottom, size) {
    const h = doc.createElement("div");
    h.style.cssText = [
      "position:absolute",
      `right:${unit(right)}`,
      `bottom:${unit(bottom)}`,
      `width:${unit(size)}`,
      `height:${unit(size)}`,
      "border:1px solid #fff",
      "background:#18a0fb",
      "border-radius:2px",
      `cursor:${cursor}`,
      "pointer-events:auto"
    ].join(";");
    ui.appendChild(h);
    return h;
  }

  const hMove = doc.createElement("div");
  hMove.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:50%",
    "transform:translate(-50%,-50%)",
    "min-width:56px",
    "height:18px",
    "padding:0 8px",
    "border-radius:10px",
    "background:#18a0fb",
    "color:#fff",
    "font:700 10px/18px 'Segoe UI',sans-serif",
    "text-align:center",
    "cursor:move",
    "pointer-events:auto",
    "user-select:none",
    "box-shadow:0 2px 8px rgba(0,0,0,.18)"
  ].join(";");
  hMove.textContent = "MOVE";
  ui.appendChild(hMove);

  const hX = mkHandle("ew-resize", -6, "calc(50% - 4px)", 10);
  const hY = mkHandle("ns-resize", "calc(50% - 4px)", -6, 10);
  const hXY = mkHandle("nwse-resize", -7, -7, 12);

  const applyBtn = doc.createElement("button");
  applyBtn.type = "button";
  applyBtn.textContent = "Apply";
  applyBtn.setAttribute("data-jena-ui", "1");
  applyBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #18a0fb;background:#18a0fb;color:#fff;border-radius:6px;padding:4px 10px;font:600 12px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(applyBtn);
  const frontBtn = doc.createElement("button");
  frontBtn.type = "button";
  frontBtn.textContent = "Front";
  frontBtn.setAttribute("data-jena-ui", "1");
  frontBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #1f7a3b;background:#1f7a3b;color:#fff;border-radius:6px;padding:4px 8px;font:700 11px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(frontBtn);
  const backBtn = doc.createElement("button");
  backBtn.type = "button";
  backBtn.textContent = "Back";
  backBtn.setAttribute("data-jena-ui", "1");
  backBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #7a3f1f;background:#7a3f1f;color:#fff;border-radius:6px;padding:4px 8px;font:700 11px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(backBtn);

  let activeEl = null;
  let mode = "";
  let sx = 0;
  let sy = 0;
  let sw = 0;
  let sh = 0;
  let sl = 0;
  let st = 0;
  let moveNeedsAbs = false;
  let hasPending = false;
  let textEditMode = false;
  let movePlaceholder = null;
  let dragPrevZ = "";
  let dragPrevZCaptured = false;

  function snapshotElementGeometry(el) {
    if (!el || !el.parentElement || !el.getBoundingClientRect) return;
    const parent = el.parentElement;
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const pcs = doc.defaultView.getComputedStyle(parent);
    const bt = parseFloat(String((pcs && pcs.borderTopWidth) || "0")) || 0;
    const bl = parseFloat(String((pcs && pcs.borderLeftWidth) || "0")) || 0;
    const left = r.left - pr.left - bl + (parent.scrollLeft || 0);
    const top = r.top - pr.top - bt + (parent.scrollTop || 0);
    try {
      el.setAttribute("data-jena-geom-left", String(Math.round(left)));
      el.setAttribute("data-jena-geom-top", String(Math.round(top)));
      el.setAttribute("data-jena-geom-width", String(Math.max(16, Math.round(r.width))));
      el.setAttribute("data-jena-geom-height", String(Math.max(16, Math.round(r.height))));
    } catch (_) {}
  }

  function snapshotCurrentLayout() {
    if (!doc || !doc.body) return;
    const all = Array.from(doc.body.querySelectorAll("*"));
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (isBlockedTarget(el)) continue;
      if (!isContainerLike(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) continue;
      snapshotElementGeometry(el);
    }
  }

  function syncApplyButton() {
    if (!activeEl) {
      applyBtn.style.display = "none";
      frontBtn.style.display = "none";
      backBtn.style.display = "none";
      return;
    }
    const r = activeEl.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    const left = Math.round(r.left + dx);
    const top = Math.round(r.bottom + dy + 8);
    if (hasPending) {
      applyBtn.style.left = `${left}px`;
      applyBtn.style.top = `${top}px`;
      applyBtn.style.display = "inline-block";
    } else {
      applyBtn.style.display = "none";
    }
    frontBtn.style.left = `${left + (hasPending ? 64 : 0)}px`;
    frontBtn.style.top = `${top}px`;
    backBtn.style.left = `${left + (hasPending ? 124 : 60)}px`;
    backBtn.style.top = `${top}px`;
    frontBtn.style.display = enabled ? "inline-block" : "none";
    backBtn.style.display = enabled ? "inline-block" : "none";
  }

  function syncBox() {
    if (!activeEl) return;
    const r = activeEl.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    ui.style.left = `${r.left + dx}px`;
    ui.style.top = `${r.top + dy}px`;
    ui.style.width = `${r.width}px`;
    ui.style.height = `${r.height}px`;
    syncApplyButton();
  }

  function clearMovePlaceholder() {
    if (movePlaceholder) {
      try {
        if (movePlaceholder.parentNode) movePlaceholder.parentNode.removeChild(movePlaceholder);
      } catch (_) {}
      movePlaceholder = null;
    }
    try {
      const ps = Array.from(doc.querySelectorAll(".jena-move-placeholder,[data-jena-placeholder-for]"));
      for (let i = 0; i < ps.length; i++) {
        if (ps[i] && ps[i].parentNode) ps[i].parentNode.removeChild(ps[i]);
      }
    } catch (_) {}
  }

  function ensureMoveId(el) {
    if (!el || !el.getAttribute || !el.setAttribute) return "";
    let id = String(el.getAttribute("data-jena-move-id") || "").trim();
    if (id) return id;
    id = `mv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    el.setAttribute("data-jena-move-id", id);
    return id;
  }

  function ensureMovePlaceholder(el) {
    if (!el || !el.parentElement) return;
    if (movePlaceholder && movePlaceholder.__forEl === el) return;
    clearMovePlaceholder();
    const moveId = ensureMoveId(el);
    const rect = el.getBoundingClientRect();
    const cs = doc.defaultView.getComputedStyle(el);
    const ph = doc.createElement(el.tagName || "div");
    ph.className = "jena-move-placeholder";
    ph.setAttribute("data-jena-ui", "1");
    if (moveId) ph.setAttribute("data-jena-placeholder-for", moveId);
    ph.style.boxSizing = "border-box";
    ph.style.display = cs.display === "inline" ? "inline-block" : cs.display;
    ph.style.width = `${Math.max(16, Math.round(rect.width))}px`;
    ph.style.height = `${Math.max(16, Math.round(rect.height))}px`;
    ph.style.marginTop = cs.marginTop;
    ph.style.marginRight = cs.marginRight;
    ph.style.marginBottom = cs.marginBottom;
    ph.style.marginLeft = cs.marginLeft;
    ph.style.padding = "0";
    ph.style.border = "0";
    ph.style.visibility = "hidden";
    ph.style.pointerEvents = "none";
    ph.style.flex = cs.flex;
    ph.style.flexGrow = cs.flexGrow;
    ph.style.flexShrink = cs.flexShrink;
    ph.style.flexBasis = cs.flexBasis;
    ph.style.alignSelf = cs.alignSelf;
    ph.style.overflow = "hidden";
    el.parentElement.insertBefore(ph, el);
    ph.__forEl = el;
    movePlaceholder = ph;
  }

  function toAbsolute(el) {
    if (!el) return;
    const cs = doc.defaultView.getComputedStyle(el);
    if (cs && cs.position === "absolute") return;
    const r = el.getBoundingClientRect();
    const vx = doc.defaultView.pageXOffset || 0;
    const vy = doc.defaultView.pageYOffset || 0;
    el.style.position = "absolute";
    el.style.left = `${Math.round(r.left + vx)}px`;
    el.style.top = `${Math.round(r.top + vy)}px`;
    el.style.width = `${Math.max(16, Math.round(r.width))}px`;
    el.style.height = `${Math.max(16, Math.round(r.height))}px`;
    el.style.margin = "0";
  }

  function isBlockedTarget(el) {
    if (!el || !el.tagName) return true;
    const tag = String(el.tagName).toLowerCase();
    if (tag === "html" || tag === "body" || tag === "script" || tag === "style" || tag === "img") return true;
    if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return true;
    if (el.closest && el.closest("#jena-img-resize-ui, #jena-obj-resize-ui, .jena-textbox")) return true;
    return false;
  }
// Object fixed : move status 
  function isContainerLike(el) {
    if (!el || !el.tagName) return false;
    const tag = String(el.tagName).toLowerCase();
    if (["div", "section", "article", "aside", "header", "footer", "main", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote"].includes(tag)) return true;
    const cs = doc.defaultView.getComputedStyle(el);
    const disp = String((cs && cs.display) || "");
    return disp.includes("block") || disp.includes("flex") || disp.includes("grid") || disp.includes("table");
  }

  function hasDynamicCanvas(el) {
    if (!el || !el.querySelector) return false;
    return !!el.querySelector("canvas");
  }

  function refreshDynamicCanvas(el) {
    if (!el || !el.querySelectorAll) return;
    const canvases = Array.from(el.querySelectorAll("canvas"));
    if (!canvases.length) return;
    const win = doc.defaultView;
    const Chart = win && win.Chart;
    for (let i = 0; i < canvases.length; i++) {
      const cv = canvases[i];
      try {
        const r = cv.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) {
          cv.style.width = `${Math.round(r.width)}px`;
          cv.style.height = `${Math.round(r.height)}px`;
        }
      } catch (_) {}
      try {
        if (Chart && typeof Chart.getChart === "function") {
          const inst = Chart.getChart(cv);
          if (inst) {
            if (typeof inst.resize === "function") inst.resize();
            if (typeof inst.update === "function") inst.update("none");
          }
        }
      } catch (_) {}
    }
  }

  function findSelectable(target) {
    const body = doc && doc.body ? doc.body : null;
    if (!target || !body || target === body) return null;

    // 1) Canvas / chart wrapper priority
    if (target.nodeName === "CANVAS") {
      const chartWrap = target.closest ? target.closest(".chart-wrapper") : null;
      if (chartWrap && !isBlockedTarget(chartWrap)) return chartWrap;
      const p = target.parentElement;
      if (p && !isBlockedTarget(p) && isContainerLike(p)) return p;
    }

    // 2) jena textbox priority
    const jenaTextbox = target.closest ? target.closest(".jena-textbox") : null;
    if (jenaTextbox) return jenaTextbox;

    // 3) Walk up to find visible container-like element
    let cur = target;
    while (cur && cur !== body) {
      if (!isBlockedTarget(cur) && isContainerLike(cur)) {
        const { width, height } = cur.getBoundingClientRect();
        if (width >= 20 && height >= 20) return cur;
      }
      cur = cur.parentElement;
    }

    return null;
  }

  function focusFirstTextNode(el) {
    if (!el || !doc.getSelection) return;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let n = walker.nextNode();
    while (n) {
      const txt = String(n.nodeValue || "");
      if (txt.trim().length > 0) {
        try {
          const sel = doc.getSelection();
          if (!sel) return;
          const r = doc.createRange();
          const pos = Math.min(1, txt.length);
          r.setStart(n, pos);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          return;
        } catch (_) {
          return;
        }
      }
      n = walker.nextNode();
    }
  }
// Resolving issues with steering wheel movement 
  function showFor(el) {
    if (activeEl && activeEl !== el && activeEl.dataset && activeEl.dataset.jenaTempEditable === "1") {
      activeEl.removeAttribute("contenteditable");
      delete activeEl.dataset.jenaTempEditable;
    }
    if (activeEl && activeEl !== el) {
      clearMovePlaceholder();
    }
    activeEl = el;
    setWysLayerSelection(doc, el);
    ui.style.display = "block";
    hasPending = false;
    textEditMode = false;
    refreshDynamicCanvas(el);
    syncBox();
  }

  function hide() {
    if (activeEl && activeEl.dataset && activeEl.dataset.jenaTempEditable === "1") {
      activeEl.removeAttribute("contenteditable");
      delete activeEl.dataset.jenaTempEditable;
    }
    activeEl = null;
    mode = "";
    hasPending = false;
    textEditMode = false;
    clearMovePlaceholder();
    ui.style.display = "none";
    applyBtn.style.display = "none";
    frontBtn.style.display = "none";
    backBtn.style.display = "none";
    setWysLayerSelection(doc, null);
  }

  function startResize(e, nextMode) {
    if (!enabled) return;
    if (!activeEl) return;
    e.preventDefault();
    e.stopPropagation();
    toAbsolute(activeEl);
    mode = nextMode;
    sx = e.clientX;
    sy = e.clientY;
    sw = activeEl.offsetWidth || 1;
    sh = activeEl.offsetHeight || 1;
    sl = parseFloat(activeEl.style.left) || 0;
    st = parseFloat(activeEl.style.top) || 0;
  }

  function startResizeLazy(e, nextMode) {
    if (!enabled) return;
    if (!activeEl) return;
    e.preventDefault();
    e.stopPropagation();
    mode = nextMode;
    sx = e.clientX;
    sy = e.clientY;
    const cs = doc.defaultView.getComputedStyle(activeEl);
    if (cs && cs.position !== "absolute") {
      const r = activeEl.getBoundingClientRect();
      const vx = doc.defaultView.pageXOffset || 0;
      const vy = doc.defaultView.pageYOffset || 0;
      sl = Math.round(r.left + vx);
      st = Math.round(r.top + vy);
      sw = Math.max(16, Math.round(r.width));
      sh = Math.max(16, Math.round(r.height));
      moveNeedsAbs = true;
    } else {
      sw = activeEl.offsetWidth || Math.max(16, parseFloat(activeEl.style.width) || 1);
      sh = activeEl.offsetHeight || Math.max(16, parseFloat(activeEl.style.height) || 1);
      sl = parseFloat(activeEl.style.left) || 0;
      st = parseFloat(activeEl.style.top) || 0;
      moveNeedsAbs = false;
    }
  }

  function startMove(e) {
    if (!enabled) return;
    if (!activeEl) return;
    e.preventDefault();
    e.stopPropagation();
    toAbsolute(activeEl);
    mode = "move";
    sx = e.clientX;
    sy = e.clientY;
    sl = parseFloat(activeEl.style.left) || 0;
    st = parseFloat(activeEl.style.top) || 0;
    moveNeedsAbs = false;
  }

  function startMoveLazy(e) {
    if (!enabled) return;
    if (!activeEl) return;
    e.preventDefault();
    e.stopPropagation();
    mode = "move";
    sx = e.clientX;
    sy = e.clientY;
    const cs = doc.defaultView.getComputedStyle(activeEl);
    if (cs && cs.position !== "absolute") {
      const r = activeEl.getBoundingClientRect();
      const vx = doc.defaultView.pageXOffset || 0;
      const vy = doc.defaultView.pageYOffset || 0;
      sl = Math.round(r.left + vx);
      st = Math.round(r.top + vy);
      sw = Math.max(16, Math.round(r.width));
      sh = Math.max(16, Math.round(r.height));
      moveNeedsAbs = true;
    } else {
      sl = parseFloat(activeEl.style.left) || 0;
      st = parseFloat(activeEl.style.top) || 0;
      moveNeedsAbs = false;
    }
  }
// Code check for layer movement 
  function promoteToAbsoluteAtCurrentPosition(el) {
    if (!el || !el.parentElement) return;
    if (String(el.style.position || "") === "absolute") return;
    const parent = el.parentElement;
    if (!parent) return;
    const view = doc.defaultView || window;
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const cs = view.getComputedStyle(el);
    const pcs = view.getComputedStyle(parent);
    const bt = parseFloat(String((pcs && pcs.borderTopWidth) || "0")) || 0;
    const bl = parseFloat(String((pcs && pcs.borderLeftWidth) || "0")) || 0;

    if (pcs && pcs.position === "static") {
      parent.style.position = "relative";
    }
    let left = r.left - pr.left - bl + (parent.scrollLeft || 0);
    let top = r.top - pr.top - bt + (parent.scrollTop || 0);
    let width = Math.max(16, Math.round(r.width));
    let height = Math.max(16, Math.round(r.height));

    const snapLeft = parseFloat(String(el.getAttribute("data-jena-geom-left") || ""));
    const snapTop = parseFloat(String(el.getAttribute("data-jena-geom-top") || ""));
    const snapWidth = parseFloat(String(el.getAttribute("data-jena-geom-width") || ""));
    const snapHeight = parseFloat(String(el.getAttribute("data-jena-geom-height") || ""));
    if (Number.isFinite(snapLeft)) left = snapLeft;
    if (Number.isFinite(snapTop)) top = snapTop;
    if (Number.isFinite(snapWidth)) width = Math.max(16, Math.round(snapWidth));
    if (Number.isFinite(snapHeight)) height = Math.max(16, Math.round(snapHeight));

    if (!dragPrevZCaptured) {
      dragPrevZ = String(el.style.zIndex || "");
      dragPrevZCaptured = true;
    }
    const zNow = parseInt(String((cs && cs.zIndex) || el.style.zIndex || ""), 10);
    const dragZ = Number.isFinite(zNow) ? Math.max(1000, zNow) : 1000;

    el.style.position = "absolute";
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.margin = "0";
    el.style.float = "none";
    el.style.zIndex = String(dragZ);
  }

  function onMove(e) {
    if (!enabled) return;
    if (!activeEl || !mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    let justPromoted = false;
    if ((mode === "x" || mode === "y" || mode === "xy") && moveNeedsAbs) {
      ensureMovePlaceholder(activeEl);
      promoteToAbsoluteAtCurrentPosition(activeEl);
      sl = parseFloat(activeEl.style.left) || 0;
      st = parseFloat(activeEl.style.top) || 0;
      sw = activeEl.offsetWidth || Math.max(16, parseFloat(activeEl.style.width) || sw || 16);
      sh = activeEl.offsetHeight || Math.max(16, parseFloat(activeEl.style.height) || sh || 16);
      moveNeedsAbs = false;
      justPromoted = true;
    }
    if (mode === "move") {
      if (moveNeedsAbs) {
        ensureMovePlaceholder(activeEl);
        promoteToAbsoluteAtCurrentPosition(activeEl);
        sl = parseFloat(activeEl.style.left) || 0;
        st = parseFloat(activeEl.style.top) || 0;
        sw = activeEl.offsetWidth || Math.max(16, parseFloat(activeEl.style.width) || sw || 16);
        sh = activeEl.offsetHeight || Math.max(16, parseFloat(activeEl.style.height) || sh || 16);
        moveNeedsAbs = false;
        justPromoted = true;
      }
      if (justPromoted) {
        // First frame only: lock current position and start moving from next event.
        sx = e.clientX;
        sy = e.clientY;
        syncBox();
        return;
      }
      activeEl.style.left = `${Math.round(sl + dx)}px`;
      activeEl.style.top = `${Math.round(st + dy)}px`;
    } else if (mode === "x") {
      activeEl.style.width = `${Math.max(20, sw + dx)}px`;
    } else if (mode === "y") {
      activeEl.style.height = `${Math.max(20, sh + dy)}px`;
    } else {
      activeEl.style.width = `${Math.max(20, sw + dx)}px`;
      activeEl.style.height = `${Math.max(20, sh + dy)}px`;
    }
    hasPending = true;
    refreshDynamicCanvas(activeEl);
    syncBox();
  }

  function onUp() {
    if (!enabled) return;
    if (!mode) return;
    mode = "";
    if (activeEl) {
      snapshotElementGeometry(activeEl);
      if (dragPrevZCaptured) activeEl.style.zIndex = dragPrevZ;
      dragPrevZ = "";
      dragPrevZCaptured = false;
    }
    clearMovePlaceholder();
    if (activeEl) refreshDynamicCanvas(activeEl);
    syncApplyButton();
  }

  // Use lazy move to avoid layout break on mere click of MOVE handle.
  // Critical Point 
  hMove.addEventListener("mousedown", startMoveLazy, true);
  hX.addEventListener("mousedown", (e) => startResizeLazy(e, "x"), true);
  hY.addEventListener("mousedown", (e) => startResizeLazy(e, "y"), true);
  hXY.addEventListener("mousedown", (e) => startResizeLazy(e, "xy"), true);

  applyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeEl || !hasPending) return;
    const html = getWysHtml();
    applyWysObjectChange(html, true);
    clearMovePlaceholder();
    dragPrevZ = "";
    dragPrevZCaptured = false;
    hasPending = false;
    syncApplyButton();
  });
  frontBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeEl) return;
    if (typeof bringLayerToFront === "function") {
      bringLayerToFront(doc, activeEl, true);
      syncBox();
    }
  });
  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeEl) return;
    if (typeof sendLayerToBack === "function") {
      sendLayerToBack(doc, activeEl, true);
      syncBox();
    }
  });

  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("mouseup", onUp, true);
  doc.addEventListener("scroll", () => { if (activeEl) syncBox(); }, true);
  doc.defaultView.addEventListener("resize", () => { if (activeEl) syncBox(); });

  doc.addEventListener("mousedown", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (!t) return;
    if (t.tagName && String(t.tagName).toLowerCase() === "img") return; // image editor handles img
    if (t === applyBtn || applyBtn.contains(t) || t === frontBtn || frontBtn.contains(t) || t === backBtn || backBtn.contains(t) || ui.contains(t)) return;
    const box = findSelectable(t);
    if (box) {
      showFor(box);
      // In text edit mode, allow native caret/text input behavior.
      if (textEditMode && activeEl === box) return;
      // single click: select object only (do not start move automatically)
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    hide();
  }, true);

  // double click: enter text edit mode inside selected container
  doc.addEventListener("dblclick", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (!t) return;
    if (t.tagName && String(t.tagName).toLowerCase() === "img") return;
    const box = findSelectable(t);
    if (!box) return;
    if (hasDynamicCanvas(box)) return;
    showFor(box);
    textEditMode = true;
    if (box.setAttribute) {
      box.setAttribute("contenteditable", "true");
      if (box.dataset) box.dataset.jenaTempEditable = "1";
    }
    focusFirstTextNode(box);
  }, true);

  doc.__jenaContainerEditor = {
    setEnabled(next) {
      enabled = !!next;
      if (!enabled) {
        hide();
        return;
      }
      snapshotCurrentLayout();
      try { lockAllObjectsAbsoluteOnObjectMode(doc); } catch (_) {}
    },
    select(target) {
      if (!enabled || !target) return false;
      let box = null;
      if (target.classList && target.classList.contains("jena-textbox")) {
        box = target;
      } else {
        box = findSelectable(target);
      }
      if (!box && target.parentElement) box = findSelectable(target.parentElement);
      if (!box) return false;
      showFor(box);
      return true;
    }
  };
}

function bindTextBoxEditor(doc) {
  if (!doc || doc.__jenaTextBoxBound) return;
  doc.__jenaTextBoxBound = true;

  let dragBox = null;
  let dragBeforeHtml = "";
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;

  function getTextBoxContentText(box) {
    const content = box && box.querySelector ? box.querySelector(".jena-textbox-content") : null;
    if (!content) return "";
    const t = String(content.textContent || "").replace(/\u200B/g, "").trim();
    return t;
  }

  function applyTextBoxVisualState(box) {
    if (!box) return;
    const d = box.ownerDocument;
    const selected = !!(d && d.__jenaLayerSelected === box);
    const handle = box.querySelector(".jena-textbox-handle");
    const filled = getTextBoxContentText(box).length > 0;
    const borderColor = box.dataset.tbBorder || "#8ea0c8";
    const handleBg = box.dataset.tbHandleBg || "#e9eefc";
    const handleBorder = box.dataset.tbHandleBorder || "#9fb1da";
    const handleColor = box.dataset.tbHandleColor || "#50638d";

    if (selected) {
      // Keep selected textbox visibly editable even when it already has content.
      box.style.borderColor = "#4f46e5";
      if (handle) {
        handle.style.color = handleColor;
        handle.style.background = handleBg;
        handle.style.borderBottomColor = handleBorder;
      }
    } else if (filled) {
      box.style.borderColor = "transparent";
      if (handle) {
        handle.style.color = "transparent";
        handle.style.background = "transparent";
        handle.style.borderBottomColor = "transparent";
      }
    } else {
      box.style.borderColor = borderColor;
      if (handle) {
        handle.style.color = handleColor;
        handle.style.background = handleBg;
        handle.style.borderBottomColor = handleBorder;
      }
    }
  }

  doc.addEventListener("mousedown", (e) => {
    const handle = e.target && e.target.closest ? e.target.closest(".jena-textbox-handle") : null;
    if (!handle) return;
    const box = handle.parentElement;
    if (!box) return;
    setWysLayerSelection(doc, box);
    e.preventDefault();
    e.stopPropagation();
    dragBox = box;
    dragBeforeHtml = String(els.code.value || "");
    sx = e.clientX;
    sy = e.clientY;
    sl = parseFloat(dragBox.style.left) || 0;
    st = parseFloat(dragBox.style.top) || 0;
  }, true);

  // Ensure text input always works when clicking the textbox area.
  doc.addEventListener("mousedown", (e) => {
    const box = e.target && e.target.closest ? e.target.closest(".jena-textbox") : null;
    if (!box) return;
    setWysLayerSelection(doc, box);
    const handle = e.target && e.target.closest ? e.target.closest(".jena-textbox-handle") : null;
    if (handle) return;
    const content = box.querySelector(".jena-textbox-content");
    if (!content) return;
    setTimeout(() => {
      try { content.focus(); } catch (_) {}
    }, 0);
  }, true);

  doc.addEventListener("mousemove", (e) => {
    if (!dragBox) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    dragBox.style.left = `${Math.round(sl + dx)}px`;
    dragBox.style.top = `${Math.round(st + dy)}px`;
    syncTextBoxDetailBar();
  }, true);

  doc.addEventListener("mouseup", () => {
    if (!dragBox) return;
    dragBox = null;
    const after = getWysHtml();
    if (after !== dragBeforeHtml) {
      applyWysObjectChange(after, true);
    }
    syncTextBoxDetailBar();
    dragBeforeHtml = "";
  }, true);

  doc.addEventListener("input", (e) => {
    const content = e.target && e.target.closest ? e.target.closest(".jena-textbox-content") : null;
    if (!content) return;
    const box = content.closest(".jena-textbox");
    applyTextBoxVisualState(box);
    scheduleAutoSave(getWysHtml());
  }, true);

  doc.addEventListener("click", (e) => {
    const box = e.target && e.target.closest ? e.target.closest(".jena-textbox") : null;
    if (!box) {
      const selected = doc.__jenaLayerSelected || null;
      if (selected && selected.classList && selected.classList.contains("jena-textbox")) {
        setWysLayerSelection(doc, null);
      }
      return;
    }
    setWysLayerSelection(doc, box);
    const all = doc.querySelectorAll(".jena-textbox");
    for (let i = 0; i < all.length; i++) {
      applyTextBoxVisualState(all[i]);
    }
    const handle = e.target && e.target.closest ? e.target.closest(".jena-textbox-handle") : null;
    const content = box.querySelector(".jena-textbox-content");
    if (content && !handle) {
      content.focus();
    }
    applyTextBoxVisualState(box);
  }, true);

  const all = doc.querySelectorAll(".jena-textbox");
  for (let i = 0; i < all.length; i++) applyTextBoxVisualState(all[i]);
}

// Freeze layout in object-edit mode so other elements do not reflow while moving/resizing.
function freezeLayoutForObjectEdit(doc) {
  if (!doc || !doc.body) return false;
  const base = ensureWysBaseLayer(doc) || doc.body;
  if (!base) return false;

  const view = doc.defaultView || window;
  const all = Array.from(base.querySelectorAll("*"));
  let changed = false;

  function isSkip(el) {
    if (!el || !el.tagName) return true;
    const tag = String(el.tagName).toLowerCase();
    if (["html", "head", "body", "script", "style", "meta", "link", "title", "br"].includes(tag)) return true;
    if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return true;
    if (el.closest && el.closest("#jena-img-resize-ui, #jena-obj-resize-ui")) return true;
    if (el.closest && el.closest("svg") && tag !== "svg") return true;
    if (el.closest && el.closest(".obj-layer-host")) return true;
    return false;
  }

  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (isSkip(el)) continue;
    const cs = view.getComputedStyle(el);
    if (!cs) continue;
    if (String(cs.display || "") === "none" || String(cs.display || "") === "contents") continue;
    if (String(cs.position || "") === "fixed") continue;
    if (el.getAttribute && String(el.getAttribute("data-jena-frozen") || "") === "1") continue;
    if (!el.parentElement) continue;

    const parent = el.parentElement;
    const pcs = view.getComputedStyle(parent);
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    if (String(pcs.position || "") === "static") {
      parent.style.position = "relative";
    }

    const bt = parseFloat(String((pcs && pcs.borderTopWidth) || "0")) || 0;
    const bl = parseFloat(String((pcs && pcs.borderLeftWidth) || "0")) || 0;
    const left = r.left - pr.left - bl + (parent.scrollLeft || 0);
    const top = r.top - pr.top - bt + (parent.scrollTop || 0);
    let z = parseInt(String((cs && cs.zIndex) || ""), 10);
    if (!Number.isFinite(z)) z = 0;

    el.setAttribute("data-jena-frozen", "1");
    el.setAttribute("data-jena-geom-left", String(Math.round(left)));
    el.setAttribute("data-jena-geom-top", String(Math.round(top)));
    el.setAttribute("data-jena-geom-width", String(Math.max(16, Math.round(r.width))));
    el.setAttribute("data-jena-geom-height", String(Math.max(16, Math.round(r.height))));

    el.style.position = "absolute";
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = `${Math.max(16, Math.round(r.width))}px`;
    el.style.height = `${Math.max(16, Math.round(r.height))}px`;
    el.style.margin = "0";
    el.style.float = "none";
    if (Number.isFinite(z)) el.style.zIndex = String(z);

    changed = true;
  }

  if (changed) {
    try {
      const html = getWysHtml();
      applyWysObjectChange(html, true);
    } catch (_) {}
  }
  return changed;
}

function lockAllObjectsAbsoluteOnObjectMode(doc) {
  if (!doc || !doc.body) return 0;
  const base = ensureWysBaseLayer(doc) || doc.body;
  const view = doc.defaultView || window;
  if (!base || !view) return 0;

  function isSkip(el) {
    if (!el || !el.tagName) return true;
    const tag = String(el.tagName).toLowerCase();
    if (["html", "head", "body", "script", "style", "meta", "link", "title", "br"].includes(tag)) return true;
    if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return true;
    if (el.closest && el.closest("#jena-img-resize-ui, #jena-obj-resize-ui")) return true;
    if (el.classList && el.classList.contains("obj-layer-host")) return true;
    if (el.closest && el.closest(".obj-layer-host")) return true;
    if (el.classList && el.classList.contains("jena-textbox-content")) return true;
    return false;
  }

  const nodes = Array.from(base.querySelectorAll("*"));
  let changed = 0;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (isSkip(el)) continue;
    const cs = view.getComputedStyle(el);
    if (!cs) continue;
    const disp = String(cs.display || "");
    if (disp === "none" || disp === "contents") continue;
    if (String(cs.position || "") === "fixed") continue;
    if (!el.parentElement) continue;

    const parent = el.parentElement;
    const pcs = view.getComputedStyle(parent);
    if (pcs && String(pcs.position || "") === "static") {
      parent.style.position = "relative";
    }

    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    const bt = parseFloat(String((pcs && pcs.borderTopWidth) || "0")) || 0;
    const bl = parseFloat(String((pcs && pcs.borderLeftWidth) || "0")) || 0;
    const left = r.left - pr.left - bl + (parent.scrollLeft || 0);
    const top = r.top - pr.top - bt + (parent.scrollTop || 0);
    const w = Math.max(16, Math.round(r.width));
    const h = Math.max(16, Math.round(r.height));
    let z = parseInt(String((cs && cs.zIndex) || ""), 10);
    if (!Number.isFinite(z)) z = 0;

    el.setAttribute("data-jena-frozen", "1");
    el.setAttribute("data-jena-geom-left", String(Math.round(left)));
    el.setAttribute("data-jena-geom-top", String(Math.round(top)));
    el.setAttribute("data-jena-geom-width", String(w));
    el.setAttribute("data-jena-geom-height", String(h));
    changed++;
  }
  return changed;
}

function insertTextBox() {
  const d = getWysDoc();
  if (!d || !d.body) return;
  const key = String((els.textPreset && els.textPreset.value) || "basic");
  const p = TEXTBOX_PRESETS[key] || TEXTBOX_PRESETS.basic;
  const markup = [
    `<div class="jena-textbox" data-tb-border="${sanitizeText(p.border)}" data-tb-handle-bg="${sanitizeText(p.handleBg)}" data-tb-handle-border="${sanitizeText(p.handleBorder)}" data-tb-handle-color="${sanitizeText(p.handleColor)}" contenteditable="false" style="position:absolute;left:120px;top:120px;width:320px;min-height:140px;padding:28px 12px 12px;border:2px dashed ${p.border};background:${p.bg};color:${p.color};font-size:${p.fontSize}px;line-height:1.35;resize:both;overflow:auto;z-index:30;">`,
    `<div class="jena-textbox-handle" contenteditable="false" style="position:absolute;left:0;top:0;right:0;height:22px;background:${p.handleBg};border-bottom:1px dashed ${p.handleBorder};cursor:move;font-size:11px;color:${p.handleColor};padding:3px 8px;user-select:none;">TEXT BOX</div>`,
    '<div class="jena-textbox-content" contenteditable="true" tabindex="0" style="min-height:80px;outline:none;cursor:text;"><br></div>',
    '</div>'
  ].join("");
  const base = ensureWysBaseLayer(d) || d.body;
  const cs = d.defaultView ? d.defaultView.getComputedStyle(base) : null;
  if (base !== d.body && cs && String(cs.position || "static") === "static") {
    base.style.position = "relative";
  }
  const wrap = d.createElement("div");
  wrap.innerHTML = markup;
  const box = wrap.firstElementChild;
  if (!box) return;
  base.appendChild(box);
  placeTextBoxAtFreeSpot(d, base, box);
  setWysLayerSelection(d, box);
  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
}

function placeTextBoxAtFreeSpot(doc, base, box) {
  if (!doc || !base || !box) return;
  const bw = Math.max(320, base.clientWidth || slideWidth || 1280);
  const bh = Math.max(240, base.clientHeight || slideHeight || 720);
  const gap = 12;
  const margin = 16;
  const w = Math.max(120, Math.round(box.offsetWidth || 320));
  const h = Math.max(80, Math.round(box.offsetHeight || 140));
  const all = Array.from(base.querySelectorAll(".jena-textbox")).filter((n) => n && n !== box);

  function rectOf(el) {
    const l = parseFloat(el.style.left);
    const t = parseFloat(el.style.top);
    const ww = Math.max(20, Math.round(el.offsetWidth || parseFloat(el.style.width) || 0));
    const hh = Math.max(20, Math.round(el.offsetHeight || parseFloat(el.style.height) || 0));
    return {
      l: Number.isFinite(l) ? l : (el.offsetLeft || 0),
      t: Number.isFinite(t) ? t : (el.offsetTop || 0),
      r: 0,
      b: 0
    };
  }

  const occupied = all.map((el) => {
    const r = rectOf(el);
    r.r = r.l + Math.max(1, Math.round(el.offsetWidth || parseFloat(el.style.width) || 120));
    r.b = r.t + Math.max(1, Math.round(el.offsetHeight || parseFloat(el.style.height) || 80));
    return r;
  });

  function intersects(x, y) {
    const l = x - gap;
    const t = y - gap;
    const r = x + w + gap;
    const b = y + h + gap;
    for (let i = 0; i < occupied.length; i++) {
      const o = occupied[i];
      if (r <= o.l || l >= o.r || b <= o.t || t >= o.b) continue;
      return true;
    }
    return false;
  }

  let x = 120;
  let y = 120;
  const maxX = Math.max(margin, bw - w - margin);
  const maxY = Math.max(margin, bh - h - margin);
  let found = false;
  for (let i = 0; i < 240; i++) {
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    if (x > maxX) x = margin + ((i * 29) % Math.max(1, maxX - margin + 1));
    if (y > maxY) y = margin + ((i * 17) % Math.max(1, maxY - margin + 1));
    if (!intersects(x, y)) {
      found = true;
      break;
    }
    x += 28;
    y += 24;
  }
  if (!found) {
    x = margin;
    y = margin;
  }
  box.style.left = `${Math.round(x)}px`;
  box.style.top = `${Math.round(y)}px`;
}

function clearEnteredText() {
  const d = getWysDoc();
  if (!d || !d.getSelection) return;
  const sel = d.getSelection();
  let changed = false;

  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (!r.collapsed) {
      r.deleteContents();
      changed = true;
    }
  }

  if (!changed) {
    const active = d.activeElement;
    const box = active && active.closest ? active.closest(".jena-textbox-content") : null;
    if (box) {
      box.innerHTML = "<br>";
      changed = true;
    }
  }

  if (!changed) return;
  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
}

function revokeWysObjectUrls() {
  for (let i = 0; i < activeWysObjectUrls.length; i++) {
    try { URL.revokeObjectURL(activeWysObjectUrls[i]); } catch (_) {}
  }
  activeWysObjectUrls = [];
}

async function hydrateInternalImagesInWys(doc) {
  if (!doc) return;
  const imgs = Array.from(doc.querySelectorAll('img[src^="internal://"]'));
  if (!imgs.length) return;

  let db = null;
  try {
    db = await openAppDb();
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const raw = String(img.getAttribute("src") || "").trim();
      const id = decodeInternalId(raw.replace(/^internal:\/\//i, ""));
      if (!id) continue;
      const rec = await getImageRecord(db, id);
      if (!rec || !rec.blob) continue;
      const objectUrl = URL.createObjectURL(rec.blob);
      activeWysObjectUrls.push(objectUrl);
      img.setAttribute("data-internal-src", raw);
      img.setAttribute("src", objectUrl);
    }
  } catch (_) {
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }
}

function loadWys(html) {
  const src = String(html || START_HTML);
  if (src === lastLoadedWysHtml) return;
  lastLoadedWysHtml = src;
  revokeWysObjectUrls();
  els.wys.onload = () => {
    const d = getWysDoc();
    if (!d) return;
    const markerStyle = d.createElement("style");
    markerStyle.setAttribute("data-jena-ui", "1");
    markerStyle.textContent = [
      ".jena-layer-selected{outline:2px dashed rgba(79,70,229,.65);outline-offset:2px;}",
      "html.jena-object-edit, html.jena-object-edit body{overflow:visible !important;}",
      "html.jena-object-edit .slide, html.jena-object-edit .slide-container{overflow:visible !important;}"
    ].join("");
    if (d.head) d.head.appendChild(markerStyle);
    try { d.designMode = "on"; } catch (_) {}
    if (d.body) d.body.setAttribute("contenteditable", "true");
    bindImageResizeEditor(d);
    bindContainerObjectEditor(d);
    bindTextBoxEditor(d);
    bindTextBoxDetailBar();
    syncTextBoxDetailBar();
    ensureWysBaseLayer(d);
    if (d.documentElement && d.documentElement.classList) {
      d.documentElement.classList.toggle("jena-object-edit", !!objectEditMode);
    }
    setWysLayerSelection(d, null);
    hydrateInternalImagesInWys(d).catch(() => {});
    d.addEventListener("mouseup", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("keyup", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("click", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("selectionchange", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("mouseup", saveWysSelectionRange, true);
    d.addEventListener("keyup", saveWysSelectionRange, true);
    d.addEventListener("selectionchange", saveWysSelectionRange, true);
    d.addEventListener("input", () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        const html = getWysHtml();
        els.code.value = html;
        renderCodeLineNumbers();
        scheduleAutoSave(html);
        scheduleCodeMarkerSync(false);
      }, 120);
    }, true);
    d.addEventListener("beforeinput", () => {
      try { if (typeof pushGlobalUndoCheckpoint === "function") pushGlobalUndoCheckpoint("wys"); } catch (_) {}
    }, true);
    d.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = String(e.key || "").toLowerCase();
      if (mod && (e.key === "ArrowRight" || e.key === "ArrowDown")) {
        if (typeof cur !== "undefined" && Array.isArray(slides) && typeof loadCurrent === "function" && cur < slides.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          cur++;
          loadCurrent();
        }
        return;
      }
      if (mod && (e.key === "ArrowLeft" || e.key === "ArrowUp")) {
        if (typeof cur !== "undefined" && Array.isArray(slides) && typeof loadCurrent === "function" && cur > 0) {
          e.preventDefault();
          e.stopPropagation();
          cur--;
          loadCurrent();
        }
        return;
      }
      if (mod && key === "z") {
        if (undoHistory()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        let inListContext = false;
        try {
          const sel = d.getSelection ? d.getSelection() : null;
          let node = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null;
          if (node && node.nodeType === 3) node = node.parentElement;
          const host = node && node.closest ? node.closest("li,ul,ol") : null;
          inListContext = !!host;
        } catch (_) {}
        if (inListContext) {
          e.preventDefault();
          e.stopPropagation();
          try { d.execCommand(e.shiftKey ? "outdent" : "indent", false, null); } catch (_) {}
          clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            const html = getWysHtml();
            els.code.value = html;
            renderCodeLineNumbers();
            scheduleAutoSave(html);
          }, 30);
          return;
        }
      }
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = d.activeElement;
        const tag = String((active && active.tagName) || "").toLowerCase();
        const isInputLike = tag === "input" || tag === "textarea" || tag === "select" || tag === "button";
        const editable = !!(active && active.isContentEditable);
        let inListContext = false;
        try {
          const sel = d.getSelection ? d.getSelection() : null;
          let node = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null;
          if (node && node.nodeType === 3) node = node.parentElement;
          const host = node && node.closest ? node.closest("li,ul,ol") : null;
          inListContext = !!host;
        } catch (_) {}
        // Keep native Enter behavior inside list context so next bullet/number is auto-created.
        if (inListContext) return;
        if (!isInputLike && editable) {
          e.preventDefault();
          e.stopPropagation();
          try {
            d.execCommand("insertLineBreak", false, null);
          } catch (_) {
            try { d.execCommand("insertHTML", false, "<br>"); } catch (_) {}
          }
          // Fallback sync in case browser does not emit input for execCommand.
          clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            const html = getWysHtml();
            els.code.value = html;
            renderCodeLineNumbers();
            scheduleAutoSave(html);
          }, 30);
          return;
        }
      }
      if (!objectEditMode) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = d.activeElement;
      if (active) {
        const tag = String(active.tagName || "").toLowerCase();
        const editable = active.isContentEditable || tag === "input" || tag === "textarea";
        if (editable) return;
      }
      if (deleteSelectedLayer()) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    scheduleCodeMarkerSync(true);
    try { window.dispatchEvent(new CustomEvent("jena-wys-loaded", { detail: { doc: d } })); } catch (_) {}
  };
  els.wys.srcdoc = src;
}


function execCmd(cmd, val) {
  const d = getWysDoc();
  if (!d) return;
  try { els.wys.contentWindow.focus(); } catch (_) {}
  d.execCommand(cmd, false, val == null ? null : val);
}

function saveWysSelectionRange() {
  const d = getWysDoc();
  if (!d || !d.getSelection) return;
  const sel = d.getSelection();
  if (!sel || sel.rangeCount < 1) return;
  savedStyleRange = sel.getRangeAt(0).cloneRange();
}

function restoreWysSelectionRange() {
  const d = getWysDoc();
  if (!d || !d.getSelection || !savedStyleRange) return false;
  const sel = d.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(savedStyleRange);
  return true;
}

function applyFontSizePx(px) {
  const size = clamp(Number(px) || 16, 6, 200);
  execCmd("fontSize", 7);
  const d = getWysDoc();
  if (!d) return;
  const fonts = d.querySelectorAll('font[size="7"]');
  for (let i = 0; i < fonts.length; i++) {
    fonts[i].removeAttribute("size");
    fonts[i].style.fontSize = `${size}px`;
  }
}

function applyQuickFormatting(type) {
  restoreWysSelectionRange();
  if (type === "size") {
    const size = Number(els.quickFontSize ? els.quickFontSize.value : 16) || 16;
    applyFontSizePx(size);
  } else if (type === "text") {
    const color = String(els.quickTextColor ? els.quickTextColor.value : "#1a2233");
    execCmd("foreColor", color);
  } else if (type === "hilite") {
    const color = String(els.quickHiliteColor ? els.quickHiliteColor.value : "#fff59d");
    execCmd("hiliteColor", color);
    execCmd("backColor", color);
  }
  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
}

function clearWysSelectionAfterColorApply() {
  const d = getWysDoc();
  if (!d || !d.getSelection) return;
  try {
    const sel = d.getSelection();
    if (sel) sel.removeAllRanges();
  } catch (_) {}
  try {
    const active = d.activeElement;
    if (active && active !== d.body && typeof active.blur === "function") active.blur();
  } catch (_) {}
  savedStyleRange = null;
}

function applyQuickFormattingWithCommit(type) {
  applyQuickFormatting(type);
  clearWysSelectionAfterColorApply();
}

function setQuickFontSizeValue(px) {
  if (!els.quickFontSize) return;
  const size = clamp(parseInt(px, 10) || 16, 6, 200);
  const val = String(size);
  let opt = null;
  for (let i = 0; i < els.quickFontSize.options.length; i++) {
    if (String(els.quickFontSize.options[i].value) === val) {
      opt = els.quickFontSize.options[i];
      break;
    }
  }
  if (!opt) {
    opt = document.createElement("option");
    opt.value = val;
    opt.textContent = `${val}px`;
    els.quickFontSize.appendChild(opt);
  }
  els.quickFontSize.value = val;
  applyQuickFormatting("size");
}

function openInlineFontSizeEditor() {
  if (!els.quickFontSize) return;
  const selectEl = els.quickFontSize;
  if (selectEl.dataset.editing === "1") return;
  selectEl.dataset.editing = "1";

  const current = parseInt(String(selectEl.value || "16"), 10) || 16;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "find-input quick-select";
  input.value = String(current);
  input.style.minWidth = "88px";

  selectEl.style.display = "none";
  selectEl.parentNode.insertBefore(input, selectEl.nextSibling);
  input.focus();
  input.select();

  const closeEditor = (applyValue) => {
    if (applyValue) {
      const parsed = parseInt(String(input.value || "").trim(), 10);
      if (Number.isFinite(parsed)) setQuickFontSizeValue(parsed);
    }
    input.remove();
    selectEl.style.display = "";
    delete selectEl.dataset.editing;
    selectEl.focus();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeEditor(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeEditor(false);
    }
  });
  input.addEventListener("blur", () => closeEditor(true));
}

function stepQuickFontSize(delta) {
  if (!els.quickFontSize) return;
  const curSize = parseInt(String(els.quickFontSize.value || "16"), 10) || 16;
  const step = delta > 0 ? 2 : -2;
  setQuickFontSizeValue(curSize + step);
}

function openStyleModal() {
  saveWysSelectionRange();
  if (els.styleOverlay) els.styleOverlay.classList.add("open");
}

function closeStyleModal() {
  if (els.styleOverlay) els.styleOverlay.classList.remove("open");
}

function fmtInDbDate(ts) {
  const n = Number(ts) || Date.now();
  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function closeInDbModal() {
  if (els.inDbOverlay) els.inDbOverlay.classList.remove("open");
}

const ABS_COORD_SETTING_KEY = "jena.absCoordButtonVisible";

function setAbsCoordButtonVisible(next, savePref) {
  showAbsCoordButton = !!next;
  if (els.btnAbsCoordInfo) els.btnAbsCoordInfo.classList.toggle("hidden", !showAbsCoordButton);
  if (els.chkShowAbsCoordBtn) els.chkShowAbsCoordBtn.checked = showAbsCoordButton;
  if (savePref) {
    try { localStorage.setItem(ABS_COORD_SETTING_KEY, showAbsCoordButton ? "1" : "0"); } catch (_) {}
  }
}

function initAbsCoordButtonSetting() {
  let next = false;
  try { next = localStorage.getItem(ABS_COORD_SETTING_KEY) === "1"; } catch (_) {}
  setAbsCoordButtonVisible(next, false);
}

function buildAbsCoordinateReport() {
  const d = getWysDoc();
  if (!d || !d.body) return "No editor document.";
  const base = ensureWysBaseLayer(d) || d.body;
  const list = [];
  const all = Array.from(base.querySelectorAll("*"));
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!el || !el.tagName) continue;
    if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") continue;
    const l = parseFloat(String(el.getAttribute("data-jena-geom-left") || ""));
    const t = parseFloat(String(el.getAttribute("data-jena-geom-top") || ""));
    const w = parseFloat(String(el.getAttribute("data-jena-geom-width") || ""));
    const h = parseFloat(String(el.getAttribute("data-jena-geom-height") || ""));
    if (!Number.isFinite(l) || !Number.isFinite(t) || !Number.isFinite(w) || !Number.isFinite(h)) continue;
    const tag = String(el.tagName || "").toLowerCase();
    const cls = String(el.className || "").trim().replace(/\s+/g, ".");
    const name = cls ? `${tag}.${cls}` : tag;
    list.push(`${String(list.length + 1).padStart(3, "0")}. ${name} | x=${Math.round(l)}, y=${Math.round(t)}, w=${Math.round(w)}, h=${Math.round(h)}`);
  }
  if (!list.length) return "No absolute coordinate records.";
  return list.join("\n");
}

function openAbsCoordInfoModal() {
  try { lockAllObjectsAbsoluteOnObjectMode(getWysDoc()); } catch (_) {}
  if (els.absCoordText) els.absCoordText.value = buildAbsCoordinateReport();
  if (els.absCoordOverlay) els.absCoordOverlay.classList.add("open");
}

function closeAbsCoordInfoModal() {
  if (els.absCoordOverlay) els.absCoordOverlay.classList.remove("open");
}

function refreshSlideSizeUi() {
  const sizeText = `Slide Size: ${slideWidth} x ${slideHeight}`;
  if (els.slideSizeCurrent) {
    els.slideSizeCurrent.textContent = `Current: ${slideWidth} x ${slideHeight}`;
  }
  if (els.slideSizeBottomInfo) els.slideSizeBottomInfo.textContent = sizeText;
  if (els.slideSizeWidth) els.slideSizeWidth.value = String(slideWidth);
  if (els.slideSizeHeight) els.slideSizeHeight.value = String(slideHeight);
  if (els.slideSizeAspectLock) els.slideSizeAspectLock.checked = isSlideAspectLockEnabled();
  if (els.slideSizePreset) els.slideSizePreset.value = "current";
  if (els.chkShowAbsCoordBtn) els.chkShowAbsCoordBtn.checked = !!showAbsCoordButton;
}

let slideAspectLock = true;
let slideAspectRatio = slideWidth / Math.max(1, slideHeight);
let slideAspectSyncing = false;

function isSlideAspectLockEnabled() {
  return !!slideAspectLock;
}

function setSlideAspectLockEnabled(next) {
  slideAspectLock = !!next;
  if (slideAspectLock) {
    const w = clamp(parseInt(String(els.slideSizeWidth ? els.slideSizeWidth.value : slideWidth), 10) || slideWidth, 320, 4000);
    const h = clamp(parseInt(String(els.slideSizeHeight ? els.slideSizeHeight.value : slideHeight), 10) || slideHeight, 240, 4000);
    slideAspectRatio = w / Math.max(1, h);
  }
}

function syncSlideAspectByWidthInput() {
  if (slideAspectSyncing || !slideAspectLock || !els.slideSizeWidth || !els.slideSizeHeight) return;
  const w = clamp(parseInt(String(els.slideSizeWidth.value || slideWidth), 10) || slideWidth, 320, 4000);
  const ratio = Number.isFinite(slideAspectRatio) && slideAspectRatio > 0 ? slideAspectRatio : (slideWidth / Math.max(1, slideHeight));
  const h = clamp(Math.round(w / ratio), 240, 4000);
  slideAspectSyncing = true;
  els.slideSizeHeight.value = String(h);
  slideAspectSyncing = false;
}

function syncSlideAspectByHeightInput() {
  if (slideAspectSyncing || !slideAspectLock || !els.slideSizeWidth || !els.slideSizeHeight) return;
  const h = clamp(parseInt(String(els.slideSizeHeight.value || slideHeight), 10) || slideHeight, 240, 4000);
  const ratio = Number.isFinite(slideAspectRatio) && slideAspectRatio > 0 ? slideAspectRatio : (slideWidth / Math.max(1, slideHeight));
  const w = clamp(Math.round(h * ratio), 320, 4000);
  slideAspectSyncing = true;
  els.slideSizeWidth.value = String(w);
  slideAspectSyncing = false;
}

function openSlideSettingsModal() {
  slideAspectRatio = slideWidth / Math.max(1, slideHeight);
  refreshSlideSizeUi();
  if (els.slideSettingsOverlay) els.slideSettingsOverlay.classList.add("open");
}

function closeSlideSettingsModal() {
  if (els.slideSettingsOverlay) els.slideSettingsOverlay.classList.remove("open");
}

function applySlideSizePreset() {
  if (!els.slideSizePreset) return;
  const key = String(els.slideSizePreset.value || "current");
  if (key === "current") {
    if (els.slideSizeWidth) els.slideSizeWidth.value = String(slideWidth);
    if (els.slideSizeHeight) els.slideSizeHeight.value = String(slideHeight);
    return;
  }
  if (key === "custom") return;
  const p = SLIDE_SIZE_PRESETS[key];
  if (!p) return;
  if (els.slideSizeWidth) els.slideSizeWidth.value = String(p.w);
  if (els.slideSizeHeight) els.slideSizeHeight.value = String(p.h);
  slideAspectRatio = p.w / Math.max(1, p.h);
}

function scalePxString(v, k) {
  const s = String(v || "").trim();
  if (!s) return s;
  const m = /^(-?\d+(?:\.\d+)?)px$/i.exec(s);
  if (!m) return s;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return s;
  return `${Math.round(n * k * 1000) / 1000}px`;
}

function scaleNumericAttr(el, attr, k) {
  if (!el || !el.getAttribute || !el.setAttribute) return;
  const raw = String(el.getAttribute(attr) || "").trim();
  if (!raw) return;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return;
  el.setAttribute(attr, String(Math.max(0, Math.round(n * k))));
}

function scaleStyleProps(el, kx, ky) {
  if (!el || !el.style) return;
  const sxProps = ["left", "right", "width", "minWidth", "maxWidth", "marginLeft", "marginRight", "paddingLeft", "paddingRight"];
  const syProps = ["top", "bottom", "height", "minHeight", "maxHeight", "marginTop", "marginBottom", "paddingTop", "paddingBottom"];
  for (let i = 0; i < sxProps.length; i++) {
    const p = sxProps[i];
    if (!el.style[p]) continue;
    el.style[p] = scalePxString(el.style[p], kx);
  }
  for (let i = 0; i < syProps.length; i++) {
    const p = syProps[i];
    if (!el.style[p]) continue;
    el.style[p] = scalePxString(el.style[p], ky);
  }
  const uniProps = ["fontSize", "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderRadius", "letterSpacing"];
  const ku = (kx + ky) / 2;
  for (let i = 0; i < uniProps.length; i++) {
    const p = uniProps[i];
    if (!el.style[p]) continue;
    el.style[p] = scalePxString(el.style[p], ku);
  }
  if (el.style.lineHeight) {
    const lh = String(el.style.lineHeight || "").trim();
    if (/px$/i.test(lh)) el.style.lineHeight = scalePxString(lh, ku);
  }
}

function resizeSlideHtmlPhysical(html, fromW, fromH, toW, toH) {
  const src = String(html || "");
  if (!src) return src;
  const fx = Math.max(1, Number(fromW) || 1);
  const fy = Math.max(1, Number(fromH) || 1);
  const tx = Math.max(1, Number(toW) || 1);
  const ty = Math.max(1, Number(toH) || 1);
  const kx = tx / fx;
  const ky = ty / fy;
  if (Math.abs(kx - 1) < 0.0001 && Math.abs(ky - 1) < 0.0001) return src;

  const wrap = document.createElement("div");
  wrap.innerHTML = src;
  const roots = Array.from(wrap.children || []).filter((n) => n && n.nodeType === 1);
  let base = wrap.querySelector('[data-jena-base-layer="1"]') || wrap.querySelector(".slide") || null;
  if (!base && roots.length === 1) base = roots[0];
  if (!base) base = wrap;

  const all = [base].concat(Array.from(base.querySelectorAll("*")));
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!el || !el.tagName) continue;
    if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") continue;
    scaleStyleProps(el, kx, ky);
    scaleNumericAttr(el, "width", kx);
    scaleNumericAttr(el, "height", ky);

    const gx = parseFloat(String(el.getAttribute && el.getAttribute("data-jena-geom-left") || ""));
    const gy = parseFloat(String(el.getAttribute && el.getAttribute("data-jena-geom-top") || ""));
    const gw = parseFloat(String(el.getAttribute && el.getAttribute("data-jena-geom-width") || ""));
    const gh = parseFloat(String(el.getAttribute && el.getAttribute("data-jena-geom-height") || ""));
    if (Number.isFinite(gx)) el.setAttribute("data-jena-geom-left", String(Math.round(gx * kx)));
    if (Number.isFinite(gy)) el.setAttribute("data-jena-geom-top", String(Math.round(gy * ky)));
    if (Number.isFinite(gw)) el.setAttribute("data-jena-geom-width", String(Math.max(1, Math.round(gw * kx))));
    if (Number.isFinite(gh)) el.setAttribute("data-jena-geom-height", String(Math.max(1, Math.round(gh * ky))));
  }

  // Ensure actual content root(s) follow new canvas size so layout reflows and hidden text can become visible.
  const sizeTargets = (base !== wrap) ? [base] : roots;
  for (let i = 0; i < sizeTargets.length; i++) {
    const t = sizeTargets[i];
    if (!t || !t.style) continue;
    t.style.width = `${Math.round(tx)}px`;
    t.style.height = `${Math.round(ty)}px`;
    t.style.maxWidth = "none";
    t.style.minWidth = `${Math.round(tx)}px`;
    t.style.minHeight = `${Math.round(ty)}px`;
    if (!t.style.position) t.style.position = "relative";
  }

  // If absolute-positioned objects drift away from canvas origin, pull them back into slide space.
  const absNodes = Array.from(base.querySelectorAll("*")).filter((el) => {
    if (!el || !el.style) return false;
    const pos = String(el.style.position || "").toLowerCase();
    return pos === "absolute" || pos === "relative";
  });
  let minLeft = Infinity;
  let minTop = Infinity;
  for (let i = 0; i < absNodes.length; i++) {
    const el = absNodes[i];
    const l = parseFloat(String(el.style.left || ""));
    const t = parseFloat(String(el.style.top || ""));
    if (Number.isFinite(l)) minLeft = Math.min(minLeft, l);
    if (Number.isFinite(t)) minTop = Math.min(minTop, t);
  }
  const pad = 8;
  const needShiftX = Number.isFinite(minLeft) && (minLeft < 0 || minLeft > pad);
  const needShiftY = Number.isFinite(minTop) && (minTop < 0 || minTop > pad);
  if (needShiftX || needShiftY) {
    const dx = needShiftX ? (pad - minLeft) : 0;
    const dy = needShiftY ? (pad - minTop) : 0;
    for (let i = 0; i < absNodes.length; i++) {
      const el = absNodes[i];
      const l = parseFloat(String(el.style.left || ""));
      const t = parseFloat(String(el.style.top || ""));
      if (Number.isFinite(l)) el.style.left = `${Math.round((l + dx) * 1000) / 1000}px`;
      if (Number.isFinite(t)) el.style.top = `${Math.round((t + dy) * 1000) / 1000}px`;
      const gl = parseFloat(String(el.getAttribute("data-jena-geom-left") || ""));
      const gt = parseFloat(String(el.getAttribute("data-jena-geom-top") || ""));
      if (Number.isFinite(gl)) el.setAttribute("data-jena-geom-left", String(Math.round(gl + dx)));
      if (Number.isFinite(gt)) el.setAttribute("data-jena-geom-top", String(Math.round(gt + dy)));
    }
  }
  return wrap.innerHTML;
}

function resizeAllSlidesPhysical(fromW, fromH, toW, toH) {
  if (!Array.isArray(slides) || !slides.length) return;
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i] || {};
    slides[i] = {
      ...s,
      html: resizeSlideHtmlPhysical(String(s.html || START_HTML), fromW, fromH, toW, toH)
    };
  }
}

function applySlideSizeSettings() {
  const w = clamp(parseInt(String(els.slideSizeWidth ? els.slideSizeWidth.value : "1280"), 10) || 1280, 320, 4000);
  const h = clamp(parseInt(String(els.slideSizeHeight ? els.slideSizeHeight.value : "720"), 10) || 720, 240, 4000);
  const prevW = slideWidth;
  const prevH = slideHeight;
  try { saveCurrent(); } catch (_) {}
  resizeAllSlidesPhysical(prevW, prevH, w, h);
  slideWidth = w;
  slideHeight = h;
  if (els.chkShowAbsCoordBtn) setAbsCoordButtonVisible(!!els.chkShowAbsCoordBtn.checked, true);
  try { loadCurrent(); } catch (_) {}
  try {
    if (els.stage) {
      els.stage.scrollLeft = 0;
      els.stage.scrollTop = 0;
    }
    const d = getWysDoc();
    if (d && d.scrollingElement) {
      d.scrollingElement.scrollLeft = 0;
      d.scrollingElement.scrollTop = 0;
    }
  } catch (_) {}
  applyZoom();
  refreshSlideSizeUi();
  closeSlideSettingsModal();
}

function renderInDbList(records) {
  if (!els.inDbList) return;
  const arr = Array.isArray(records) ? records : [];
  if (!arr.length) {
    els.inDbList.innerHTML = '<div class="indb-item"><div class="indb-title">No saved data</div></div>';
    selectedInDbId = "";
    return;
  }
  if (!selectedInDbId || !arr.some((r) => String(r.id) === selectedInDbId)) {
    selectedInDbId = String(arr[0].id || "");
  }
  const html = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i] || {};
    const id = String(r.id || "");
    const name = sanitizeText(String(r.name || "saved-set"));
    const slidesCount = Array.isArray(r.slides) ? r.slides.length : 0;
    const active = id === selectedInDbId ? " active" : "";
    html.push(
      `<div class="indb-item${active}" data-indb-id="${sanitizeText(id)}">` +
      `<div class="indb-title">${name}</div>` +
      `<div class="indb-meta">${fmtInDbDate(r.updatedAt)} 쨌 ${slidesCount} slides</div>` +
      `</div>`
    );
  }
  els.inDbList.innerHTML = html.join("");
  els.inDbList.querySelectorAll("[data-indb-id]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedInDbId = String(el.getAttribute("data-indb-id") || "");
      els.inDbList.querySelectorAll(".indb-item").forEach((n) => n.classList.remove("active"));
      el.classList.add("active");
    });
  });
}

async function openInDbModal() {
  selectedInDbId = "";
  const list = await listSavedSlidesFromInDb();
  renderInDbList(list);
  if (els.inDbOverlay) els.inDbOverlay.classList.add("open");
}

async function loadSelectedInDb() {
  const id = String(selectedInDbId || "").trim();
  if (!id) return;
  const ok = await loadSlidesFromInDbById(id);
  if (!ok) return;
  closeInDbModal();
  loadCurrent();
}

async function deleteSelectedInDb() {
  const id = String(selectedInDbId || "").trim();
  if (!id) return;
  if (!confirm("Delete selected inDB saved data?")) return;
  await removeSlidesFromInDbById(id);
  const list = await listSavedSlidesFromInDb();
  renderInDbList(list);
}

function stepStyleFontSize(delta) {
  if (!els.styleFontSize) return;
  const list = Array.from(els.styleFontSize.options).map((o) => Number(o.value) || 0).filter((n) => n > 0);
  if (!list.length) return;
  const curSize = Number(els.styleFontSize.value) || list[0];
  let nearest = list[0];
  for (let i = 0; i < list.length; i++) {
    if (Math.abs(list[i] - curSize) < Math.abs(nearest - curSize)) nearest = list[i];
  }
  const idx = Math.max(0, list.indexOf(nearest));
  const nextIdx = clamp(idx + (delta > 0 ? 1 : -1), 0, list.length - 1);
  els.styleFontSize.value = String(list[nextIdx]);
}

function applyStyleFromModal() {
  restoreWysSelectionRange();
  const d = getWysDoc();
  if (!d) {
    closeStyleModal();
    return;
  }

  const size = Number(els.styleFontSize ? els.styleFontSize.value : 16) || 16;
  const textColor = String(els.styleTextColor ? els.styleTextColor.value : "#1a2233");
  const bgColor = String(els.styleBgColor ? els.styleBgColor.value : "#fff59d");
  const boldMode = String(els.styleBoldMode ? els.styleBoldMode.value : "keep");
  const italicMode = String(els.styleItalicMode ? els.styleItalicMode.value : "keep");

  applyFontSizePx(size);
  execCmd("foreColor", textColor);
  execCmd("hiliteColor", bgColor);
  execCmd("backColor", bgColor);

  if (boldMode !== "keep") {
    const on = !!d.queryCommandState && d.queryCommandState("bold");
    if ((boldMode === "on" && !on) || (boldMode === "off" && on)) execCmd("bold");
  }
  if (italicMode !== "keep") {
    const on = !!d.queryCommandState && d.queryCommandState("italic");
    if ((italicMode === "on" && !on) || (italicMode === "off" && on)) execCmd("italic");
  }

  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
  closeStyleModal();
}

function sanitizeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^internal:\/\//i.test(s)) return s;
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(s)) return s;
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/i.test(s)) return "";
  return "https://" + s;
}

function sanitizeText(raw) {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .trim();
}

function openLinkModal() {
  saveWysSelectionRange();
  if (els.linkDisplayText) els.linkDisplayText.value = "";
  if (els.linkUrlText) els.linkUrlText.value = "https://";
  const modal = document.getElementById("linkModal");
  if (modal && modal.dataset.initPos !== "1") {
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.width = "360px";
    modal.dataset.initPos = "1";
  }
  if (els.linkOverlay) els.linkOverlay.classList.add("open");
  if (els.linkDisplayText) setTimeout(() => els.linkDisplayText.focus(), 0);
}

function closeLinkModal() {
  if (els.linkOverlay) els.linkOverlay.classList.remove("open");
}

function applyLinkModal() {
  const href = sanitizeUrl(els.linkUrlText ? els.linkUrlText.value : "");
  const txt = sanitizeText(els.linkDisplayText ? els.linkDisplayText.value : "");
  if (!href) return;
  const label = txt || href;
  restoreWysSelectionRange();
  insertHtmlIntoWys(`<a href="${sanitizeText(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  closeLinkModal();
}

function initLinkModalWindowControls() {
  const modal = document.getElementById("linkModal");
  const head = document.getElementById("linkModalHead");
  const handle = document.getElementById("linkResizeHandle");
  if (!modal || !head || !handle || modal.dataset.boundDragResize === "1") return;
  modal.dataset.boundDragResize = "1";

  let mode = "";
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;
  let sw = 0;
  let sh = 0;

  const onMove = (e) => {
    if (!mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (mode === "drag") {
      modal.style.left = `${Math.round(sl + dx)}px`;
      modal.style.top = `${Math.round(st + dy)}px`;
      modal.style.transform = "none";
      return;
    }
    if (mode === "resize") {
      const w = Math.max(300, Math.round(sw + dx));
      const h = Math.max(220, Math.round(sh + dy));
      modal.style.width = `${w}px`;
      modal.style.height = `${h}px`;
    }
  };
  const onUp = () => { mode = ""; };

  head.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("button,input,select,textarea,label,a")) return;
    e.preventDefault();
    mode = "drag";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sl = rect.left;
    st = rect.top;
    modal.style.left = `${Math.round(sl)}px`;
    modal.style.top = `${Math.round(st)}px`;
    modal.style.transform = "none";
  });

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    mode = "resize";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sw = rect.width;
    sh = rect.height;
    modal.style.width = `${Math.round(sw)}px`;
    modal.style.height = `${Math.round(sh)}px`;
  });

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
}

let insertImgGalleryObjectUrls = [];
let tbDetailBound = false;
let insertPreviewSrc = "";

function setInsertImagePreview(src) {
  const img = document.getElementById("insertImgPreview");
  const empty = document.getElementById("insertImgPreviewEmpty");
  const next = String(src || "").trim();
  insertPreviewSrc = next;
  if (!img || !empty) return;
  if (!next) {
    img.classList.add("hidden");
    img.removeAttribute("src");
    empty.classList.remove("hidden");
    return;
  }
  img.src = next;
  img.classList.remove("hidden");
  empty.classList.add("hidden");
}

function openInsertImageZoom(src) {
  const u = String(src || "").trim();
  if (!u) return;
  const overlay = document.getElementById("insertImgZoomOverlay");
  const img = document.getElementById("insertImgZoomImage");
  if (!overlay || !img) return;
  img.src = u;
  overlay.classList.add("open");
}

function closeInsertImageZoom() {
  const overlay = document.getElementById("insertImgZoomOverlay");
  const img = document.getElementById("insertImgZoomImage");
  if (!overlay) return;
  overlay.classList.remove("open");
  if (img) img.removeAttribute("src");
}

function syncInsertPreviewBySource() {
  if (currentImgSource === "url") {
    setInsertImagePreview(els.insertImgUrl ? els.insertImgUrl.value : "");
    return;
  }
  if (!els.insertImgDbSelect || !els.insertImgGallery) {
    setInsertImagePreview("");
    return;
  }
  const val = String(els.insertImgDbSelect.value || "");
  const card = els.insertImgGallery.querySelector(`.insert-img-card[data-value="${val.replace(/"/g, '\\"')}"]`);
  const thumb = card ? card.querySelector("img") : null;
  setInsertImagePreview(thumb && thumb.src ? thumb.src : "");
}

function clearInsertImgGallery() {
  if (els.insertImgGallery) els.insertImgGallery.innerHTML = "";
  for (let i = 0; i < insertImgGalleryObjectUrls.length; i++) {
    try { URL.revokeObjectURL(insertImgGalleryObjectUrls[i]); } catch (_) {}
  }
  insertImgGalleryObjectUrls = [];
}

function syncInsertImgGallerySelection() {
  if (!els.insertImgGallery || !els.insertImgDbSelect) return;
  const val = String(els.insertImgDbSelect.value || "");
  const cards = els.insertImgGallery.querySelectorAll(".insert-img-card");
  for (let i = 0; i < cards.length; i++) {
    const on = String(cards[i].getAttribute("data-value") || "") === val;
    cards[i].classList.toggle("active", on);
  }
  syncInsertPreviewBySource();
}

function renderInsertImgGallery(records) {
  if (!els.insertImgGallery) return;
  clearInsertImgGallery();
  const arr = Array.isArray(records) ? records : [];
  if (!arr.length) {
    els.insertImgGallery.innerHTML = '<div class="insert-img-empty">No saved images</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i] || {};
    const id = String(r.id || "").trim();
    if (!id) continue;
    const encoded = encodeURIComponent(id);
    const value = `internal://${encoded}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "insert-img-card";
    btn.setAttribute("data-value", value);
    const img = document.createElement("img");
    img.alt = String(r.name || id);
    if (r.blob) {
      const url = URL.createObjectURL(r.blob);
      insertImgGalleryObjectUrls.push(url);
      img.src = url;
    }
    const cap = document.createElement("div");
    cap.className = "insert-img-cap";
    cap.textContent = String(r.name || id);
    btn.appendChild(img);
    btn.appendChild(cap);
    btn.addEventListener("click", () => {
      if (els.insertImgDbSelect) els.insertImgDbSelect.value = value;
      syncInsertImgGallerySelection();
      if (img && img.src) openInsertImageZoom(img.src);
    });
    frag.appendChild(btn);
  }
  els.insertImgGallery.appendChild(frag);
  syncInsertImgGallerySelection();
}

function pickHexColor(v, fallback) {
  const s = String(v || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  const m = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i.exec(s);
  if (m) {
    const toHex = (n) => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, "0");
    return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
  }
  return fallback;
}

function getSelectedTextBoxFromWys() {
  const d = getWysDoc();
  if (!d) return null;
  const el = d.__jenaLayerSelected || null;
  if (!el) return null;
  // Detail bar is shown only when the currently selected layer itself is a textbox.
  if (el.classList && el.classList.contains("jena-textbox")) return el;
  return null;
}

function syncTextBoxDetailBar() {
  const bar = document.getElementById("textBoxDetailBar");
  if (!bar) return;
  const box = getSelectedTextBoxFromWys();
  if (!box) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const x = document.getElementById("tbX");
  const y = document.getElementById("tbY");
  const w = document.getElementById("tbW");
  const h = document.getElementById("tbH");
  const bg = document.getElementById("tbBg");
  const bd = document.getElementById("tbBorder");
  const tc = document.getElementById("tbColor");
  if (x) x.value = String(parseInt(box.style.left || "0", 10) || 0);
  if (y) y.value = String(parseInt(box.style.top || "0", 10) || 0);
  if (w) w.value = String(Math.max(40, parseInt(box.style.width || "0", 10) || box.offsetWidth || 320));
  if (h) h.value = String(Math.max(40, parseInt(box.style.minHeight || "0", 10) || parseInt(box.style.height || "0", 10) || box.offsetHeight || 140));
  if (bg) bg.value = pickHexColor(box.style.backgroundColor || box.style.background || "#ffffff", "#ffffff");
  if (bd) bd.value = pickHexColor(box.style.borderColor || box.dataset.tbBorder || "#8ea0c8", "#8ea0c8");
  if (tc) tc.value = pickHexColor(box.style.color || "#1a2233", "#1a2233");
}

function applyTextBoxDetailFromBar() {
  const box = getSelectedTextBoxFromWys();
  if (!box) return;
  const x = document.getElementById("tbX");
  const y = document.getElementById("tbY");
  const w = document.getElementById("tbW");
  const h = document.getElementById("tbH");
  const bg = document.getElementById("tbBg");
  const bd = document.getElementById("tbBorder");
  const tc = document.getElementById("tbColor");
  if (x) box.style.left = `${parseInt(String(x.value || "0"), 10) || 0}px`;
  if (y) box.style.top = `${parseInt(String(y.value || "0"), 10) || 0}px`;
  if (w) box.style.width = `${Math.max(40, parseInt(String(w.value || "320"), 10) || 320)}px`;
  if (h) box.style.minHeight = `${Math.max(40, parseInt(String(h.value || "140"), 10) || 140)}px`;
  if (bg) box.style.background = String(bg.value || "#ffffff");
  if (bd) {
    box.style.borderColor = String(bd.value || "#8ea0c8");
    box.dataset.tbBorder = String(bd.value || "#8ea0c8");
  }
  if (tc) box.style.color = String(tc.value || "#1a2233");
  const html = getWysHtml();
  applyWysObjectChange(html, true);
}

function bindTextBoxDetailBar() {
  if (tbDetailBound) return;
  tbDetailBound = true;
  const ids = ["tbX", "tbY", "tbW", "tbH", "tbBg", "tbBorder", "tbColor"];
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (!el) continue;
    el.addEventListener("input", applyTextBoxDetailFromBar);
    el.addEventListener("change", applyTextBoxDetailFromBar);
  }
  window.addEventListener("jena-layer-selection", () => syncTextBoxDetailBar());
}

async function refreshImageDbOptions() {
  if (!els.insertImgDbSelect) return;
  let records = [];
  try {
    const db = await openAppDb();
    try {
      records = await listImageRecords(db);
    } finally {
      try { db.close(); } catch (_) {}
    }
  } catch (_) {
    records = [];
  }
  const opts = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i] || {};
    const id = String(r.id || "").trim();
    if (!id) continue;
    const label = String(r.name || id);
    const encoded = encodeURIComponent(id);
    opts.push(`<option value="internal://${encoded}">${sanitizeText(label)} (${sanitizeText(id)})</option>`);
  }
  els.insertImgDbSelect.innerHTML = opts.join("");
  renderInsertImgGallery(records);
}

async function deleteSelectedInsertImageFromDb() {
  const raw = String(els.insertImgDbSelect && els.insertImgDbSelect.value ? els.insertImgDbSelect.value : "").trim();
  if (!raw || !raw.startsWith("internal://")) return false;
  const id = decodeInternalId(raw.slice("internal://".length));
  if (!id) return false;
  const db = await openAppDb();
  let ok = false;
  try {
    ok = await deleteImageRecordById(db, id);
  } finally {
    try { db.close(); } catch (_) {}
  }
  await refreshImageDbOptions();
  if (typeof setInsertImgbbStatus === "function") {
    setInsertImgbbStatus(ok ? "선택 이미지가 삭제되었습니다." : "삭제할 이미지를 먼저 선택하세요.", !ok);
  }
  return ok;
}

function setInsertMode(mode) {
  currentInsertMode = mode === "img" ? "img" : "link";
  if (els.insertModalTitle) {
    els.insertModalTitle.textContent = currentInsertMode === "img" ? "Insert Image" : "Insert Link";
  }
  if (els.insertLinkPane) els.insertLinkPane.classList.toggle("hidden", currentInsertMode !== "link");
  if (els.insertImgPane) els.insertImgPane.classList.toggle("hidden", currentInsertMode !== "img");
}

function setImgSource(mode) {
  currentImgSource = mode === "db" ? "db" : "url";
  if (els.insertImgUrl) els.insertImgUrl.classList.toggle("hidden", currentImgSource !== "url");
  if (els.insertImgDbSelect) els.insertImgDbSelect.classList.toggle("hidden", currentImgSource !== "db");
  if (els.insertImgGallery) els.insertImgGallery.classList.toggle("hidden", currentImgSource !== "db");
  if (currentImgSource === "db") syncInsertImgGallerySelection();
  else syncInsertPreviewBySource();
}

function getInsertImgbbApiKeyValue() {
  const fromInput = String(els.insertImgbbApiKey && els.insertImgbbApiKey.value ? els.insertImgbbApiKey.value : "").trim();
  if (fromInput) return fromInput;
  try { return String(localStorage.getItem("ss_imgbb_api_key") || "").trim(); } catch (_) { return ""; }
}

function setInsertImgbbStatus(msg, isError) {
  if (!els.insertImgbbStatus) return;
  els.insertImgbbStatus.textContent = String(msg || "");
  els.insertImgbbStatus.classList.toggle("error", !!isError);
}

function syncInsertImgbbKeyUi() {
  const key = getInsertImgbbApiKeyValue();
  if (els.insertImgbbApiKey && !String(els.insertImgbbApiKey.value || "").trim()) {
    els.insertImgbbApiKey.value = key;
  }
  if (key) setInsertImgbbStatus("imgBB API key가 로드되었습니다. magBB 업로드를 사용할 수 있습니다.", false);
  else setInsertImgbbStatus("imgBB API key를 입력하면 magBB 업로드를 사용할 수 있습니다.", false);
}

async function uploadImageFileToImgbb(file) {
  const f = file || null;
  if (!f || !String(f.type || "").startsWith("image/")) throw new Error("이미지 파일을 선택하세요.");
  const apiKey = getInsertImgbbApiKeyValue();
  if (!apiKey) throw new Error("imgBB API key가 필요합니다.");
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("이미지 읽기 실패"));
    fr.readAsDataURL(f);
  });
  const comma = dataUrl.indexOf(",");
  const base64Data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const form = new FormData();
  form.append("image", base64Data);
  form.append("name", `jena_${Date.now()}`);
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    body: form
  });
  let payload = null;
  try { payload = await response.json(); } catch (_) { payload = null; }
  if (!response.ok || !payload || payload.success === false) {
    const msg = payload && payload.error && payload.error.message ? payload.error.message : `imgBB upload failed (${response.status})`;
    throw new Error(msg);
  }
  const data = payload.data || {};
  const directUrl = String(data.url || (data.image && data.image.url) || data.display_url || "").trim();
  const viewerUrl = String(data.url_viewer || directUrl || "").trim();
  return { directUrl, viewerUrl };
}

async function uploadInsertImageToImgbbByFile(file) {
  setInsertImgbbStatus("imgBB 업로드 중...", false);
  const res = await uploadImageFileToImgbb(file);
  const src = String(res.directUrl || res.viewerUrl || "").trim();
  if (!src) throw new Error("업로드 URL을 확인할 수 없습니다.");
  setInsertImagePreview(src);
  setInsertImgbbStatus("업로드 완료: URL은 입력칸에 넣지 않고 미리보기에서만 표시됩니다.", false);
}

async function openInsertModal(mode) {
  setInsertMode(mode);
  setImgSource("url");
  if (els.insertLinkText) els.insertLinkText.value = "";
  if (els.insertLinkUrl) els.insertLinkUrl.value = "https://";
  if (els.insertImgAlt) els.insertImgAlt.value = "";
  if (els.insertImgUrl) els.insertImgUrl.value = "";
  if (els.insertImgLinkUrl) els.insertImgLinkUrl.value = "";
  if (els.insertImgFile) els.insertImgFile.value = "";
  setInsertImagePreview("");
  closeInsertImageZoom();
  syncInsertImgbbKeyUi();
  const modal = document.getElementById("insertModalWindow");
  if (modal && modal.dataset.initPos !== "1") {
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.width = "1120px";
    modal.dataset.initPos = "1";
  }
  await refreshImageDbOptions();
  syncTextBoxDetailBar();
  if (els.insertOverlay) els.insertOverlay.classList.add("open");
  if (currentInsertMode === "img" && currentImgSource === "db" && els.insertImgDbSelect) {
    els.insertImgDbSelect.focus();
  } else if (currentInsertMode === "img" && els.insertImgAlt) {
    els.insertImgAlt.focus();
  } else if (els.insertLinkText) {
    els.insertLinkText.focus();
  }
}

function initImageModalWindowControls() {
  const modal = document.getElementById("insertModalWindow");
  const head = document.getElementById("insertModalHead");
  const handle = document.getElementById("insertResizeHandle");
  if (!modal || !head || !handle || modal.dataset.boundDragResize === "1") return;
  modal.dataset.boundDragResize = "1";

  let mode = "";
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;
  let sw = 0;
  let sh = 0;

  const onMove = (e) => {
    if (!mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (mode === "drag") {
      modal.style.left = `${Math.round(sl + dx)}px`;
      modal.style.top = `${Math.round(st + dy)}px`;
      modal.style.transform = "none";
      return;
    }
    if (mode === "resize") {
      const w = Math.max(720, Math.round(sw + dx));
      const h = Math.max(360, Math.round(sh + dy));
      modal.style.width = `${w}px`;
      modal.style.height = `${h}px`;
    }
  };
  const onUp = () => { mode = ""; };

  head.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("button,input,select,textarea,label,a")) return;
    e.preventDefault();
    mode = "drag";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sl = rect.left;
    st = rect.top;
    modal.style.left = `${Math.round(sl)}px`;
    modal.style.top = `${Math.round(st)}px`;
    modal.style.transform = "none";
  });

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    mode = "resize";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sw = rect.width;
    sh = rect.height;
    modal.style.width = `${Math.round(sw)}px`;
    modal.style.height = `${Math.round(sh)}px`;
  });

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
}

function closeInsertModal() {
  closeInsertImageZoom();
  clearInsertImgGallery();
  if (els.insertOverlay) els.insertOverlay.classList.remove("open");
}

function insertHtmlIntoWys(html, forceReload) {
  const snippet = String(html || "");
  if (!snippet) return;
  execCmd("insertHTML", snippet);
  const next = getWysHtml();
  els.code.value = next;
  renderCodeLineNumbers();
  scheduleAutoSave(next);
  if (forceReload) {
    // Re-hydrate internal:// images immediately so inserted image is visible without manual apply.
    loadWys(next);
  }
}

function applyInsertModal() {
  if (currentInsertMode === "link") {
    const href = sanitizeUrl(els.insertLinkUrl ? els.insertLinkUrl.value : "");
    const txt = sanitizeText(els.insertLinkText ? els.insertLinkText.value : "");
    if (!href) return;
    const label = txt || href;
    insertHtmlIntoWys(`<a href="${sanitizeText(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    closeInsertModal();
    return;
  }

  const alt = sanitizeText(els.insertImgAlt ? els.insertImgAlt.value : "");
  const src = currentImgSource === "db"
    ? sanitizeUrl(els.insertImgDbSelect ? els.insertImgDbSelect.value : "")
    : sanitizeUrl(els.insertImgUrl ? els.insertImgUrl.value : "");
  if (!src) return;
  const imgTag = `<img src="${sanitizeText(src)}" alt="${alt}" style="max-width:100%;height:auto;">`;
  const linkUrl = sanitizeUrl(els.insertImgLinkUrl ? els.insertImgLinkUrl.value : "");
  if (linkUrl) {
    insertHtmlIntoWys(`<a href="${sanitizeText(linkUrl)}" target="_blank" rel="noopener noreferrer">${imgTag}</a>`, true);
  } else {
    insertHtmlIntoWys(imgTag, true);
  }
  closeInsertModal();
}

