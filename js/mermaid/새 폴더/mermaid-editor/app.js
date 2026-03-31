mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true,
  securityLevel: 'loose',
  theme: 'default',
  flowchart: { useMaxWidth: true, htmlLabels: true },
  themeVariables: {
    fontFamily: '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif'
  }
});

const editor = document.getElementById('raw-code-editor');
const renderDiv = document.getElementById('render');
const errorDiv = document.getElementById('error');

let renderTimer = null;
let currentDirection = 'TD';
let renderSeq = 0;

// 초기 템플릿 설정
editor.value = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]`;

function setDirection(dir) {
  currentDirection = dir;
  document.getElementById('dir-TD').classList.toggle('active', dir === 'TD');
  document.getElementById('dir-LR').classList.toggle('active', dir === 'LR');

  const lines = editor.value.split('\n');
  if (lines.length > 0 && /^\s*(flowchart|graph)\s+(TD|LR|TB|BT|RL)/i.test(lines[0])) {
    lines[0] = lines[0].replace(/\b(TD|LR|TB|BT|RL)\b/i, dir);
    editor.value = lines.join('\n');
    render();
  }
}

function debounceRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 300);
}

function preprocessMermaidSourceForRender(source) {
  const src = String(source || '').trim();
  if (!/^sankey-beta\b/i.test(src)) return { source: src, labelMap: null };

  const lines = src.split(/\r?\n/);
  const out = [];
  const labelMap = {};
  const reverseMap = {};
  let seq = 0;
  let started = false;

  function isQuoted(value) {
    const v = String(value || '').trim();
    return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
  }
  function unquote(value) {
    const v = String(value || '').trim();
    if (isQuoted(v)) return v.slice(1, -1);
    return v;
  }
  function quoteIfNeeded(value) {
    const v = String(value || '').trim();
    if (!v) return '""';
    if (isQuoted(v)) return v;
    if (/[^\x00-\x7F]/.test(v) || /\s/.test(v) || /[,:;]/.test(v)) return '"' + v.replace(/"/g, '\\"') + '"';
    return v;
  }
  function toAlias(label) {
    const key = String(label || '');
    if (reverseMap[key]) return reverseMap[key];
    const alias = 'kr_node_' + (seq++);
    reverseMap[key] = alias;
    labelMap[alias] = key;
    return alias;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = String(raw || '').trim();
    if (!started) {
      out.push(raw);
      if (/^sankey-beta\b/i.test(trimmed)) started = true;
      continue;
    }
    if (!trimmed || /^%%/.test(trimmed)) {
      out.push(raw);
      continue;
    }

    const noSemi = trimmed.replace(/;+\s*$/, '');
    const m = noSemi.match(/^(.*?),(.*?),(.*)$/);
    if (!m) {
      out.push(raw);
      continue;
    }
    const fromRaw = unquote(m[1]);
    const toRaw = unquote(m[2]);
    const from = /[^\x00-\x7F]/.test(fromRaw) ? toAlias(fromRaw) : quoteIfNeeded(m[1]);
    const to = /[^\x00-\x7F]/.test(toRaw) ? toAlias(toRaw) : quoteIfNeeded(m[2]);
    const value = String(m[3] || '').trim();
    out.push(from + ', ' + to + ', ' + value);
  }

  return { source: out.join('\n'), labelMap: Object.keys(labelMap).length ? labelMap : null };
}

function restoreSankeyAliasLabels(labelMap) {
  if (!labelMap || !renderDiv) return;
  const svg = renderDiv.querySelector('svg');
  if (!svg) return;
  const textNodes = svg.querySelectorAll('text, tspan');
  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  for (let i = 0; i < textNodes.length; i++) {
    const el = textNodes[i];
    let next = String(el.textContent || '');
    for (const alias in labelMap) {
      if (!Object.prototype.hasOwnProperty.call(labelMap, alias)) continue;
      next = next.replace(new RegExp('\\b' + escapeRegExp(alias) + '\\b', 'g'), String(labelMap[alias] || ''));
    }
    el.textContent = next;
  }
}

async function render() {
  const code = editor.value.trim();
  const prepared = preprocessMermaidSourceForRender(code);
  const renderCode = String(prepared && prepared.source ? prepared.source : code);

  if (!code) {
    renderDiv.innerHTML = '';
    showError('코드가 비어 있습니다.');
    return;
  }

  try {
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    renderDiv.innerHTML = '';

    const id = 'mermaid-' + Date.now() + '-' + (++renderSeq);
    const { svg } = await mermaid.render(id, renderCode);

    if (isErrorSvg(svg)) {
      showError('렌더링 오류\n[render] Mermaid returned an error SVG.');
      return;
    }
    renderDiv.innerHTML = svg;
    restoreSankeyAliasLabels(prepared && prepared.labelMap ? prepared.labelMap : null);
  } catch (e) {
    // Fallback path for version-specific parser/render quirks.
    try {
      renderDiv.innerHTML = '';
      const block = document.createElement('div');
      block.className = 'mermaid';
      block.textContent = renderCode;
      renderDiv.appendChild(block);
      await mermaid.run({ nodes: [block] });
      const hasError = !!renderDiv.querySelector('svg[aria-roledescription="error"], .error-icon, g.error-icon');
      const renderedText = String(renderDiv.textContent || '').toLowerCase();
      if (hasError || renderedText.includes('syntax error in text')) {
        throw new Error('Mermaid fallback render failed.');
      }
      restoreSankeyAliasLabels(prepared && prepared.labelMap ? prepared.labelMap : null);
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    } catch (fallbackErr) {
      renderDiv.innerHTML = '';
      showError('렌더링 오류\n'
        + '[run] ' + (fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr))
        + '\n[render] ' + (e && e.message ? e.message : String(e)));
    }
  }
}

function isErrorSvg(svg) {
  if (!svg) return false;
  const source = String(svg || '');
  const normalized = source.toLowerCase();
  if (normalized.includes('syntax error in text') || normalized.includes('parse error')) return true;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'image/svg+xml');
    const root = doc && doc.documentElement ? doc.documentElement : null;
    if (!root) return false;
    const role = String(root.getAttribute('aria-roledescription') || '').toLowerCase();
    if (role === 'error') return true;
    if (root.querySelector && root.querySelector('svg[aria-roledescription="error"]')) return true;
  } catch (_) {}
  return false;
}

function showError(message) {
  errorDiv.style.display = 'block';
  errorDiv.textContent = message;
}

function insertSnippet(type) {
  const snippets = {
    node: 'A[노드]',
    decision: 'B{조건}',
    arrow: 'A --> B'
  };
  const snippet = snippets[type] || '';
  if (!snippet) return;

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  const insertText = (before && !before.endsWith('\n') ? '\n' : '') + snippet;
  editor.value = before + insertText + after;
  const caret = (before + insertText).length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  render();
}

function loadTemplate(type) {
  if (type === 'shopping') {
    editor.value = `flowchart ${currentDirection}
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]`;
  }
  render();
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(editor.value);
    alert('코드가 복사되었습니다.');
  } catch {
    alert('복사에 실패했습니다.');
  }
}

function downloadSVG() {
  const svg = renderDiv.querySelector('svg');
  if (!svg) {
    alert('렌더링된 SVG가 없습니다.');
    return;
  }
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'diagram.svg';
  a.click();
  URL.revokeObjectURL(url);
}

editor.addEventListener('input', debounceRender);

// 단축키 기능 유지
editor.addEventListener('keydown', function (e) {
  const lines = this.value.split('\n');
  const start = this.selectionStart;
  const beforeCursor = this.value.substring(0, start);
  const lineIdx = beforeCursor.split('\n').length - 1;

  if (e.ctrlKey && e.altKey && e.key === 'ArrowDown') {
    e.preventDefault();
    lines.splice(lineIdx + 1, 0, lines[lineIdx]);
    this.value = lines.join('\n');
    // ... 포커스 유지 로직
    render();
    return;
  }

  if (e.altKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const targetIdx = e.key === 'ArrowUp' ? lineIdx - 1 : lineIdx + 1;
    if (targetIdx >= 0 && targetIdx < lines.length) {
      const temp = lines[lineIdx];
      lines[lineIdx] = lines[targetIdx];
      lines[targetIdx] = temp;
      this.value = lines.join('\n');
      // ... 포커스 유지 로직
      render();
    }
  }
});

render();
