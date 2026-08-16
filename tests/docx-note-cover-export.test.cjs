const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const JSZip = require('../vendor/jszip/jszip.min.js');
const exporterSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'extendFiles', 'docx-export.js'),
  'utf8'
);
let canvasTextWrites = 0;

function createCanvas() {
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    fillRect() {},
    strokeRect() {},
    setLineDash() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    drawImage() {},
    fillText() { canvasTextWrites += 1; },
    measureText(value) { return { width: String(value || '').length * 10 }; }
  };
  return {
    width: 0,
    height: 0,
    getContext() { return context; },
    toBlob(callback) {
      callback(new Blob([
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ], { type: 'image/png' }));
    }
  };
}

function loadExporter() {
  const window = {
    JSZip,
    Blob,
    URL,
    TextEncoder,
    atob,
    console,
    document: {
      baseURI: 'http://127.0.0.1:8765/',
      createElement(tagName) {
        assert.equal(tagName, 'canvas');
        return createCanvas();
      },
      querySelectorAll() { return []; }
    }
  };
  vm.runInNewContext(exporterSource, {
    window,
    Blob,
    URL,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Map,
    Set,
    Promise,
    console
  });
  return window.DocxExport;
}

function sampleCover() {
  return {
    v: 2,
    enabled: true,
    pageSizeId: 'a4',
    layout: { align: 'center', containerWidthPct: 100 },
    bg: { color: '#ffffff', imagePath: '' },
    rootLayerIds: ['title'],
    elements: [{
      id: 'title',
      type: 'text',
      x: 20,
      y: 40,
      w: 60,
      h: 10,
      text: 'DOCX 표지 제목',
      fontSize: 36,
      fontStyle: 'italic',
      textAlign: 'center',
      color: '#111111'
    }]
  };
}

test('extracts note-cover metadata and removes it from the DOCX body markdown', () => {
  const exporter = loadExporter();
  const markdown = `<!-- note-cover\n${JSON.stringify(sampleCover())}\n-->\n\n# 본문 제목`;
  const extracted = exporter.extractNoteCoverBlocks(markdown);

  assert.equal(extracted.covers.length, 1);
  assert.equal(extracted.covers[0].elements[0].text, 'DOCX 표지 제목');
  assert.match(extracted.markdown, /^# 본문 제목/);
  assert.doesNotMatch(extracted.markdown, /note-cover|DOCX 표지 제목/);
});

test('loads the editable-cover DOCX exporter with a fresh cache key', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(app, /docx-export\.js\?v=20260816-merge-cover-toc-2/);
  assert.match(index, /app\.js\?v=20260811-note-cover-insert-1/);
});

test('writes an editable merge cover and an auto-updating Word TOC field', async () => {
  const exporter = loadExporter();
  const blob = await exporter.createBlob({
    content: '',
    html: '<h1>첫 번째 장</h1><p>본문</p><h2>세부 절</h2>',
    mergeCover: {
      title: '통합 연구 보고서',
      subtitle: '교육정책 자료집',
      author: '홍길동',
      institution: '한국교육연구원',
      date: '2026-08-16'
    },
    includeToc: true
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file('word/document.xml').async('string');
  const settingsXml = await zip.file('word/settings.xml').async('string');
  const relationshipsXml = await zip.file('word/_rels/document.xml.rels').async('string');

  assert.match(documentXml, /통합 연구 보고서/);
  assert.match(documentXml, /교육정책 자료집/);
  assert.match(documentXml, /홍길동/);
  assert.match(documentXml, /한국교육연구원/);
  assert.match(documentXml, /w:fldCharType="begin" w:dirty="true"/);
  assert.match(documentXml, /TOC \\o "1-3" \\h \\z \\u/);
  assert.match(documentXml, /첫 번째 장/);
  assert.match(settingsXml, /w:updateFields w:val="true"/);
  assert.match(relationshipsXml, /Target="settings\.xml"/);
});

test('writes the rendered cover as the first DOCX page and keeps the body', async () => {
  const exporter = loadExporter();
  canvasTextWrites = 0;
  const markdown = `<!-- note-cover\n${JSON.stringify(sampleCover())}\n-->\n\n# 본문 제목\n\n본문 내용`;
  const blob = await exporter.createBlob({ content: markdown, html: '' });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file('word/document.xml').async('string');
  const relationshipsXml = await zip.file('word/_rels/document.xml.rels').async('string');

  assert.ok(zip.file('word/media/cover1.png'));
  assert.match(documentXml, /w:type w:val="nextPage"/);
  assert.match(documentXml, /<wp:anchor[^>]+behindDoc="1"[^>]+allowOverlap="1"/);
  assert.match(documentXml, /<wp:positionH relativeFrom="page"><wp:posOffset>0<\/wp:posOffset>/);
  assert.match(documentXml, /<wp:positionV relativeFrom="page"><wp:posOffset>0<\/wp:posOffset>/);
  assert.match(documentXml, /w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0"/);
  assert.match(documentXml, /<v:rect[^>]+filled="f" stroked="f"/);
  assert.match(documentXml, /<w:txbxContent>/);
  assert.match(documentXml, /<w:t xml:space="preserve">DOCX 표지 제목<\/w:t>/);
  assert.match(documentXml, /<w:sz w:val="54"\/>/);
  assert.match(documentXml, /<w:i\/><w:iCs\/>/);
  assert.match(documentXml, /본문 제목/);
  assert.match(documentXml, /본문 내용/);
  assert.doesNotMatch(documentXml, /note-cover|rootLayerIds/);
  assert.match(relationshipsXml, /Target="media\/cover1\.png"/);
  assert.equal(canvasTextWrites, 0, 'editable cover text must not also be baked into the PNG background');
});
