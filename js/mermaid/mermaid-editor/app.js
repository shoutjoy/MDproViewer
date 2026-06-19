const LIGHT_MERMAID_THEME_VARIABLES = {
  fontFamily: '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif',
  fontSize: '15px',
  primaryColor: '#ffffff',
  primaryTextColor: '#172033',
  primaryBorderColor: '#cbd5e1',
  lineColor: '#64748b',
  secondaryColor: '#f8fafc',
  tertiaryColor: '#eef6ff',
  background: '#ffffff',
  mainBkg: '#ffffff',
  secondBkg: '#f8fafc',
  tertiaryBkg: '#eef6ff',
  nodeBorder: '#cbd5e1',
  clusterBkg: '#f8fafc',
  clusterBorder: '#d7dee8',
  edgeLabelBackground: '#ffffff',
  textColor: '#172033',
  titleColor: '#0f172a',
  labelTextColor: '#172033',
  actorBkg: '#ffffff',
  actorBorder: '#cbd5e1',
  actorTextColor: '#172033',
  noteBkgColor: '#fff7ed',
  noteTextColor: '#3b2f20',
  noteBorderColor: '#fed7aa'
};

const DARK_MERMAID_THEME_VARIABLES = {
  fontFamily: '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif',
  fontSize: '15px',
  primaryColor: '#111827',
  primaryTextColor: '#e5edf7',
  primaryBorderColor: '#475569',
  lineColor: '#94a3b8',
  secondaryColor: '#172033',
  tertiaryColor: '#1e293b',
  background: '#0b1220',
  mainBkg: '#111827',
  secondBkg: '#172033',
  tertiaryBkg: '#1e293b',
  nodeBorder: '#475569',
  clusterBkg: '#0f172a',
  clusterBorder: '#334155',
  edgeLabelBackground: '#111827',
  textColor: '#e5edf7',
  titleColor: '#f8fafc',
  labelTextColor: '#e5edf7',
  actorBkg: '#111827',
  actorBorder: '#475569',
  actorTextColor: '#e5edf7',
  noteBkgColor: '#2d2418',
  noteTextColor: '#fdecc8',
  noteBorderColor: '#92400e'
};

mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true,
  securityLevel: 'loose',
  theme: 'default',
  flowchart: { useMaxWidth: true, htmlLabels: true },
  themeVariables: LIGHT_MERMAID_THEME_VARIABLES
});

const editor = document.getElementById('raw-code-editor');
const renderDiv = document.getElementById('render');
const renderWrapper = document.getElementById('render-wrapper');
const errorDiv = document.getElementById('error');
const editorScaleLabel = document.getElementById('editor-scale-label');
const previewScaleLabel = document.getElementById('preview-scale-label');
const paneDivider = document.getElementById('pane-divider');
const previewPane = document.getElementById('preview-pane');
const editorThemeToggleBtn = document.getElementById('editor-theme-toggle-btn');
const previewThemeToggleBtn = document.getElementById('preview-theme-toggle-btn');

