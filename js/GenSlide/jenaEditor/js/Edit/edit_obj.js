/**
 * Finds the 'real target' for layer (Z-index) manipulation among selected objects.
 * - Even if simple text is selected, it finds the parent `.jena-textbox` to move the entire box.
 * - UI controls (data-jena-ui) or the base layer are excluded from manipulation.
 */
function resolveSelectedObjectLayerTarget(doc, el) {
  if (!doc || !doc.body) return null;
  // Use the globally stored currently selected object (__jenaLayerSelected) if no explicit element (el) is provided
  let target = el || doc.__jenaLayerSelected || null;
  if (!target) return null;
  
  const isImg = target.nodeType === 1 && String(target.tagName || "").toLowerCase() === "img";
  // If not an image, check if there is a text box container (.jena-textbox) among its parents and replace the target
  if (!isImg && target.closest) {
    const tb = target.closest(".jena-textbox");
    if (tb) target = tb;
  }
  
  // Cancel if the target is invalid or is the body itself
  if (!target || !doc.body.contains(target) || target === doc.body) return null;
  // Prevent manipulation if it's an editor UI element (e.g., resize handler)
  if (target.getAttribute && String(target.getAttribute("data-jena-ui") || "") === "1") return null;
  // Cancel if it's the base layer, as it cannot be sent to the front/back
  const base = ensureWysBaseLayer(doc);
  if (base && target === base) return null;
  
  return target;
}

/**
 * 'Bring to Front' the target object among its sibling elements.
 */
function bringLayerToFront(doc, el, persist) {
  if (!doc || !doc.defaultView) return false;
  const target = resolveSelectedObjectLayerTarget(doc, el);
  if (!target) return false;

  const parent = target.parentElement || doc.body;
  const cs = doc.defaultView.getComputedStyle(target);
  // Force change to relative since position must not be static for z-index to work
  if (cs && String(cs.position || "static") === "static") {
    target.style.position = "relative";
  }

  // Create an array of sibling elements, excluding itself and UI elements
  const siblings = Array.from(parent.children || []).filter((n) => {
    if (!n || n === target) return false;
    if (n.getAttribute && String(n.getAttribute("data-jena-ui") || "") === "1") return false;
    return true;
  });
  
  // Iterate through sibling elements to find the highest z-index value
  let maxZ = 0;
  for (let i = 0; i < siblings.length; i++) {
    const ncs = doc.defaultView.getComputedStyle(siblings[i]);
    const z = parseInt(String((ncs && ncs.zIndex) || ""), 10);
    if (Number.isFinite(z)) maxZ = Math.max(maxZ, z);
  }
  
  // Check the target's current z-index
  let curZ = parseInt(String(target.style.zIndex || ""), 10);
  if (!Number.isFinite(curZ)) curZ = parseInt(String((cs && cs.zIndex) || ""), 10);
  if (!Number.isFinite(curZ)) curZ = 0;
  
  // The target z-index is the current highest value + 1
  const nextZ = Math.max(curZ, maxZ + 1);
  if (nextZ === curZ) return false; // Stop if it's already at the front

  // Apply Z-index with min/max limits (clamp)
  target.style.zIndex = String(clamp(nextZ, -2147483000, 2147483000));
  
  // Whether to persist changes (update history and code view)
  if (persist !== false) {
    const html = getWysHtml();
    els.code.value = html;
    renderCodeLineNumbers();
    scheduleAutoSave(html);
  }
  return true;
}

/**
 * 'Send to Back' the target object among its sibling elements.
 */
function sendLayerToBack(doc, el, persist) {
  if (!doc || !doc.defaultView) return false;
  const target = resolveSelectedObjectLayerTarget(doc, el);
  if (!target) return false;

  const base = ensureWysBaseLayer(doc);
  const parent = target.parentElement || doc.body;
  const cs = doc.defaultView.getComputedStyle(target);
  // Position handling to activate z-index
  if (cs && String(cs.position || "static") === "static") {
    target.style.position = "relative";
  }

  // Filter sibling elements
  const siblings = Array.from(parent.children || []).filter((n) => {
    if (!n || n === target) return false;
    if (n.getAttribute && String(n.getAttribute("data-jena-ui") || "") === "1") return false;
    return true;
  });
  
  // Extract an array of z-index values from sibling elements
  const zVals = siblings.map((n) => {
    const ncs = doc.defaultView.getComputedStyle(n);
    const nz = parseInt(String((ncs && ncs.zIndex) || ""), 10);
    return Number.isFinite(nz) ? nz : 0;
  });
  // Find the lowest z-index value among sibling elements
  const minZ = zVals.length ? Math.min.apply(null, zVals) : 0;
  
  // Check the base layer's z-index (to prevent hiding behind the background)
  const baseCs = base ? doc.defaultView.getComputedStyle(base) : null;
  let baseZ = parseInt(String((baseCs && baseCs.zIndex) || ""), 10);
  if (!Number.isFinite(baseZ)) baseZ = 0;
  
  // Final target Z: (Base Z + 1) if base layer exists, otherwise current (Min Z)
  const floorZ = base ? (baseZ + 1) : minZ;

  let curZ = parseInt(String(target.style.zIndex || ""), 10);
  if (!Number.isFinite(curZ)) curZ = parseInt(String((cs && cs.zIndex) || ""), 10);
  if (!Number.isFinite(curZ)) curZ = 0;
  const nextZ = floorZ;
  if (nextZ === curZ) return false; // Stop if it's already at the back

  target.style.zIndex = String(clamp(nextZ, -2147483000, 2147483000));
  
  // Apply changes
  if (persist !== false) {
    const html = getWysHtml();
    els.code.value = html;
    renderCodeLineNumbers();
    scheduleAutoSave(html);
  }
  return true;
}

/**
 * Wrapper function to bring the currently selected object to the front in the editor (called from UI buttons, etc.).
 */
function bringSelectedObjectToFront() {
  const d = getWysDoc();
  if (!d) return false;
  return bringLayerToFront(d, d.__jenaLayerSelected || null, true);
}

/**
 * Wrapper function to send the currently selected object to the back in the editor (called from UI buttons, etc.).
 */
function sendSelectedObjectToBack() {
  const d = getWysDoc();
  if (!d) return false;
  return sendLayerToBack(d, d.__jenaLayerSelected || null, true);
}
