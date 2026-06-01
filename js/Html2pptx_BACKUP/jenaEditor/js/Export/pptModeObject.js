// Mode object renderer for image_text/full.
// Separated from pptExport.js to isolate mode-specific logic.

async function renderFrameToPptObjectsByMode(frame, slide, pptW, pptH, mode) {
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return;

  const rootRect = (doc.documentElement || doc.body).getBoundingClientRect();
  const clampRect = (r) => {
    const left = Math.max(0, r.left - rootRect.left);
    const top = Math.max(0, r.top - rootRect.top);
    const right = Math.min(slideWidth, r.right - rootRect.left);
    const bottom = Math.min(slideHeight, r.bottom - rootRect.top);
    return {
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  };

  // slide background color (use actual rendered background instead of forced white)
  const bgHex = pickFirstSolidBgHex(
    win,
    [doc.querySelector(".slide-container"), doc.querySelector(".slide"), doc.body, doc.documentElement],
    "FFFFFF"
  );
  try {
    const shapeType = window.PptxGenJS && window.PptxGenJS.ShapeType && window.PptxGenJS.ShapeType.rect;
    if (shapeType) {
      slide.addShape(shapeType, {
        x: 0,
        y: 0,
        w: pptW,
        h: pptH,
        fill: { color: bgHex },
        line: { color: bgHex, transparency: 100 }
      });
    }
  } catch (_) {}

  const allEls = Array.from((doc.body || doc.documentElement).querySelectorAll("*"));
  const ops = [];
  const slideArea = Math.max(1, slideWidth * slideHeight);
  const rectShape = window.PptxGenJS && window.PptxGenJS.ShapeType && window.PptxGenJS.ShapeType.rect;

  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i];
    const tag = String(el.tagName || "").toLowerCase();
    if (!tag || tag === "script" || tag === "style" || tag === "noscript") continue;
    if (!isElementVisible(win, el)) continue;
    const rawRect = el.getBoundingClientRect();
    const cs = win.getComputedStyle(el);
    const iconLike = isIconLikeElement(win, el);
    let r = clampRect(rawRect);
    if (r.width < 2 || r.height < 2) {
      if (iconLike) {
        const fs = Math.max(8, parsePx(cs && cs.fontSize, 16));
        const lh = Math.max(fs, parsePx(cs && cs.lineHeight, fs * 1.2));
        r = clampRect({
          left: rawRect.left,
          top: rawRect.top,
          right: rawRect.left + fs,
          bottom: rawRect.top + lh
        });
      }
      if (r.width < 2 || r.height < 2) continue;
    }
    const rawArea = Math.max(1, (rawRect.width || 0) * (rawRect.height || 0));
    const visRatio = (r.width * r.height) / rawArea;
    const minVisibleRatio = mode === "full" ? 0.01 : 0.12;
    if (visRatio < minVisibleRatio) continue; // mostly off-screen object
    const areaRatio = (r.width * r.height) / slideArea;

    const z = getElementZIndex(win, el);
    const zChain = getZChain(win, el);
    const domPath = getElementDomOrder(el);
    const isJenaTextBox = !!(el.classList && el.classList.contains("jena-textbox"));
    const isJenaTextBoxContent = !!(el.classList && el.classList.contains("jena-textbox-content"));
    const isJenaTextBoxHandle = !!(el.classList && el.classList.contains("jena-textbox-handle"));

    // Handle jena text box as native PPT text box (not image).
    if (isJenaTextBoxHandle) continue;
    if (isJenaTextBoxContent) continue;
    if (!isJenaTextBox && el.closest && el.closest(".jena-textbox")) continue;

    if (isJenaTextBox) {
      const contentEl = el.querySelector(".jena-textbox-content");
      const contentRectRaw = contentEl ? contentEl.getBoundingClientRect() : rawRect;
      const textRect = clampRect(contentRectRaw);
      const textCs = contentEl ? win.getComputedStyle(contentEl) : cs;
      const textValue = sanitizeTextForPpt(
        normalizeElementText((contentEl && (contentEl.innerText || contentEl.textContent)) || "")
      );
      ops.push({
        kind: "jena-textbox",
        el,
        r,
        textR: textRect,
        cs,
        textCs,
        z,
        zChain,
        domPath,
        order: i,
        subOrder: 2,
        text: textValue
      });
      continue;
    }

    if (iconLike) {
      ops.push({ kind: "image-icon", el, r, cs, z, zChain, domPath, order: i, subOrder: 3 });
      continue;
    }

    if (tag === "canvas" || tag === "svg") {
      ops.push({ kind: "image-js", el, r, cs, z, zChain, domPath, order: i, subOrder: 1 });
      continue;
    }
    if (tag === "img") {
      ops.push({ kind: "image-img", el, r, cs, z, zChain, domPath, order: i, subOrder: 1 });
      continue;
    }

    const hasBox = hasVisualBoxStyle(cs);
    const hasBgImage = hasBackgroundImageStyle(cs);
    const classContainer = hasContainerLikeClass(el);
    const hasDecorClass = hasDecorLikeClass(el);
    const txt = sanitizeTextForPpt(normalizeElementText(el.innerText || el.textContent || ""));
    const hasText = txt.length > 0;
    const hasMediaDesc = !!el.querySelector("img, canvas, svg");
    const isRootContainer = (tag === "html" || tag === "body");
    const hasPseudoVisual = hasRenderablePseudoVisual(win, el);

    // Container visuals
    if ((hasBox || classContainer || hasDecorClass || hasPseudoVisual) && !isRootContainer && areaRatio < 0.98) {
      // Strict rule: everything visual except text is exported as image slices.
      // (container backgrounds/borders/shadows/pseudo/decor included)
      ops.push({
        kind: hasBgImage ? "image-bg" : "image-box",
        el,
        r,
        cs,
        z,
        zChain,
        domPath,
        order: i,
        subOrder: 0
      });
    }

    // Text extraction: use semantic text tags and text-leaf containers.
    const allowInlineText = !isInlineTextTag(tag) || isPositionedForText(cs) || isBlockLikeDisplay(cs && cs.display);
    const textLeaf = !hasBlockChildren(el) && !hasVisibleNonInlineTextChild(win, el);
    const semanticText = isTextTag(tag);
    const inlineSemantic = isInlineTextSemanticTag(tag);
    const blockAncestor = inlineSemantic && el.closest ? el.closest("h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,label") : null;
    const skipInlineDup = !!blockAncestor;
    const skipContainerDup = !isBlockTextTag(tag) && hasTextElementChild(el) && !textLeaf;
    if (hasText && allowInlineText && !hasMediaDesc && areaRatio < 0.95 && (semanticText || textLeaf) && !skipInlineDup && !skipContainerDup) {
      ops.push({
        kind: "text",
        el,
        r,
        cs,
        z,
        zChain,
        domPath,
        order: i,
        subOrder: 2,
        text: txt
      });
    }
  }

  ops.sort((a, b) => {
    const zc = compareZChain(a.zChain, b.zChain);
    if (zc !== 0) return zc;
    if (a.z !== b.z) return a.z - b.z;
    const dc = compareDomOrderPath(a.domPath, b.domPath);
    if (dc !== 0) return dc;
    if (a.order !== b.order) return a.order - b.order;
    return (a.subOrder || 0) - (b.subOrder || 0);
  });

  const seenTextKeys = new Set();
  const seenImageKeys = new Set();

  for (let i = 0; i < ops.length; i++) {
    const c = ops[i];
    if (!c || !c.el) continue;

    if (c.kind === "jena-textbox") {
      try {
        const shapeType = window.PptxGenJS && window.PptxGenJS.ShapeType && window.PptxGenJS.ShapeType.rect;
        if (shapeType) {
          const bg = parseCssColorToHexAlpha(c.cs && c.cs.backgroundColor, "FFFFFF");
          const borderW = Math.max(0, parsePx(c.cs && c.cs.borderTopWidth, 0));
          const borderHex = toPptColor(c.cs && c.cs.borderTopColor, "8EA0C8");
          const shapeOpt = {
            x: pxToInchX(c.r.left, pptW),
            y: pxToInchY(c.r.top, pptH),
            w: pxToInchX(c.r.width, pptW),
            h: pxToInchY(c.r.height, pptH),
            fill: { color: bg.hex, transparency: Math.max(0, Math.min(100, Math.round((1 - bg.alpha) * 100))) },
            line: borderW > 0 ? { color: borderHex, pt: Math.max(0.25, borderW * 0.75) } : { transparency: 100 }
          };
          slide.addShape(shapeType, shapeOpt);
        }
      } catch (_) {}

      if (String(c.text || "").trim()) {
        try {
          const tcs = c.textCs || c.cs;
          const tr = c.textR || c.r;
          slide.addText(c.text, {
            x: pxToInchX(tr.left, pptW),
            y: pxToInchY(tr.top, pptH),
            w: pxToInchX(tr.width, pptW),
            h: pxToInchY(tr.height, pptH),
            fontSize: Math.max(7, Math.min(120, parsePx(tcs && tcs.fontSize, 16) * 0.75)),
            color: toPptColor(tcs && tcs.color, "1f2a44"),
            bold: Number(tcs && tcs.fontWeight) >= 600,
            italic: String((tcs && tcs.fontStyle) || "").includes("italic"),
            underline: String((tcs && tcs.textDecorationLine) || "").includes("underline"),
            fontFace: getSafeFontFace(tcs),
            align: getTextAlignFromStyle(tcs),
            valign: "top",
            margin: 0
          });
        } catch (_) {}
      }
      continue;
    }

    if (c.kind === "image-js" || c.kind === "image-img" || c.kind === "image-icon") {
      try {
        const key = [c.kind, Math.round(c.r.left), Math.round(c.r.top), Math.round(c.r.width), Math.round(c.r.height)].join("|");
        if (seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        const data = await captureDomElementToPngData(c.el);
        if (!data) continue;
        slide.addImage({
          data,
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH)
        });
      } catch (_) {}
      continue;
    }

    if (c.kind === "image-bg") {
      try {
        const key = [c.kind, Math.round(c.r.left), Math.round(c.r.top), Math.round(c.r.width), Math.round(c.r.height)].join("|");
        if (seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        let data = "";
        const hasBgImage = hasBackgroundImageStyle(c.cs);
        if (hasBgImage) {
          data = await captureBackgroundStyleToPngData(doc, c.cs, c.r.width, c.r.height);
        } else {
          data = await captureElementBackgroundOnlyToPngData(doc, c.el);
        }
        if (!data) continue;
        slide.addImage({
          data,
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH)
        });
      } catch (_) {}
      continue;
    }

    if (c.kind === "image-box") {
      try {
        const key = [c.kind, Math.round(c.r.left), Math.round(c.r.top), Math.round(c.r.width), Math.round(c.r.height)].join("|");
        if (seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        const data = await captureElementBackgroundOnlyToPngData(doc, c.el);
        if (!data) continue;
        slide.addImage({
          data,
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH)
        });
      } catch (_) {}
      continue;
    }

    if (c.kind === "text") {
      const cs = c.cs;
      const key = [
        c.text,
        Math.round(c.r.left),
        Math.round(c.r.top),
        Math.round(c.r.width),
        Math.round(c.r.height)
      ].join("|");
      if (seenTextKeys.has(key)) continue;
      seenTextKeys.add(key);
      try {
        slide.addText(c.text, {
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH),
          fontSize: Math.max(7, Math.min(120, parsePx(cs && cs.fontSize, 16) * 0.75)),
          color: toPptColor(cs && cs.color, "1f2a44"),
          bold: Number(cs && cs.fontWeight) >= 600,
          italic: String((cs && cs.fontStyle) || "").includes("italic"),
          underline: String((cs && cs.textDecorationLine) || "").includes("underline"),
          fontFace: getSafeFontFace(cs),
          align: getTextAlignFromStyle(cs),
          valign: "top",
          margin: 0
        });
      } catch (_) {}
    }
  }
}