let renderTimer = null;
let renderSeq = 0;
let currentDirection = 'TD';
let editorScale = 1;
let editorDarkMode = false;
let previewScale = 1;
let previewDarkMode = false;
let flowNodeSeq = 1;
const editorUndoStack = [];
const MAX_EDITOR_UNDO = 300;
let applyingEditorUndo = false;
const EXAMPLE_LIBRARY = {
  shopping: `%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}}}%%
flowchart LR
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[Stop]`,
  'sankey-basic': `sankey-beta
p, a, 60
q, a, 40
a, b, 30
a, c, 30
a, s, 40`,
  'sankey-family': `sankey-beta
\uBD80\uBAA8, \uCCAB\uC9F8, 30
\uBD80\uBAA8, \uB458\uC9F8, 30
\uBD80\uBAA8, \uC14B\uC9F8, 40`,
  'sankey-config': `---
config:
  sankey:
    showValues: false
---
sankey-beta
Website,Sign Up,40
Website,Bounce,60
Sign Up,Free Trial,30
Sign Up,Paid Plan,10
Free Trial,Convert,20
Free Trial,Churn,10`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Running: start
    Running --> Paused: pause
    Paused --> Running: resume
    Running --> [*]: stop`,
  class: `classDiagram
    class User {
      +String id
      +String name
      +login()
      +logout()
    }
    class Session {
      +String token
      +Date expiresAt
    }
    User "1" -- "many" Session : creates`,
  sequence: `sequenceDiagram
    participant Client
    participant API
    participant DB
    Client->>API: GET /users
    API->>DB: query users
    DB-->>API: rows
    API-->>Client: JSON`,
  kanban:`---
config:
  kanban:
    ticketBaseUrl: https://github.com/mermaid-js/mermaid/issues/#TICKET#
  theme: dark
---
kanban
  Todo
    [Create Documentation]
    docs[Create Blog about the new diagram]
  [In progress]
    id6[Create renderer so that it works in all cases. We also add some extra text here for testing purposes. And some more just for the extra flare.]
  id9[Ready for deploy]
    id8[Design grammar]@{ assigned: 'knsv' }
  id10[Ready for test]
    id4[Create parsing tests]@{ ticket: 2038, assigned: 'K.Sveidqvist', priority: 'High' }
    id66[last item]@{ priority: 'Very Low', assigned: 'knsv' }
  id11[Done]
    id5[define getData]
    id2[Title of diagram is more than 100 chars when user duplicates diagram with 100 char]@{ ticket: 2036, priority: 'Very High'}
    id3[Update DB function]@{ ticket: 2037, assigned: knsv, priority: 'High' }

  id12[Can't reproduce]
    id13[Weird flickering in Firefox]
  `,  
  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER }|..|{ DELIVERY_ADDRESS : uses
    PRODUCT ||--o{ LINE_ITEM : includes`,
  journey: `journey
    title Checkout Journey
    section Browse
      User: 4: Visit store
      User: 3: View product
    section Purchase
      User: 3: Add to cart
      User: 2: Checkout
    section Post-purchase
      User: 4: Receive email`,
  mindmap: `mindmap
  root((Project Plan))
    Design
      Wireframes
      Prototypes
      User Research
    Development
      Frontend
      Backend
      Database
    Testing
      Unit Tests
      Integration
      UAT`,
  pie: `pie title Tech Stack Usage
    "JavaScript" : 40
    "TypeScript" : 30
    "Python" : 15
    "Go" : 10
    "Other" : 5`,
  timeline: `timeline
    title Product Launch Timeline
    2024-Q1 : Research
             : User interviews
    2024-Q2 : Design
             : Prototyping
    2024-Q3 : Development
             : Testing
    2024-Q4 : Launch
             : Marketing`,
  quadrant: `quadrantChart
    title Feature Prioritization
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Plan
    quadrant-2 Do First
    quadrant-3 Delegate
    quadrant-4 Eliminate
    Auth System: [0.3, 0.9]
    Dark Mode: [0.1, 0.3]
    API v2: [0.8, 0.8]
    Logo Update: [0.2, 0.1]
    Search: [0.6, 0.7]`,
  xychart: `xychart-beta
    title "Monthly Revenue"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Revenue (USD)" 0 --> 10000
    bar [5000, 6200, 7800, 5500, 8900, 9200]
    line [5000, 6200, 7800, 5500, 8900, 9200]`,
  block: `block-beta
columns 3
  Frontend:3
  columns 3
  App["Mobile App"] Web["Web App"] API["API Gateway"]
  columns 3
  Auth["Auth Service"] Users["User Service"] Data["Data Service"]
  columns 3
  DB[("Database")]:3`,
  'kanban-advanced': `---
config:
  kanban:
    ticketBaseUrl: 'https://github.com/mermaid-js/mermaid/issues/#TICKET#'
---
kanban
  Todo
    [Create Documentation]
    docs[Create Blog about the new diagram]
  [In progress]
    id6[Create renderer so that it works in all cases. We also add some extra text here for testing purposes. And some more just for the extra flare.]
  id9[Ready for deploy]
    id8[Design grammar]@{ assigned: 'knsv' }
  id10[Ready for test]
    id4[Create parsing tests]@{ ticket: 2038, assigned: 'K.Sveidqvist', priority: 'High' }
    id66[last item]@{ priority: 'Very Low', assigned: 'knsv' }
  id11[Done]
    id5[define getData]
    id2[Title of diagram is more than 100 chars when user duplicates diagram with 100 char]@{ ticket: 2036, priority: 'Very High'}
    id3[Update DB function]@{ ticket: 2037, assigned: knsv, priority: 'High' }
  id12[Can't reproduce]
    id13[Weird flickering in Firefox]`,
  treemap: `treemap-beta
"Section 1"
    "Leaf 1.1": 12
    "Section 1.2"
      "Leaf 1.2.1": 12
"Section 2"
    "Leaf 2.1": 20
    "Leaf 2.2": 25`,
  requirement: `requirementDiagram
    requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
    }
    element test_entity {
    type: simulation
    }
    test_entity - satisfies -> test_req`,
  gantt: `gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2014-01-01, 30d
    Another task     :after a1  , 20d
    section Another
    Task in sec      :2014-01-12  , 12d
    another task      : 24d`,
  'architecture-basic': `architecture-beta
    group api(cloud)[API]

    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    service disk2(disk)[Storage] in api
    service server(server)[Server] in api

    db:L -- R:server
    disk1:T -- B:server
    disk2:T -- B:db`,
  'block-stack': `block-beta
columns 1
  db(("DB"))
  blockArrowId6<["&nbsp;&nbsp;&nbsp;"]>(down)
  block:ID
    A
    B["A wide one in the middle"]
    C
  end
  space
  D
  ID --> D
  C --> D
  style B fill:#969,stroke:#333,stroke-width:4px`,
  'block-columns': `block-beta
  columns 3
  a b c d`,
  'radar-grades': `---
title: "Grades"
---
radar-beta
  axis m["Math"], s["Science"], e["English"]
  axis h["History"], g["Geography"], a["Art"]
  curve a["Alice"]{85, 90, 80, 70, 75, 90}
  curve b["Bob"]{70, 75, 85, 80, 90, 85}
  max 100
  min 0`,
  'radar-restaurant': `radar-beta
  title Restaurant Comparison
  axis food["Food Quality"], service["Service"], price["Price"]
  axis ambiance["Ambiance"]
  curve a["Restaurant A"]{4, 3, 2, 4}
  curve b["Restaurant B"]{3, 4, 3, 3}
  curve c["Restaurant C"]{2, 3, 4, 2}
  curve d["Restaurant D"]{2, 2, 4, 3}
  graticule polygon
  max 5`,
  'venn-team': `venn-beta
  title "Team overlap"
  set Frontend
  set Backend
  union Frontend,Backend["APIs"]`,
  'venn-ab': `venn-beta
  set A["Alpha"]:20
  set B["Beta"]:12
  union A,B["AB"]:3`,
  'venn-nested': `venn-beta
  set A["Frontend"]
    text A1["React"]
    text A2["Design Systems"]
  set B["Backend"]
    text B1["API"]
  union A,B["Shared"]
    text AB1["OpenAPI"]`,
  'venn-styled': `venn-beta
  set A["Alpha"]:20
    text A1["React"]
    text A2["Design Systems"]
  set B["Beta"]:12
  union A,B["AB"]:3
  style A fill:#ff6b6b
  style A,B color:#333
  style A1 color:red`,
  'ishikawa-photo': `ishikawa-beta
    Blurry Photo
    Process
        Out of focus
        Shutter speed too slow
        Protective film not removed
        Beautification filter applied
    User
        Shaky hands
    Equipment
        LENS
            Inappropriate lens
            Damaged lens
            Dirty lens
        SENSOR
            Damaged sensor
            Dirty sensor
    Environment
        Subject moved too quickly
        Too dark`,
  'treeview-basic': `treeView-beta
    "packages"
        "mermaid"
            "src"
        "parser"`,
  'treeview-config': `---
config:
    treeView:
        rowIndent: 80
        lineThickness: 3
    themeVariables:
        treeView:
            labelFontSize: '20px'
            labelColor: '#FF0000'
            lineColor: '#00FF00'
---
treeView-beta
    "packages"
        "mermaid"
            "src"
        "parser"`,
  'gitgraph-basic': `gitGraph:
    commit "Ashish"
    branch newbranch
    checkout newbranch
    commit id:"1111"
    commit tag:"test"
    checkout main
    commit type: HIGHLIGHT
    commit
    merge newbranch
    commit
    branch b2
    commit`,
  'sequence-loop': `sequenceDiagram
    loop Daily query
        Alice->>Bob: Hello Bob, how are you?
        alt is sick
            Bob->>Alice: Not so good :(
        else is well
            Bob->>Alice: Feeling fresh like a daisy
        end
        opt Extra response
            Bob->>Alice: Thanks for asking
        end
    end`,
  'flowchart-lr': `graph LR
    A[Square Rect] -- Link text --> B((Circle))
    A --> C(Round Rect)
    B --> D{Rhombus}
    C --> D`
};

const CONFIG_TEMPLATE_LIBRARY = {
  'theme-default': `%%{init: { "theme": "default" }}%%`,
  'theme-dark': `%%{init: { "theme": "dark" }}%%`,
  'theme-neutral': `%%{init: { "theme": "neutral" }}%%`,
  'theme-forest': `%%{init: { "theme": "forest" }}%%`,
  'theme-base': `%%{init: { "theme": "base" }}%%`,
  'curve-linear': `%%{init: { "flowchart": { "curve": "linear" } }}%%`,
  'curve-basis': `%%{init: { "flowchart": { "curve": "basis" } }}%%`,
  'curve-step': `%%{init: { "flowchart": { "curve": "stepAfter" } }}%%`,
  'spacing-wide': `%%{init: { "flowchart": { "rankSpacing": 80, "nodeSpacing": 80 } }}%%`,
  'html-labels': `%%{init: { "flowchart": { "htmlLabels": true } }}%%`,
  'brand-primary': `%%{init: { "themeVariables": { "primaryColor": "#4f46e5" } }}%%`,
  'brand-line': `%%{init: { "themeVariables": { "lineColor": "#111827" } }}%%`,
  'brand-font-family': `%%{init: { "themeVariables": { "fontFamily": "Pretendard" } }}%%`,
  'brand-font-size': `%%{init: { "themeVariables": { "fontSize": "16px" } }}%%`,
  'brand-cluster': `%%{init: { "themeVariables": { "clusterBkg": "#f0f0f0" } }}%%`,
  'kanban-ticket': `%%{init: { "kanban": { "ticketBaseUrl": "https://github.com/mermaid-js/mermaid/issues/#TICKET#" } }}%%`,
  'sequence-align': `%%{init: { "sequence": { "messageAlign": "center", "mirrorActors": true } }}%%`,
  'gantt-compact': `%%{init: { "gantt": { "displayMode": "compact" } }}%%`,
  'mindmap-width': `%%{init: { "mindmap": { "maxNodeWidth": 200 } }}%%`
};

function openSyntaxTutorial() {
  window.open('https://mermaid.ai/open-source/syntax/flowchart.html', '_blank', 'noopener,noreferrer');
}

function captureEditorState() {
  return {
    value: String(editor.value || ''),
    start: editor.selectionStart || 0,
    end: editor.selectionEnd || 0
  };
}

function pushEditorUndoState() {
  if (applyingEditorUndo) return;
  const state = captureEditorState();
  const last = editorUndoStack[editorUndoStack.length - 1];
  if (last && last.value === state.value && last.start === state.start && last.end === state.end) return;
  editorUndoStack.push(state);
  if (editorUndoStack.length > MAX_EDITOR_UNDO) editorUndoStack.shift();
}

function restoreEditorState(state) {
  if (!state) return;
  applyingEditorUndo = true;
  editor.value = String(state.value || '');
  const end = editor.value.length;
  const s = Math.max(0, Math.min(state.start || 0, end));
  const e = Math.max(0, Math.min(state.end || 0, end));
  editor.focus();
  editor.setSelectionRange(s, e);
  applyingEditorUndo = false;
  render();
}

function undoEditorChange() {
  if (!editorUndoStack.length) return false;
  const prev = editorUndoStack.pop();
  restoreEditorState(prev);
  return true;
}

function splitFrontMatter(text) {
  const src = String(text || '');
  if (!src.startsWith('---')) return null;
  const m = src.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(\r?\n|$)/);
  if (!m) return null;
  const front = m[0].trim();
  const body = src.slice(m[0].length);
  return { front, body };
}

