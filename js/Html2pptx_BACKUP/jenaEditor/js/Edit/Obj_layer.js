let objLayerPanelLoaded = false;
let objLayerDoc = null;
let objLayerObserver = null;
let objLayerHost = null;
let objLayerVisible = false;
let objLayerDragState = null;

function getObjLayerHost() {
  if (objLayerHost && document.body.contains(objLayerHost)) return objLayerHost;
  objLayerHost = document.getElementById("objLayerPanelHost");
  return objLayerHost;
}

function ensureObjLayerFloatingDefaults() {
  const host = getObjLayerHost();
  if (!host) return;
  if (!host.dataset.floatInit) {
    host.dataset.floatInit = "1";
    host.style.left = "auto";
    host.style.top = "8px";
    host.style.right = "8px";
    host.style.width = "260px";
    host.style.height = "420px";
  }
}

function clampObjLayerToWrap() {
  const host = getObjLayerHost();
  if (!host) return;
  const wrap = host.closest ? host.closest(".wys-wrap") : null;
  if (!wrap) return;
  const wr = wrap.getBoundingClientRect();
  const hr = host.getBoundingClientRect();
  const maxLeft = Math.max(0, wr.width - hr.width);
  const maxTop = Math.max(0, wr.height - hr.height);
  const left = Math.max(0, Math.min(maxLeft, (parseFloat(host.style.left) || (wr.width - hr.width - 8))));
  const top = Math.max(0, Math.min(maxTop, (parseFloat(host.style.top) || 8)));
  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
  host.style.right = "auto";
}

function bindObjLayerDrag() {
  const host = getObjLayerHost();
  if (!host || host.dataset.dragBound === "1") return;
  host.dataset.dragBound = "1";

  const onMove = (e) => {
    if (!objLayerDragState) return;
    const { hostEl, wrapRect, dx, dy, w, h } = objLayerDragState;
    const maxLeft = Math.max(0, wrapRect.width - w);
    const maxTop = Math.max(0, wrapRect.height - h);
    const nx = Math.max(0, Math.min(maxLeft, e.clientX - wrapRect.left - dx));
    const ny = Math.max(0, Math.min(maxTop, e.clientY - wrapRect.top - dy));
    hostEl.style.left = `${Math.round(nx)}px`;
    hostEl.style.top = `${Math.round(ny)}px`;
    hostEl.style.right = "auto";
  };

  const onUp = () => {
    objLayerDragState = null;
    document.body.classList.remove("split-resizing");
  };

  host.addEventListener("mousedown", (e) => {
    const head = e.target && e.target.closest ? e.target.closest(".obj-layer-head") : null;
    if (!head) return;
    if (e.target && e.target.closest && e.target.closest("button")) return;
    const wrap = host.closest ? host.closest(".wys-wrap") : null;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    objLayerDragState = {
      hostEl: host,
      wrapRect: wr,
      dx: e.clientX - hr.left,
      dy: e.clientY - hr.top,
      w: hr.width,
      h: hr.height
    };
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add("split-resizing");
  }, true);

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  window.addEventListener("resize", () => clampObjLayerToWrap());
}

async function ensureObjLayerPanelUi() {
  if (objLayerPanelLoaded) return true;
  const host = getObjLayerHost();
  if (!host) return false;
  try {
    const res = await fetch("./ui/obj+layer.html", { cache: "no-cache" });
    if (!res.ok) return false;
    host.innerHTML = await res.text();
    objLayerPanelLoaded = true;
    bindObjLayerUiEvents();
    bindObjLayerDrag();
    renderObjLayerPanel();
    return true;
  } catch (_) {
    return false;
  }
}

