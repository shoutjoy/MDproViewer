# Math Render Shared Template

`js/math_render/math_render.js` is the shared MathJax helper for `mdlive` and sibling apps.

It standardizes:

- MathJax delimiter config
- safe typeset calls
- popup/print HTML head generation

`js/math_render/latex_render.js` is the LaTeX-only helper layered on top of `MathRender`.

It is useful when an app already has raw LaTeX source and does not need markdown parsing.

Default strategy:

- use `KaTeX` first for fast rendering
- fall back to `MathJax` when needed

## 1. Basic usage in another app

Load these scripts in this order:

```html
<script src="../mdlive/js/math_render/math_render.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js"></script>
```

If the app builds preview HTML into an element:

```html
<div id="preview"></div>
```

```js
function renderPreview(html) {
  const root = document.getElementById('preview');
  root.innerHTML = html;
  MathRender.typeset(root, { silent: true });
}
```

## 2. Safe async usage

If MathJax may not be ready yet:

```js
MathRender.typesetWhenReady(document.getElementById('preview'), {
  silent: true
});
```

## 3. Popup or print window template

If another app opens a new window and wants the same math rendering:

```js
function buildPopupHtml(title, bodyHtml) {
  const head = MathRender.getHeadTags({
    scriptUrl: '../mdlive/js/math_render/math_render.js'
  });

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  ${head}
</head>
<body>
  <div id="content">${bodyHtml}</div>
  <script>
    MathRender.typesetWhenReady(document.getElementById('content'), { silent: true });
  <\/script>
</body>
</html>`;
}
```

## 4. Minimal integration contract

To keep math rendering identical across apps:

- use `MathRender.getHeadTags()` for popup/print HTML
- use `MathRender.typeset()` after injecting rendered HTML
- use `MathRender.typesetWhenReady()` if load timing is uncertain
- keep the same MathJax version unless all apps are updated together

## 5. Scope

This module standardizes math rendering behavior.

It does not standardize:

- markdown parsing
- editor-specific HTML generation
- math-specific CSS outside default MathJax output

If two apps parse markdown differently, final output can still differ even with shared math rendering.

## 6. LaTeX-only helper

Load:

```html
<script src="./js/math_render/math_render.js"></script>
<script src="./js/math_render/latex_render.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js"></script>
```

Render a single formula into an element:

```js
LatexRender.renderToElement(document.getElementById('preview'), '\\hat{\\mu}_{FE} = 0.257', {
  mode: 'display'
});
```

Force one engine:

```js
LatexRender.renderToElement(document.getElementById('preview'), '\\sum_{i=1}^k w_i', {
  mode: 'display',
  engine: 'katex' // or 'mathjax'
});
```