function splitInitDirective(text) {
  const src = String(text || '');
  const m = src.match(/^%%\{init:\s*[\s\S]*?\}%%\s*(\r?\n|$)/);
  if (!m) return null;
  const init = m[0].trim();
  const body = src.slice(m[0].length);
  return { init, body };
}

function insertConfigTemplate(templateKey) {
  const key = String(templateKey || '').trim();
  if (!key || !CONFIG_TEMPLATE_LIBRARY[key]) return;
  const cfg = String(CONFIG_TEMPLATE_LIBRARY[key] || '').trim();
  if (!cfg) return;

  const current = String(editor.value || '');
  const initParsed = splitInitDirective(current);
  const parsed = splitFrontMatter(current);
  pushEditorUndoState();
  if (initParsed) {
    editor.value = cfg + '\n' + String(initParsed.body || '').replace(/^\s+/, '');
  } else if (parsed) {
    editor.value = cfg + '\n' + String(parsed.body || '').replace(/^\s+/, '');
  } else {
    editor.value = cfg + '\n' + current.replace(/^\s+/, '');
  }
  render();
}

function insertConfigTemplateFromSelect() {
  const sel = document.getElementById('config-template-select');
  if (!sel) return;
  const key = String(sel.value || '').trim();
  if (!key) return;
  insertConfigTemplate(key);
}
// Initial template
editor.value = EXAMPLE_LIBRARY.shopping;