function bindObjLayerUiEvents() {
  const btnToggle = document.getElementById("btnLayerPanelToggle");
  if (btnToggle && !btnToggle.dataset.layerBound) {
    btnToggle.dataset.layerBound = "1";
    btnToggle.addEventListener("click", () => {
      objLayerVisible = !objLayerVisible;
      applyObjLayerVisibility();
    });
  }

  const btnRefresh = document.getElementById("btnObjLayerRefresh");
  if (btnRefresh && !btnRefresh.dataset.layerBound) {
    btnRefresh.dataset.layerBound = "1";
    btnRefresh.addEventListener("click", () => renderObjLayerPanel());
  }

  const btnFront = document.getElementById("btnObjLayerFront");
  if (btnFront && !btnFront.dataset.layerBound) {
    btnFront.dataset.layerBound = "1";
    btnFront.addEventListener("click", () => {
      if (typeof bringSelectedObjectToFront === "function") bringSelectedObjectToFront();
      renderObjLayerPanel();
    });
  }

  const btnBack = document.getElementById("btnObjLayerBack");
  if (btnBack && !btnBack.dataset.layerBound) {
    btnBack.dataset.layerBound = "1";
    btnBack.addEventListener("click", () => {
      if (typeof sendSelectedObjectToBack === "function") sendSelectedObjectToBack();
      renderObjLayerPanel();
    });
  }
}

function applyObjLayerVisibility() {
  const host = getObjLayerHost();
  if (!host) return;
  ensureObjLayerFloatingDefaults();
  host.classList.toggle("hidden", !objLayerVisible);
  if (objLayerVisible) clampObjLayerToWrap();
}

function isObjLayerIgnored(el) {
  if (!el || !el.tagName) return true;
  const tag = String(el.tagName).toLowerCase();
  if (["html", "head", "body", "script", "style", "meta", "link", "title"].includes(tag)) return true;
  if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return true;
  if (el.classList && (el.classList.contains("jena-textbox-content") || el.classList.contains("jena-textbox-handle"))) return true;
  return false;
}

function isObjLayerCandidate(doc, base, el) {
  if (!el || el === base || isObjLayerIgnored(el)) return false;
  if (el.classList && el.classList.contains("jena-textbox")) return true;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "img" || tag === "canvas" || tag === "svg") return true;
  const cs = doc.defaultView.getComputedStyle(el);
  const pos = String((cs && cs.position) || "");
  const z = parseInt(String((cs && cs.zIndex) || ""), 10);
  if (["absolute", "fixed", "sticky"].includes(pos)) return true;
  if (Number.isFinite(z) && z !== 0) return true;
  if (["div", "section", "article", "aside", "header", "footer", "main"].includes(tag)) {
    const r = el.getBoundingClientRect();
    if (r.width >= 80 && r.height >= 28) return true;
  }
  return false;
}

function collectObjLayerItems(doc) {
  const base = ensureWysBaseLayer(doc) || doc.body;
  if (!base) return [];
  const all = Array.from(base.querySelectorAll("*"));
  const picked = all.filter((el) => isObjLayerCandidate(doc, base, el));
  const pickedSet = new Set(picked);
  const filtered = picked.filter((el) => {
    let p = el.parentElement;
    while (p && p !== base) {
      if (
        pickedSet.has(p) &&
        !(el.tagName && ["IMG", "CANVAS", "SVG"].includes(String(el.tagName).toUpperCase()))
      ) return false;
      p = p.parentElement;
    }
    return true;
  });

  const mapped = filtered.map((el, idx) => {
    const cs = doc.defaultView.getComputedStyle(el);
    let z = parseInt(String((cs && cs.zIndex) || ""), 10);
    if (!Number.isFinite(z)) z = 0;
    return { el, z, idx };
  });
  mapped.sort((a, b) => (b.z - a.z) || (b.idx - a.idx));
  return mapped;
}

function getObjLayerName(el, i) {
  if (!el) return `Layer ${i + 1}`;
  if (el.classList && el.classList.contains("jena-textbox")) return `TextBox ${i + 1}`;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "img") {
    const alt = String(el.getAttribute("alt") || "").trim();
    if (alt) return `IMG: ${alt}`;
    const src = String(el.getAttribute("src") || "");
    return `IMG: ${src.split("/").pop() || "image"}`;
  }
  if (tag === "canvas") return `Canvas: ${el.id || `canvas-${i + 1}`}`;
  const cls = String(el.className || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  return cls ? `${tag}.${cls}` : `${tag}#${i + 1}`;
}

function selectObjLayerItem(doc, el) {
  if (!doc || !el) return;
  if (typeof setWysLayerSelection === "function") setWysLayerSelection(doc, el);
  else doc.__jenaLayerSelected = el;

  const tag = String((el && el.tagName) || "").toLowerCase();
  if (tag === "img" && doc.__jenaImageEditor && typeof doc.__jenaImageEditor.select === "function") {
    doc.__jenaImageEditor.select(el);
  } else if (doc.__jenaContainerEditor && typeof doc.__jenaContainerEditor.select === "function") {
    doc.__jenaContainerEditor.select(el);
  }
}

