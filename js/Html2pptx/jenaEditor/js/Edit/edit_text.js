function getSelectedTextBoxForLayerOrder() {
  const d = getWysDoc();
  if (!d || !d.body) return null;
  let el = d.__jenaLayerSelected || null;
  if (!el) return null;
  if (el.classList && el.classList.contains("jena-textbox")) return el;
  if (el.closest) {
    const tb = el.closest(".jena-textbox");
    if (tb) return tb;
  }
  return null;
}

function changeTextBoxLayerOrder(step) {
  const d = getWysDoc();
  if (!d || !d.defaultView) return false;
  const el = getSelectedTextBoxForLayerOrder();
  if (!el || !d.body.contains(el)) return false;
  if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return false;

  const base = ensureWysBaseLayer(d);
  if (el === base) return false;

  const cs = d.defaultView.getComputedStyle(el);
  if (cs && String(cs.position || "static") === "static") {
    el.style.position = "relative";
  }

  const parent = el.parentElement || d.body;
  const siblings = Array.from(parent.children || []).filter((n) => {
    if (!n || n === el) return false;
    if (n.getAttribute && String(n.getAttribute("data-jena-ui") || "") === "1") return false;
    return true;
  });
  const zVals = siblings.map((n) => {
    const ncs = d.defaultView.getComputedStyle(n);
    const nz = parseInt(String((ncs && ncs.zIndex) || ""), 10);
    return Number.isFinite(nz) ? nz : 0;
  });
  const maxZ = zVals.length ? Math.max.apply(null, zVals) : 0;
  const minZ = zVals.length ? Math.min.apply(null, zVals) : 0;
  const baseCs = base ? d.defaultView.getComputedStyle(base) : null;
  let baseZ = parseInt(String((baseCs && baseCs.zIndex) || ""), 10);
  if (!Number.isFinite(baseZ)) baseZ = 0;
  const floorZ = base ? (baseZ + 1) : minZ;

  let curZ = parseInt(String(el.style.zIndex || ""), 10);
  if (!Number.isFinite(curZ)) curZ = parseInt(String((cs && cs.zIndex) || ""), 10);
  if (!Number.isFinite(curZ)) curZ = 0;

  let nextZ = curZ;
  if (Number(step) > 0) {
    const higher = zVals.filter((z) => z > curZ).sort((a, b) => a - b);
    if (higher.length) nextZ = higher[0];
  } else if (Number(step) < 0) {
    const lower = zVals.filter((z) => z < curZ && z >= floorZ).sort((a, b) => b - a);
    if (lower.length) nextZ = lower[0];
    else nextZ = Math.max(curZ - 1, floorZ);
  } else {
    return false;
  }

  if (nextZ === curZ) return false;
  el.style.zIndex = String(clamp(nextZ, -2147483000, 2147483000));
  const html = getWysHtml();
  applyWysObjectChange(html, true);
  return true;
}