function setDirection(dir) {
  currentDirection = dir;
  document.getElementById('dir-TD').classList.toggle('active', dir === 'TD');
  document.getElementById('dir-LR').classList.toggle('active', dir === 'LR');

  const lines = editor.value.split('\n');
  if (lines.length > 0 && /^\s*(flowchart|graph)\s+(TD|LR|TB|BT|RL)/i.test(lines[0])) {
    pushEditorUndoState();
    lines[0] = lines[0].replace(/\b(TD|LR|TB|BT|RL)\b/i, dir);
    editor.value = lines.join('\n');
    render();
  }
}

function debounceRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 300);
}

function applyEditorScale() {
  editor.style.fontSize = `${Math.round(14 * editorScale)}px`;
  if (editorScaleLabel) editorScaleLabel.textContent = `${Math.round(editorScale * 100)}%`;
}
// code editor and preview pane
function adjustEditorScale(delta) {
  editorScale = Math.max(0.7, Math.min(2.2, editorScale + delta));
  applyEditorScale();
}

function resetEditorScale() {
  editorScale = 1;
  applyEditorScale();
}

function applyEditorThemeUI() {
  if (!editorThemeToggleBtn) return;
  editorThemeToggleBtn.textContent = editorDarkMode ? 'Light' : 'Dark';
  editor.classList.toggle('editor-dark', editorDarkMode);
}

function toggleEditorTheme() {
  editorDarkMode = !editorDarkMode;
  applyEditorThemeUI();
}

function applyPreviewScale() {
  renderDiv.style.transform = `scale(${previewScale})`;
  if (previewScaleLabel) previewScaleLabel.textContent = `${Math.round(previewScale * 100)}%`;
}

function adjustPreviewScale(delta) {
  previewScale = Math.max(0.4, Math.min(2.5, previewScale + delta));
  applyPreviewScale();
}

function resetPreviewScale() {
  previewScale = 1;
  applyPreviewScale();
}

function initPreviewWheelZoom() {
  if (!renderWrapper) return;
  renderWrapper.addEventListener('wheel', function (e) {
    if (!e.deltaY) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    adjustPreviewScale(delta);
  }, { passive: false });
}

function applyPreviewThemeUI() {
  if (previewPane) previewPane.classList.toggle('preview-dark', previewDarkMode);
  if (previewThemeToggleBtn) previewThemeToggleBtn.textContent = previewDarkMode ? 'Light' : 'Dark';
}

function applyMermaidPreviewTheme() {
  mermaid.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
    securityLevel: 'loose',
    theme: previewDarkMode ? 'dark' : 'default',
    flowchart: { useMaxWidth: true, htmlLabels: true },
    themeVariables: previewDarkMode ? DARK_MERMAID_THEME_VARIABLES : LIGHT_MERMAID_THEME_VARIABLES
  });
}

function togglePreviewTheme() {
  previewDarkMode = !previewDarkMode;
  applyPreviewThemeUI();
  render();
}

function getMermaidErrorMessage(err, fallback) {
  const raw = err && (err.str || err.message || err.msg || err.description || err.error);
  const text = String(raw || fallback || '').trim();
  return text || 'Unknown Mermaid error';
}

