(function (global) {
  'use strict';

  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function decodeBasicHtmlEntities(value) {
    return String(value == null ? '' : value)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, function (_match, number) {
        var code = Number(number);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#x([0-9a-f]+);/gi, function (_match, number) {
        var code = parseInt(number, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      });
  }

  function stripInlineMarkdown(value) {
    return String(value == null ? '' : value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      .trim();
  }

  function splitMarkdownTableRow(line) {
    var source = String(line == null ? '' : line).trim();
    if (source.charAt(0) === '|') source = source.slice(1);
    if (source.charAt(source.length - 1) === '|') source = source.slice(0, -1);

    var cells = [];
    var current = '';
    var escaped = false;
    var inCode = false;
    for (var index = 0; index < source.length; index += 1) {
      var character = source.charAt(index);
      if (escaped) {
        current += character;
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '`') {
        inCode = !inCode;
        current += character;
      } else if (character === '|' && !inCode) {
        cells.push(current.trim());
        current = '';
      } else {
        current += character;
      }
    }
    if (escaped) current += '\\';
    cells.push(current.trim());
    return cells;
  }

  function isMarkdownTableSeparator(line, expectedColumns) {
    var cells = splitMarkdownTableRow(line);
    if (expectedColumns && cells.length !== expectedColumns) return false;
    return cells.length > 0 && cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(String(cell || '').replace(/\s+/g, ''));
    });
  }

  function cleanMarkdownTableCell(value) {
    return normalizeBlockText(
      decodeBasicHtmlEntities(stripInlineMarkdown(value)),
      true
    );
  }

  function parseMarkdownTable(lines, startIndex) {
    var headerCells = splitMarkdownTableRow(lines[startIndex]);
    if (!headerCells.length ||
        !isMarkdownTableSeparator(lines[startIndex + 1], headerCells.length)) {
      return null;
    }

    var rows = [{
      header: true,
      cells: headerCells.map(function (cell) {
        return {
          text: cleanMarkdownTableCell(cell),
          header: true,
          colSpan: 1,
          rowSpan: 1
        };
      })
    }];
    var index = startIndex + 2;
    while (index < lines.length) {
      var rowLine = String(lines[index] || '');
      if (!rowLine.trim() || rowLine.indexOf('|') < 0) break;
      var cells = splitMarkdownTableRow(rowLine);
      while (cells.length < headerCells.length) cells.push('');
      if (cells.length > headerCells.length) cells = cells.slice(0, headerCells.length);
      rows.push({
        header: false,
        cells: cells.map(function (cell) {
          return {
            text: cleanMarkdownTableCell(cell),
            header: false,
            colSpan: 1,
            rowSpan: 1
          };
        })
      });
      index += 1;
    }

    return {
      item: { type: 'table', rows: rows },
      nextIndex: index
    };
  }

  function getTagName(node) {
    if (!node || node.nodeType !== 1) return '';
    return String(node.tagName || node.nodeName || '').toLowerCase();
  }

  function getChildNodes(node) {
    return node && node.childNodes ? Array.prototype.slice.call(node.childNodes) : [];
  }

  function getChildElements(node, acceptedTags) {
    return getChildNodes(node).filter(function (child) {
      if (!child || child.nodeType !== 1) return false;
      return !acceptedTags || acceptedTags.indexOf(getTagName(child)) >= 0;
    });
  }

  function nodeToPlainText(node) {
    if (!node) return '';
    if (node.nodeType === 3 || node.nodeType === 4) return String(node.nodeValue || '');
    if (node.nodeType !== 1) return '';

    var tag = getTagName(node);
    if (tag === 'br') return '\n';
    if (tag === 'script' || tag === 'style' || tag === 'button') return '';
    if (tag === 'img') {
      return String(node.getAttribute('alt') || node.getAttribute('title') || '');
    }

    var text = getChildNodes(node).map(nodeToPlainText).join('');
    if (/^(p|div|section|article|blockquote|pre|li)$/i.test(tag)) text += '\n';
    return text;
  }

  function normalizeBlockText(value, preserveLines) {
    var text = String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n');
    if (preserveLines) return text.replace(/\n{3,}/g, '\n\n').trim();
    return text.replace(/\s+/g, ' ').trim();
  }

  function readPositiveSpan(cell, attributeName) {
    var value = Number(cell && cell.getAttribute ? cell.getAttribute(attributeName) : 1);
    return Number.isFinite(value) && value > 1 ? Math.floor(value) : 1;
  }

  function tableElementToDocxItem(table) {
    var rowElements = [];
    getChildElements(table).forEach(function (child) {
      var tag = getTagName(child);
      if (tag === 'tr') {
        rowElements.push(child);
      } else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
        rowElements = rowElements.concat(getChildElements(child, ['tr']));
      }
    });

    var rows = rowElements.map(function (row) {
      var cellElements = getChildElements(row, ['th', 'td']);
      var sectionTag = getTagName(row.parentNode);
      var isHeader = sectionTag === 'thead' ||
        (cellElements.length > 0 && cellElements.every(function (cell) {
          return getTagName(cell) === 'th';
        }));
      return {
        header: isHeader,
        cells: cellElements.map(function (cell) {
          return {
            text: normalizeBlockText(nodeToPlainText(cell), true),
            header: isHeader || getTagName(cell) === 'th',
            colSpan: readPositiveSpan(cell, 'colspan'),
            rowSpan: readPositiveSpan(cell, 'rowspan')
          };
        })
      };
    }).filter(function (row) {
      return row.cells.length > 0;
    });

    return rows.length ? { type: 'table', rows: rows } : null;
  }

  function appendDomBlocks(node, items) {
    if (!node) return;
    if (node.nodeType === 3 || node.nodeType === 4) {
      var looseText = normalizeBlockText(node.nodeValue || '', false);
      if (looseText) items.push({ type: 'paragraph', text: looseText });
      return;
    }
    if (node.nodeType !== 1) return;

    var tag = getTagName(node);
    if (tag === 'table') {
      var tableItem = tableElementToDocxItem(node);
      if (tableItem) items.push(tableItem);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      items.push({
        type: 'heading',
        level: Math.min(3, Number(tag.slice(1)) || 1),
        text: normalizeBlockText(nodeToPlainText(node), false)
      });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      getChildElements(node, ['li']).forEach(function (listItem) {
        items.push({
          type: tag === 'ol' ? 'numbered' : 'bullet',
          text: normalizeBlockText(nodeToPlainText(listItem), true)
        });
      });
      return;
    }
    if (tag === 'pre') {
      var codeText = normalizeBlockText(nodeToPlainText(node), true);
      if (codeText) items.push({ type: 'code', text: codeText });
      return;
    }
    if (tag === 'p' || tag === 'blockquote') {
      var paragraphText = normalizeBlockText(nodeToPlainText(node), true);
      if (paragraphText) items.push({ type: 'paragraph', text: paragraphText });
      return;
    }

    var children = getChildElements(node);
    var containsBlock = children.some(function (child) {
      return /^(table|h[1-6]|ul|ol|pre|p|blockquote|div|section|article)$/i.test(getTagName(child));
    });
    if (containsBlock) {
      children.forEach(function (child) {
        appendDomBlocks(child, items);
      });
      return;
    }

    var text = normalizeBlockText(nodeToPlainText(node), true);
    if (text) items.push({ type: 'paragraph', text: text });
  }

  function htmlToDocxItems(html) {
    if (typeof global.DOMParser === 'function') {
      try {
        var documentNode = new global.DOMParser().parseFromString(String(html || ''), 'text/html');
        var body = documentNode && (documentNode.body ||
          (documentNode.getElementsByTagName && documentNode.getElementsByTagName('body')[0]));
        if (body) {
          var domItems = [];
          getChildNodes(body).forEach(function (child) {
            appendDomBlocks(child, domItems);
          });
          if (domItems.length) return domItems;
        }
      } catch (_) {}
    }

    var source = String(html || '');
    source = source
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|blockquote|pre|table|tr|ul|ol)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/h([1-6])>/gi, '\n')
      .replace(/<h([1-6])[^>]*>/gi, '\n__MDPRO_HEADING_$1__')
      .replace(/<[^>]+>/g, '');
    source = decodeBasicHtmlEntities(source).replace(/\r\n?/g, '\n');
    return source.split(/\n+/).map(function (line) {
      var text = line.replace(/\s+/g, ' ').trim();
      if (!text) return null;
      var heading = text.match(/^__MDPRO_HEADING_([1-6])__(.*)$/);
      if (heading) {
        return {
          type: 'heading',
          level: Math.min(3, Number(heading[1]) || 1),
          text: heading[2].trim()
        };
      }
      if (/^[-*]\s+/.test(text)) {
        return { type: 'bullet', text: text.replace(/^[-*]\s+/, '') };
      }
      return { type: 'paragraph', text: text };
    }).filter(Boolean);
  }

  function markdownToDocxItems(markdown) {
    var lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    var items = [];
    var inFence = false;
    var codeLines = [];
    var index = 0;

    function flushCode() {
      if (!codeLines.length) return;
      items.push({ type: 'code', text: codeLines.join('\n') });
      codeLines = [];
    }

    while (index < lines.length) {
      var line = String(lines[index] || '');
      if (/^\s*```/.test(line)) {
        if (inFence) flushCode();
        inFence = !inFence;
        index += 1;
        continue;
      }
      if (inFence) {
        codeLines.push(line);
        index += 1;
        continue;
      }

      var trimmed = line.trim();
      if (!trimmed) {
        index += 1;
        continue;
      }

      if (index + 1 < lines.length && line.indexOf('|') >= 0) {
        var parsedTable = parseMarkdownTable(lines, index);
        if (parsedTable) {
          items.push(parsedTable.item);
          index = parsedTable.nextIndex;
          continue;
        }
      }

      var heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        items.push({
          type: 'heading',
          level: Math.min(3, heading[1].length),
          text: stripInlineMarkdown(heading[2])
        });
        index += 1;
        continue;
      }

      var bullet = trimmed.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        items.push({ type: 'bullet', text: stripInlineMarkdown(bullet[1]) });
        index += 1;
        continue;
      }

      var ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
      if (ordered) {
        items.push({
          type: 'numbered',
          marker: ordered[1] + '. ',
          text: stripInlineMarkdown(ordered[2])
        });
        index += 1;
        continue;
      }

      var paragraphLines = [trimmed];
      index += 1;
      while (index < lines.length) {
        var nextLine = String(lines[index] || '');
        var nextTrimmed = nextLine.trim();
        if (!nextTrimmed ||
            /^\s*```/.test(nextLine) ||
            /^(#{1,6})\s+/.test(nextTrimmed) ||
            /^[-*+]\s+/.test(nextTrimmed) ||
            /^\d+[.)]\s+/.test(nextTrimmed)) {
          break;
        }
        if (index + 1 < lines.length &&
            nextLine.indexOf('|') >= 0 &&
            parseMarkdownTable(lines, index)) {
          break;
        }
        paragraphLines.push(nextTrimmed);
        index += 1;
      }
      items.push({
        type: 'paragraph',
        text: stripInlineMarkdown(paragraphLines.join(' '))
      });
    }

    if (inFence) flushCode();
    return items;
  }

  function makeDocxTextRun(text, isBold) {
    var parts = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var runProperties = isBold ? '<w:rPr><w:b/></w:rPr>' : '';
    var content = parts.map(function (part, index) {
      return (index ? '<w:br/>' : '') +
        '<w:t xml:space="preserve">' + escapeXml(part) + '</w:t>';
    }).join('');
    return '<w:r>' + runProperties + content + '</w:r>';
  }

  function makeDocxParagraph(item) {
    var type = item && item.type ? item.type : 'paragraph';
    var value = item && item.text ? item.text : '';
    var properties = '';
    if (type === 'heading') {
      var level = Math.min(3, Math.max(1, Number(item.level) || 1));
      properties = '<w:pPr><w:pStyle w:val="Heading' + level + '"/></w:pPr>';
    } else if (type === 'bullet') {
      properties = '<w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="720" w:hanging="360"/></w:pPr>';
      value = '- ' + value;
    } else if (type === 'numbered') {
      properties = '<w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="720" w:hanging="360"/></w:pPr>';
      value = String(item.marker || '') + value;
    } else if (type === 'code') {
      properties = '<w:pPr><w:pStyle w:val="NoSpacing"/></w:pPr>';
    }
    return '<w:p>' + properties + makeDocxTextRun(value, false) + '</w:p>';
  }

  function makeDocxCellParagraphs(text, isHeader) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    if (!lines.length) lines = [''];
    return lines.map(function (line) {
      var runProperties = isHeader ? '<w:rPr><w:b/></w:rPr>' : '';
      return '<w:p><w:r>' + runProperties + '<w:t xml:space="preserve">' +
        escapeXml(line) + '</w:t></w:r></w:p>';
    }).join('');
  }

  function makeDocxTable(item) {
    var rows = item && Array.isArray(item.rows) ? item.rows : [];
    var columnCount = rows.reduce(function (maximum, row) {
      var count = (row.cells || []).reduce(function (sum, cell) {
        return sum + Math.max(1, Number(cell.colSpan) || 1);
      }, 0);
      return Math.max(maximum, count);
    }, 1);
    var columnWidth = Math.max(720, Math.floor(9026 / columnCount));
    var grid = new Array(columnCount + 1).join('<w:gridCol w:w="' + columnWidth + '"/>');

    var tableRows = rows.map(function (row) {
      var rowProperties = row.header ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
      var cells = (row.cells || []).map(function (cell) {
        var colSpan = Math.max(1, Number(cell.colSpan) || 1);
        var cellProperties =
          '<w:tcPr>' +
          '<w:tcW w:w="' + (columnWidth * colSpan) + '" w:type="dxa"/>' +
          (colSpan > 1 ? '<w:gridSpan w:val="' + colSpan + '"/>' : '') +
          (cell.header ? '<w:shd w:val="clear" w:color="auto" w:fill="D9EAF7"/>' : '') +
          '<w:vAlign w:val="top"/>' +
          '</w:tcPr>';
        return '<w:tc>' + cellProperties +
          makeDocxCellParagraphs(cell.text, !!cell.header) +
          '</w:tc>';
      }).join('');
      return '<w:tr>' + rowProperties + cells + '</w:tr>';
    }).join('');

    return '<w:tbl>' +
      '<w:tblPr>' +
      '<w:tblW w:w="5000" w:type="pct"/>' +
      '<w:tblLayout w:type="autofit"/>' +
      '<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="6" w:space="0" w:color="7F8C9A"/>' +
      '<w:left w:val="single" w:sz="6" w:space="0" w:color="7F8C9A"/>' +
      '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="7F8C9A"/>' +
      '<w:right w:val="single" w:sz="6" w:space="0" w:color="7F8C9A"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="AAB4BF"/>' +
      '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="AAB4BF"/>' +
      '</w:tblBorders>' +
      '</w:tblPr>' +
      '<w:tblGrid>' + grid + '</w:tblGrid>' +
      tableRows +
      '</w:tbl>';
  }

  function makeDocxBlock(item) {
    return item && item.type === 'table' ? makeDocxTable(item) : makeDocxParagraph(item);
  }

  async function createBlob(payload) {
    if (typeof global.JSZip !== 'function') {
      throw new Error('DOCX export requires JSZip.');
    }

    var data = payload || {};
    var markdown = String(data.content || '');
    var html = String(data.html || '').trim();
    var items = markdownToDocxItems(markdown);
    if (!items.length && html) items = htmlToDocxItems(html);
    if (!items.length) items = [{ type: 'paragraph', text: '' }];

    var documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      items.map(makeDocxBlock).join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';

    var stylesXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="NoSpacing"><w:name w:val="No Spacing"/><w:basedOn w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>' +
      '</w:styles>';

    var zip = new global.JSZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>');
    zip.folder('_rels').file('.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');
    zip.folder('word').file('document.xml', documentXml);
    zip.folder('word').file('styles.xml', stylesXml);
    zip.folder('word').folder('_rels').file('document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');

    return await zip.generateAsync({
      type: 'blob',
      mimeType: DOCX_MIME,
      compression: 'DEFLATE'
    });
  }

  global.DocxExport = Object.freeze({
    createBlob: createBlob,
    mimeType: DOCX_MIME
  });
})(window);