function moveObjLayerItem(doc, el, dir) {
  if (!doc || !el) return;
  selectObjLayerItem(doc, el);
  if (typeof changeSelectedLayerOrder === "function") {
    changeSelectedLayerOrder(dir > 0 ? 1 : -1);
    return;
  }
  const cs = doc.defaultView.getComputedStyle(el);
  if (cs && String(cs.position || "") === "static") el.style.position = "relative";
  let z = parseInt(String((cs && cs.zIndex) || ""), 10);
  if (!Number.isFinite(z)) z = 0;
  el.style.zIndex = String(z + (dir > 0 ? 1 : -1));
  if (typeof applyWysObjectChange === "function" && typeof getWysHtml === "function") {
    applyWysObjectChange(getWysHtml(), true);
  }
}

function renderObjLayerPanel() {
  const list = document.getElementById("objLayerList");
  const selectedTextEl = document.getElementById("objLayerSelectedText");
  const d = getWysDoc();
  if (!list || !d || !d.body) return;
  const items = collectObjLayerItems(d);
  const selected = d.__jenaLayerSelected || null;

  if (selectedTextEl) {
    selectedTextEl.textContent = selected ? `Selected: ${getObjLayerName(selected, 0)}` : "Selected: none";
    selectedTextEl.title = selectedTextEl.textContent;
  }

  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "obj-layer-empty";
    empty.textContent = "No layer objects";
    list.appendChild(empty);
    return;
  }

  let activeRow = null;
  items.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "obj-layer-item" + ((selected === it.el) ? " active" : "");
    if (selected === it.el) activeRow = row;

    const name = document.createElement("div");
    name.className = "obj-layer-name";
    name.textContent = getObjLayerName(it.el, i);

    const meta = document.createElement("div");
    meta.className = "obj-layer-meta";
    meta.textContent = `z:${it.z}`;

    const left = document.createElement("div");
    left.appendChild(name);
    left.appendChild(meta);

    const ctrl = document.createElement("div");
    ctrl.className = "obj-layer-ctrl";
    const down = document.createElement("button");
    down.className = "btn tiny";
    down.type = "button";
    down.textContent = "down";
    const up = document.createElement("button");
    up.className = "btn tiny";
    up.type = "button";
    up.textContent = "up";
    ctrl.appendChild(down);
    ctrl.appendChild(up);
    row.appendChild(left);
    row.appendChild(ctrl);

    row.addEventListener("click", () => {
      selectObjLayerItem(d, it.el);
      try { it.el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (_) {}
      renderObjLayerPanel();
    });
    up.addEventListener("click", (e) => {
      e.stopPropagation();
      moveObjLayerItem(d, it.el, +1);
      renderObjLayerPanel();
    });
    down.addEventListener("click", (e) => {
      e.stopPropagation();
      moveObjLayerItem(d, it.el, -1);
      renderObjLayerPanel();
    });
    list.appendChild(row);
  });

  if (activeRow && typeof activeRow.scrollIntoView === "function") {
    try { activeRow.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (_) {}
  }
}

function bindObjLayerObserver(doc) {
  if (objLayerObserver) {
    try { objLayerObserver.disconnect(); } catch (_) {}
    objLayerObserver = null;
  }
  if (!doc || !doc.body || !window.MutationObserver) return;
  objLayerObserver = new MutationObserver(() => {
    renderObjLayerPanel();
  });
  try {
    objLayerObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "data-jena-base-layer"]
    });
  } catch (_) {}
}

function initObjLayerPanel() {
  ensureObjLayerPanelUi().then(() => {
    applyObjLayerVisibility();
    renderObjLayerPanel();
    const d = getWysDoc();
    if (d && d !== objLayerDoc) {
      objLayerDoc = d;
      bindObjLayerObserver(d);
    }
  });
}

window.addEventListener("jena-layer-selection", () => {
  renderObjLayerPanel();
});

window.addEventListener("jena-wys-loaded", (e) => {
  const d = e && e.detail ? e.detail.doc : null;
  if (d && d !== objLayerDoc) {
    objLayerDoc = d;
    bindObjLayerObserver(d);
  }
  renderObjLayerPanel();
});