function extractSvgErrorText(svg) {
  try {
    const src = String(svg || '');
    const m = src.match(/<text[^>]*>([\s\S]*?)<\/text>/i);
    if (m && m[1]) return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch (e) {}
  return '';
}

function normalizeMermaidDiagramType(source) {
  const src = String(source || '');
  // Accept both "treeView" and "treeview" and normalize to the beta keyword.
  return src.replace(/(^\s*)(treeview|treeView)(?!-beta)(?=\s|$)/im, '$1treeView-beta');
}

function preprocessMermaidSourceForRender(source) {
  const src = normalizeMermaidDiagramType(source).trim();
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

function polishRenderedMermaidSvg() {
  if (!renderDiv) return;
  const svg = renderDiv.querySelector('svg');
  if (!svg || svg.querySelector('style[data-mdv-mermaid-polish="1"]')) return;
  const lineColor = previewDarkMode ? '#cbd5e1' : '#64748b';
  const textColor = previewDarkMode ? '#e5edf7' : '#334155';
  svg.style.display = 'block';
  svg.style.marginLeft = 'auto';
  svg.style.marginRight = 'auto';
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.setAttribute('data-mdv-mermaid-polish', '1');
  style.textContent = [
    '.node rect,.node polygon,.node circle,.node ellipse{filter:drop-shadow(0 8px 18px rgba(15,23,42,.10));stroke-width:1.4px;}',
    '.node .label,.nodeLabel,.edgeLabel,.label{font-weight:600;letter-spacing:0;}',
    '.edgeLabel{border-radius:8px;color:' + textColor + ';}',
    '.flowchart-link{stroke:' + lineColor + ' !important;stroke-width:1.9px;}',
    'marker path,path.arrowMarkerPath{fill:' + lineColor + ' !important;stroke:' + lineColor + ' !important;}',
    '.cluster rect{stroke-dasharray:0;}'
  ].join('\n');
  svg.insertBefore(style, svg.firstChild);
}

async function render() {
  const code = editor.value.trim();
  const prepared = preprocessMermaidSourceForRender(code);
  const renderCode = String(prepared && prepared.source ? prepared.source : code);
  removeMermaidErrorArtifacts();

  if (!code) {
    renderDiv.innerHTML = '';
    showError('\uCF54\uB4DC\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
    return;
  }

  try {
    applyMermaidPreviewTheme();
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    renderDiv.innerHTML = '';

    const id = 'mermaid-' + Date.now() + '-' + (++renderSeq);
    const { svg } = await mermaid.render(id, renderCode);

    if (isErrorSvg(svg)) {
      renderDiv.innerHTML = '';
      const svgErr = extractSvgErrorText(svg);
      showError('\uB80C\uB354\uB9C1 \uC624\uB958\n[render] ' + (svgErr || 'Mermaid returned an error SVG.'));
      removeMermaidErrorArtifacts();
      return;
    }

    renderDiv.innerHTML = svg;
    restoreSankeyAliasLabels(prepared && prepared.labelMap ? prepared.labelMap : null);
    polishRenderedMermaidSvg();

    // Safety net: Mermaid may still emit an error-like SVG in some versions.
    const renderedText = (renderDiv.textContent || '').toLowerCase();
    const hasInlineErrorIcon = !!renderDiv.querySelector('.error-icon, g.error-icon');
    if (hasInlineErrorIcon || renderedText.includes('syntax error in text')) {
      renderDiv.innerHTML = '';
      showError('\uB80C\uB354\uB9C1 \uC624\uB958\n[render] Mermaid emitted an inline error marker.');
      removeMermaidErrorArtifacts();
      return;
    }

    applyPreviewScale();
    removeMermaidErrorArtifacts();
  } catch (e) {
    // Fallback path: some Mermaid versions fail in render() but succeed in run().
    try {
      renderDiv.innerHTML = '';
      const block = document.createElement('div');
      block.className = 'mermaid';
      block.textContent = renderCode;
      renderDiv.appendChild(block);
      await mermaid.run({ nodes: [block] });
      const renderedText = (renderDiv.textContent || '').toLowerCase();
      const hasInlineErrorIcon = !!renderDiv.querySelector('.error-icon, g.error-icon, svg[aria-roledescription="error"]');
      if (hasInlineErrorIcon || renderedText.includes('syntax error in text')) {
        throw (e || new Error('Mermaid fallback render failed.'));
      }
      restoreSankeyAliasLabels(prepared && prepared.labelMap ? prepared.labelMap : null);
      polishRenderedMermaidSvg();
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
      applyPreviewScale();
      removeMermaidErrorArtifacts();
      return;
    } catch (fallbackErr) {
      renderDiv.innerHTML = '';
      const primary = getMermaidErrorMessage(e, '');
      const secondary = getMermaidErrorMessage(fallbackErr, '');
      const detail = secondary || primary || 'Unknown Mermaid error';
      showError('\uB80C\uB354\uB9C1 \uC624\uB958\n[run] ' + detail + (primary && secondary && primary !== secondary ? '\n[render] ' + primary : ''));
      removeMermaidErrorArtifacts();
    }
  }
}

function isErrorSvg(svg) {
  if (!svg) return false;
  const source = String(svg || '');
  const normalized = source.toLowerCase();
  if (normalized.includes('syntax error in text') || normalized.includes('parse error')) return true;

  // Mermaid valid outputs may contain generic "error-icon" class names in defs/styles.
  // Treat as error only when the root SVG (or contained SVG) explicitly marks error role.
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'image/svg+xml');
    const root = doc && doc.documentElement ? doc.documentElement : null;
    if (!root) return false;
    const role = String(root.getAttribute('aria-roledescription') || '').toLowerCase();
    if (role === 'error') return true;
    const markedErrorSvg = root.querySelector && root.querySelector('svg[aria-roledescription="error"]');
    if (markedErrorSvg) return true;
  } catch (e) {}
  return false;
}

function showError(message) {
  errorDiv.style.display = 'block';
  errorDiv.textContent = message;
}

async function renderWithStartupRecovery() {
  await render();
  if (!errorDiv || errorDiv.style.display !== 'block') return;
  const startupFallback = `%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}}}%%
flowchart LR
  A[Start] --> B[Process]
  B --> C[End]`;
  editor.value = startupFallback;
  await render();
}

function removeMermaidErrorArtifacts() {
  if (!renderDiv) return;
  try {
    const renderedText = String(renderDiv.textContent || '').toLowerCase();
    const hasErrorSvg = !!renderDiv.querySelector('svg[aria-roledescription="error"], .error-icon, g.error-icon');
    if (hasErrorSvg || renderedText.includes('syntax error in text') || renderedText.includes('mermaid version')) {
      renderDiv.innerHTML = '';
    }
  } catch (e) {}
}

function insertSnippet(type) {
  let snippet = '';
  if (type === 'node') {
    snippet = 'A[\uB178\uB4DC]';
  } else if (type === 'decision') {
    const shapeEl = document.getElementById('node-shape');
    const selectedShape = shapeEl ? shapeEl.value : 'diamond';
    const logicShapes = new Set(['diamond', 'hexagon', 'asymmetric']);
    const shape = logicShapes.has(selectedShape) ? selectedShape : 'diamond';
    const nodeId = 'N' + flowNodeSeq++;
    snippet = buildNodeSyntax(shape, nodeId, '\uC870\uAC74', true);
  } else if (type === 'arrow') {
    snippet = 'A --> B';
  }
  if (!snippet) return;

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  const insertText = (before && !before.endsWith('\n') ? '\n' : '') + snippet;
  pushEditorUndoState();
  editor.value = before + insertText + after;
  const caret = (before + insertText).length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  render();
}

function loadTemplate(type) {
  const key = String(type || '').trim();
  if (!key || !EXAMPLE_LIBRARY[key]) return;
  pushEditorUndoState();
  editor.value = String(EXAMPLE_LIBRARY[key] || '');
  render();
}

function buildNodeSyntax(shape, id, label, includeId) {
  const text = String(label || '\uB178\uB4DC');
  const prefix = includeId ? id : '';
  if (shape === 'round') return `${prefix}(${text})`;
  if (shape === 'stadium') return `${prefix}([${text}])`;
  if (shape === 'subroutine') return `${prefix}[[${text}]]`;
  if (shape === 'diamond') return `${prefix}{${text}}`;
  if (shape === 'hexagon') return `${prefix}{{${text}}}`;
  if (shape === 'asymmetric') return `${prefix}>${text}]`;
  if (shape === 'cylinder') return `${prefix}[(${text})]`;
  if (shape === 'parallelogram') return `${prefix}[/${text}/]`;
  if (shape === 'trapezoid') return `${prefix}[/${text}\\]`;
  if (shape === 'circle') return `${prefix}((${text}))`;
  if (shape === 'double-circle') return `${prefix}(((${text})))`;
  return `${prefix}[${text}]`;
}

function onNodeModeChange(mode) {
  const allEl = document.getElementById('node-mode-all');
  const attrEl = document.getElementById('node-mode-attr');
  if (!allEl || !attrEl) return;
  if (mode === 'all' && allEl.checked) attrEl.checked = false;
  if (mode === 'attr' && attrEl.checked) allEl.checked = false;
  if (!allEl.checked && !attrEl.checked) allEl.checked = true;
}

function onEdgeModeChange(mode) {
  const arrowEl = document.getElementById('edge-mode-arrow');
  const arrowLabelEl = document.getElementById('edge-mode-arrow-label');
  const labelOnlyEl = document.getElementById('edge-mode-label-only');
  if (!arrowEl || !arrowLabelEl || !labelOnlyEl) return;

  if (mode === 'arrow' && arrowEl.checked) {
    arrowLabelEl.checked = false;
    labelOnlyEl.checked = false;
  }
  if (mode === 'arrow-label' && arrowLabelEl.checked) {
    arrowEl.checked = false;
    labelOnlyEl.checked = false;
  }
  if (mode === 'label-only' && labelOnlyEl.checked) {
    arrowEl.checked = false;
    arrowLabelEl.checked = false;
  }
  if (!arrowEl.checked && !arrowLabelEl.checked && !labelOnlyEl.checked) arrowEl.checked = true;
}

function insertNodeByShape(mode) {
  const shapeEl = document.getElementById('node-shape');
  const labelEl = document.getElementById('node-label');
  const allEl = document.getElementById('node-mode-all');
  const attrEl = document.getElementById('node-mode-attr');
  const shape = shapeEl ? shapeEl.value : 'rect';
  let insertMode = mode === 'attr' ? 'attr' : (mode === 'all' ? 'all' : '');
  if (!insertMode) insertMode = attrEl && attrEl.checked ? 'attr' : 'all';
  const includeId = insertMode === 'all';
  if (allEl && attrEl && !allEl.checked && !attrEl.checked) allEl.checked = true;
  const label = labelEl && labelEl.value ? labelEl.value.trim() : '';
  const seq = flowNodeSeq;
  const nodeId = 'N' + seq;
  const nodeSyntax = buildNodeSyntax(shape, nodeId, label || ('Node ' + seq), includeId);
  if (includeId) flowNodeSeq += 1;

  const start = editor.selectionStart;
  const before = editor.value.slice(0, start);
  const insertText = (before && !before.endsWith('\n') ? '\n' : '') + '    ' + nodeSyntax;
  pushEditorUndoState();
  editor.value = before + insertText + editor.value.slice(start);
  const caret = (before + insertText).length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  render();
}
// mermaid edge valuew 
function buildEdgeSyntax(type) {
  const edgeType = String(type || 'solid');
  if (edgeType === 'thick') return 'A ==> B';
  if (edgeType === 'dashed') return 'A -.-> B';
  if (edgeType === 'reverse') return 'A <-- B';
  if (edgeType === 'both') return 'A <--> B';
  if (edgeType === 'circle-end') return 'A --o B';
  if (edgeType === 'circle-both') return 'A o--o B';
  if (edgeType === 'x-end') return 'A --x B';
  if (edgeType === 'x-both') return 'A x--x B';
  if (edgeType === 'normal-link') return 'A --- B';
  if (edgeType === 'thick-link') return 'A === B';
  if (edgeType === 'dashed-link') return 'A -.- B';
  if (edgeType === 'invisible-link') return 'A ~~~ B';
  if (edgeType === 'solid-text-static') return 'A -->|condition| B';
  if (edgeType === 'thick-text-static') return 'A == important ==> B';
  if (edgeType === 'dashed-text-static') return 'A -. note .-> B';
  if (edgeType === 'no-arrow-text') return 'A -- text --- B';
  if (edgeType === 'one-to-many') return 'A --> B & C & D';
  if (edgeType === 'many-to-one') return 'B & C & D --> E';
  if (edgeType === 'chaining') return 'A --> B --> C --> D';
  if (edgeType === 'complex-chaining') return 'A --> B & C --> D';
  return 'A --> B';
}

function insertEdgeByType() {
  const edgeEl = document.getElementById('edge-type');
  const edgeLabelEl = document.getElementById('edge-label');
  const arrowEl = document.getElementById('edge-mode-arrow');
  const arrowLabelEl = document.getElementById('edge-mode-arrow-label');
  const labelOnlyEl = document.getElementById('edge-mode-label-only');
  const edgeTypeRaw = edgeEl ? String(edgeEl.value || '').trim() : '';
  const edgeType = edgeTypeRaw || 'solid';
  const edgeLabel = edgeLabelEl && edgeLabelEl.value ? edgeLabelEl.value.trim() : '';
  const baseSnippet = buildEdgeSyntax(edgeType);
  const dynamicLabelTypes = new Set([
    'solid', 'thick', 'dashed', 'reverse', 'both', 'circle-end', 'circle-both',
    'x-end', 'x-both', 'normal-link', 'thick-link', 'dashed-link'
  ]);
  const parts = baseSnippet.split(' ');
  const arrowToken = parts.length >= 3 ? parts[1] : '-->';
  const mode = labelOnlyEl && labelOnlyEl.checked
    ? 'label-only'
    : (arrowLabelEl && arrowLabelEl.checked ? 'arrow-label' : (arrowEl && arrowEl.checked ? 'arrow' : 'arrow'));
  let snippet = '';
  if (mode === 'label-only') {
    snippet = edgeLabel ? `|${edgeLabel}|` : '|value|';
  } else if (mode === 'arrow-label') {
    if (!dynamicLabelTypes.has(edgeType)) {
      snippet = baseSnippet;
    } else {
      const labelText = edgeLabel || 'value';
      snippet = `A ${arrowToken}|${labelText}| B`;
    }
  } else {
    snippet = baseSnippet;
  }
  if (!snippet) return;

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  const insertText = (before && !before.endsWith('\n') ? '\n' : '') + snippet;
  pushEditorUndoState();
  editor.value = before + insertText + after;
  const caret = (before + insertText).length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  render();
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(editor.value);
    alert('\uCF54\uB4DC\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
  } catch {
    alert('\uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
  }
}

function insertIntoDocument() {
  const code = String(editor.value || '').trim();
  if (!code) {
    alert('\uC0BD\uC785\uD560 \uCF54\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.');
    return;
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'mdv-insert-mermaid',
      code: code
    }, '*');
  }
}

