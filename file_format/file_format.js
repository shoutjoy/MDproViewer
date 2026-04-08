(function (global) {
  'use strict';

  // MdViewer file format runtime + interoperability guide.
  // Other apps can import/copy this file and use:
  // - MdViewerFileFormat.detectPayloadKind(payload)
  // - MdViewerFileFormat.parseJsonText(text)
  // - MdViewerFileFormat.normalizeMddPayload(payload)
  // - MdViewerFileFormat.getPublicDefinitions()

  var FORMAT_REGISTRY = {
    md: {
      id: 'text/markdown',
      aliases: ['markdown'],
      extensions: ['.md', '.markdown'],
      mime: 'text/markdown',
      version: 1,
      required: [],
      optional: [],
      note: 'Plain markdown text document.'
    },
    txt: {
      id: 'text/plain',
      aliases: ['plain-text'],
      extensions: ['.txt'],
      mime: 'text/plain',
      version: 1,
      required: [],
      optional: [],
      note: 'Plain text file.'
    },
    csv: {
      id: 'text/csv',
      aliases: ['comma-separated-values'],
      extensions: ['.csv'],
      mime: 'text/csv',
      version: 1,
      required: [],
      optional: [],
      note: 'CSV tabular text format.'
    },
    html: {
      id: 'text/html',
      aliases: ['html'],
      extensions: ['.html', '.htm'],
      mime: 'text/html',
      version: 1,
      required: [],
      optional: [],
      note: 'HTML document text.'
    },
    json: {
      id: 'application/json',
      aliases: ['json'],
      extensions: ['.json'],
      mime: 'application/json',
      version: 1,
      required: [],
      optional: [],
      note: 'Generic JSON document.'
    },
    zip: {
      id: 'application/zip',
      aliases: ['mdviewer/zip', 'mdviewer-doc-zip'],
      extensions: ['.zip'],
      mime: 'application/zip',
      version: 1,
      required: [],
      optional: [],
      note: 'Zip archive. In this app usually markdown + images bundle.'
    },
    mdd: {
      id: 'mdviewer/mdd',
      aliases: ['mdlive/mdd'],
      extensions: ['.mdd'],
      mime: 'application/json',
      version: 1,
      required: ['format', 'version', 'document'],
      documentRequired: ['content'],
      optional: ['images', 'exportedAt'],
      note: 'Markdown document package with optional embedded images.'
    },
    mpv: {
      id: 'mdviewer/mpv',
      aliases: [],
      extensions: ['.mpv', '.json'],
      mime: 'application/json',
      version: 1,
      required: ['format', 'version', 'folders', 'documents'],
      optional: ['exportedAt'],
      note: 'MD Viewer full backup package.'
    },
    mpp: {
      id: 'genslide-html2pptx-mpp',
      aliases: ['mdviewer/mpp'],
      extensions: ['.mpp', '.json'],
      mime: 'application/json',
      version: 2,
      required: ['format', 'slides'],
      optional: ['version', 'currentIndex', 'images', 'exportedAt'],
      note: 'GenSlide presentation package used by Html2pptx editor.'
    }
  };

  function safeString(value) {
    return value == null ? '' : String(value);
  }

  function normalizeFormatId(value) {
    return safeString(value).trim().toLowerCase();
  }

  function stripBom(text) {
    var raw = safeString(text);
    return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  }

  function parseJsonText(text) {
    return JSON.parse(stripBom(text));
  }

  function getFileExtension(fileName) {
    var name = safeString(fileName).trim().toLowerCase();
    if (!name) return '';
    var idx = name.lastIndexOf('.');
    if (idx < 0) return '';
    return name.slice(idx);
  }

  function getKindsByExtension(ext) {
    var needle = safeString(ext).trim().toLowerCase();
    if (!needle) return [];
    return Object.keys(FORMAT_REGISTRY).filter(function (kind) {
      var info = FORMAT_REGISTRY[kind] || {};
      var arr = Array.isArray(info.extensions) ? info.extensions : [];
      return arr.some(function (x) { return safeString(x).toLowerCase() === needle; });
    });
  }

  function detectKindFromFileName(fileName) {
    var ext = getFileExtension(fileName);
    var kinds = getKindsByExtension(ext);
    if (!kinds.length) return '';
    // .json is intentionally ambiguous, so return generic json unless content says package kind.
    if (ext === '.json') return 'json';
    return kinds[0];
  }

  function getFormatInfo(kind) {
    return FORMAT_REGISTRY[kind] || null;
  }

  function getFormatId(kind) {
    var info = getFormatInfo(kind);
    return info ? info.id : '';
  }

  function getFormatVersion(kind) {
    var info = getFormatInfo(kind);
    return info && typeof info.version === 'number' ? info.version : 1;
  }

  function isKind(payload, kind) {
    var info = getFormatInfo(kind);
    if (!payload || !info || typeof payload !== 'object') return false;
    var id = normalizeFormatId(payload.format);
    if (!id) return false;
    if (id === normalizeFormatId(info.id)) return true;
    return (info.aliases || []).some(function (alias) {
      return id === normalizeFormatId(alias);
    });
  }

  function isMddPayload(payload) {
    if (!isKind(payload, 'mdd')) return false;
    var doc = payload.document;
    return !!(doc && typeof doc === 'object');
  }

  function isMpvPayload(payload) {
    return isKind(payload, 'mpv')
      && Array.isArray(payload.folders)
      && Array.isArray(payload.documents);
  }

  function isMppPayload(payload) {
    return isKind(payload, 'mpp')
      && Array.isArray(payload.slides);
  }

  function detectPayloadKind(payload) {
    if (isMddPayload(payload)) return 'mdd';
    if (isMpvPayload(payload)) return 'mpv';
    if (isMppPayload(payload)) return 'mpp';
    return '';
  }

  function parseCsvRows(text, delimiter) {
    var src = stripBom(text);
    var d = delimiter || ',';
    var rows = [];
    var row = [];
    var cell = '';
    var i = 0;
    var inQuotes = false;
    while (i < src.length) {
      var ch = src[i];
      var next = src[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        if (ch === '"') {
          inQuotes = false;
          i += 1;
          continue;
        }
        cell += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === d) {
        row.push(cell);
        cell = '';
        i += 1;
        continue;
      }
      if (ch === '\r' && next === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 2;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '' || rows.length === 0) rows.push(row);
    return rows;
  }

  function parseFileText(fileName, text, options) {
    var kindByName = detectKindFromFileName(fileName);
    var raw = stripBom(text);
    var opts = options || {};
    var payload = null;
    var kind = kindByName;

    if (kindByName === 'mdd' || kindByName === 'mpv' || kindByName === 'mpp' || kindByName === 'json') {
      try {
        payload = parseJsonText(raw);
        var packageKind = detectPayloadKind(payload);
        kind = packageKind || kindByName || 'json';
      } catch (_) {
        payload = null;
      }
    }

    if (kind === 'csv') {
      return {
        kind: 'csv',
        text: raw,
        table: parseCsvRows(raw, opts.delimiter || ',')
      };
    }
    if (kind === 'html') {
      return {
        kind: 'html',
        text: raw,
        html: raw
      };
    }
    if (kind === 'txt' || kind === 'md') {
      return {
        kind: kind,
        text: raw
      };
    }
    if (kind === 'mdd' || kind === 'mpv' || kind === 'mpp' || kind === 'json') {
      return {
        kind: kind,
        text: raw,
        payload: payload
      };
    }
    return {
      kind: kind || '',
      text: raw
    };
  }

  function normalizeMddPayload(input) {
    var payload = input || {};
    if (typeof payload !== 'object') throw new Error('Invalid MDD payload.');
    if (!isMddPayload(payload)) throw new Error('Invalid MDD format.');

    var formatId = normalizeFormatId(payload.format);
    var doc = payload.document || {};
    var fileName = safeString(doc.fileName || 'document.md').trim() || 'document.md';
    var content = safeString(doc.content);
    var images = Array.isArray(payload.images) ? payload.images : [];

    return {
      format: formatId === normalizeFormatId(getFormatId('mdd')) ? getFormatId('mdd') : safeString(payload.format),
      version: Number(payload.version) || getFormatVersion('mdd'),
      exportedAt: safeString(payload.exportedAt || ''),
      document: {
        fileName: fileName,
        content: content
      },
      images: images
    };
  }

  function getPublicDefinitions() {
    return {
      namespace: 'mdviewer/formats',
      generatedAt: new Date().toISOString(),
      formats: JSON.parse(JSON.stringify(FORMAT_REGISTRY))
    };
  }

  function getUsageGuide() {
    return {
      version: 1,
      quickStart: [
        '1) Read file as UTF-8 text.',
        '2) Detect by extension: const kind = MdViewerFileFormat.detectKindFromFileName(file.name);',
        '3) Parse with helper: const result = MdViewerFileFormat.parseFileText(file.name, text);',
        '4) Branch by result.kind and map into your app model.'
      ],
      byKind: {
        mdd: {
          required: ['format', 'version', 'document.content'],
          readSteps: [
            'Use normalizeMddPayload(payload) for validation/normalization.',
            'Read markdown from normalized.document.content.',
            'If images[] exists, restore using id/path/base64/mime fields.'
          ]
        },
        mpv: {
          required: ['format', 'version', 'folders[]', 'documents[]'],
          readSteps: [
            'Use detectPayloadKind(payload) === "mpv".',
            'Restore folder tree from folders[].',
            'Restore docs from documents[] (title/content/folderId/updatedAt).'
          ]
        },
        mpp: {
          required: ['format', 'slides[]'],
          readSteps: [
            'Use detectPayloadKind(payload) === "mpp".',
            'Render slides[] in your presentation editor.',
            'If images[] exists, restore internal image store first.'
          ]
        },
        csv: {
          required: ['text rows'],
          readSteps: [
            'Use parseFileText(name, text).',
            'Read parsed rows from result.table.',
            'Use result.text to preserve original CSV.'
          ]
        },
        html: {
          required: ['html text'],
          readSteps: [
            'Use parseFileText(name, text).',
            'Read raw HTML from result.html (or result.text).'
          ]
        }
      },
      codeExamples: {
        detectAndRead: [
          "const text = await file.text();",
          "const payload = MdViewerFileFormat.parseJsonText(text);",
          "const kind = MdViewerFileFormat.detectPayloadKind(payload);",
          "if (kind === 'mdd') {",
          "  const doc = MdViewerFileFormat.normalizeMddPayload(payload);",
          "  console.log(doc.document.content);",
          "} else if (kind === 'mpv') {",
          "  console.log(payload.documents);",
          "} else if (kind === 'mpp') {",
          "  console.log(payload.slides);",
          "} else {",
          "  throw new Error('Unsupported format');",
          "}"
        ].join('\n')
      }
    };
  }

  global.MdViewerFileFormat = {
    registry: FORMAT_REGISTRY,
    parseJsonText: parseJsonText,
    getFileExtension: getFileExtension,
    getKindsByExtension: getKindsByExtension,
    detectKindFromFileName: detectKindFromFileName,
    parseCsvRows: parseCsvRows,
    parseFileText: parseFileText,
    stripBom: stripBom,
    getFormatId: getFormatId,
    getFormatVersion: getFormatVersion,
    isKind: isKind,
    isMddPayload: isMddPayload,
    isMpvPayload: isMpvPayload,
    isMppPayload: isMppPayload,
    detectPayloadKind: detectPayloadKind,
    normalizeMddPayload: normalizeMddPayload,
    getPublicDefinitions: getPublicDefinitions,
    getUsageGuide: getUsageGuide
  };
})(window);