function downloadSVG() {
  const svg = renderDiv.querySelector('svg');
  if (!svg) {
    alert('\uB80C\uB354\uB9C1\uB41C SVG\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.');
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

function downloadPNG() {
  const svgEl = renderDiv.querySelector('svg');
  if (!svgEl) {
    alert('\uB80C\uB354\uB9C1\uB41C \uB2E4\uC774\uC5B4\uADF8\uB7A8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.');
    return;
  }
  const svgText = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = function () {
    const w = Math.max(1, Math.ceil(img.width || 1200));
    const h = Math.max(1, Math.ceil(img.height || 800));
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      alert('PNG \uBCC0\uD658\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = 'diagram.png';
    a.click();
    URL.revokeObjectURL(url);
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    alert('PNG \uBCC0\uD658\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
  };
  img.src = url;
}

function getCurrentLineContext(ed) {
  const s = ed.selectionStart;
  const v = ed.value;
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  let le = v.indexOf('\n', s);
  if (le === -1) le = v.length;
  return { ls, le, text: v.substring(ls, le) };
}

function duplicateLine() {
  const ed = editor;
  pushEditorUndoState();
  const s = ed.selectionStart;
  const e = ed.selectionEnd;
  if (s !== e) {
    const sel = ed.value.substring(s, e);
    const insert = '\n' + sel;
    ed.value = ed.value.substring(0, e) + insert + ed.value.substring(e);
    ed.setSelectionRange(e + 1, e + 1 + sel.length);
  } else {
    const c = getCurrentLineContext(ed);
    ed.value = ed.value.substring(0, c.le) + '\n' + c.text + ed.value.substring(c.le);
    const pos = c.le + 1;
    ed.setSelectionRange(pos, pos + c.text.length);
  }
  render();
}

function moveCurrentLine(dir) {
  const ed = editor;
  pushEditorUndoState();
  const v = ed.value;
  const s = ed.selectionStart;
  const e = ed.selectionEnd;
  let blockStart = v.lastIndexOf('\n', s - 1) + 1;
  let blockEnd = v.indexOf('\n', e);
  if (blockEnd === -1) blockEnd = v.length;
  const lines = v.split('\n');
  const startLine = v.substring(0, blockStart).split('\n').length - 1;
  const endLine = v.substring(0, blockEnd).split('\n').length - 1;
  const target = dir < 0 ? startLine - 1 : endLine + 1;
  if (target < 0 || target >= lines.length) return;
  const blockLineCount = endLine - startLine + 1;
  let newStartLine = startLine;

  if (dir < 0) {
    const moved = lines.splice(startLine, endLine - startLine + 1);
    lines.splice(startLine - 1, 0, ...moved);
    newStartLine = startLine - 1;
  } else {
    const moved = lines.splice(startLine, endLine - startLine + 1);
    lines.splice(startLine + 1, 0, ...moved);
    newStartLine = startLine + 1;
  }
  const newEndLine = newStartLine + blockLineCount - 1;
  const newValue = lines.join('\n');
  let newSelStart = 0;
  for (let i = 0; i < newStartLine; i++) newSelStart += lines[i].length + 1;
  let newSelEnd = 0;
  for (let i = 0; i < newEndLine; i++) newSelEnd += lines[i].length + 1;
  newSelEnd += lines[newEndLine].length;

  ed.value = newValue;
  ed.focus();
  ed.setSelectionRange(newSelStart, newSelEnd);
  render();
}

function toggleMermaidComment() {
  const ed = editor;
  pushEditorUndoState();
  const v = ed.value;
  const s = ed.selectionStart;
  const e = ed.selectionEnd;
  const blockStart = v.lastIndexOf('\n', s - 1) + 1;
  let blockEnd = v.indexOf('\n', e);
  if (blockEnd === -1) blockEnd = v.length;

  const block = v.slice(blockStart, blockEnd);
  const lines = block.split('\n');
  const nonEmptyLines = lines.filter(function (line) { return line.trim() !== ''; });
  const allCommented = nonEmptyLines.length > 0 && nonEmptyLines.every(function (line) {
    return /^\s*%%\s?/.test(line);
  });

  const nextLines = lines.map(function (line) {
    if (line.trim() === '') return line;
    if (allCommented) return line.replace(/^(\s*)%%\s?/, '$1');
    return `%% ${line}`;
  });

  const nextBlock = nextLines.join('\n');
  ed.value = v.slice(0, blockStart) + nextBlock + v.slice(blockEnd);
  ed.focus();
  ed.setSelectionRange(blockStart, blockStart + nextBlock.length);
  render();
}

function initPaneDivider() {
  if (!paneDivider) return;
  let dragging = false;
  paneDivider.addEventListener('mousedown', function (e) {
    dragging = true;
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const main = document.getElementById('main');
    if (!main) return;
    const rect = main.getBoundingClientRect();
    const stacked = window.getComputedStyle(main).flexDirection === 'column';
    if (stacked) {
      const y = e.clientY - rect.top;
      const min = 180;
      const max = rect.height - 180 - 10;
      const clamped = Math.max(min, Math.min(max, y));
      const percent = (clamped / rect.height) * 100;
      document.documentElement.style.setProperty('--pane-top', percent + '%');
      return;
    }
    const x = e.clientX - rect.left;
    const min = 260;
    const max = rect.width - 260 - 10;
    const clamped = Math.max(min, Math.min(max, x));
    const percent = (clamped / rect.width) * 100;
    document.documentElement.style.setProperty('--pane-left', percent + '%');
  });
  window.addEventListener('mouseup', function () { dragging = false; });
}

editor.addEventListener('input', debounceRender);
editor.addEventListener('beforeinput', function () {
  pushEditorUndoState();
});

// Shortcut bindings
editor.addEventListener('keydown', function (e) {
  const lines = this.value.split('\n');
  const start = this.selectionStart;
  const beforeCursor = this.value.substring(0, start);
  const lineIdx = beforeCursor.split('\n').length - 1;

  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    if (undoEditorChange()) {
      e.preventDefault();
      return;
    }
  }

  if ((e.ctrlKey && e.altKey && e.key === 'ArrowDown') || (e.altKey && e.shiftKey && e.key === 'ArrowDown')) {
    e.preventDefault();
    duplicateLine();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '/' || e.key === '?' || e.code === 'Slash')) {
    e.preventDefault();
    toggleMermaidComment();
    return;
  }

  if (e.altKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    moveCurrentLine(e.key === 'ArrowUp' ? -1 : 1);
  }
});

initPaneDivider();
initPreviewWheelZoom();
applyEditorThemeUI();
applyEditorScale();
applyPreviewThemeUI();
applyPreviewScale();
renderWithStartupRecovery();
