(function (global) {
  'use strict';

  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var NOTE_COVER_BLOCK_RE = /<!--\s*note-cover\b([\s\S]*?)-->/gi;
  var NOTE_COVER_PAGE_SIZES = {
    a3: { width: 297, height: 420, screenWidth: 1123 },
    a4: { width: 210, height: 297, screenWidth: 794 },
    a5: { width: 148, height: 210, screenWidth: 559 },
    letter: { width: 216, height: 279, screenWidth: 816 },
    legal: { width: 216, height: 356, screenWidth: 816 }
  };

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

  function extractNoteCoverBlocks(markdown) {
    var covers = [];
    var errors = [];
    NOTE_COVER_BLOCK_RE.lastIndex = 0;
    var body = String(markdown == null ? '' : markdown).replace(
      NOTE_COVER_BLOCK_RE,
      function (_match, jsonText) {
        try {
          var config = JSON.parse(String(jsonText || '').trim());
          if (config && typeof config === 'object' && !Array.isArray(config) && config.enabled !== false) {
            covers.push(config);
          }
        } catch (error) {
          errors.push(error && error.message ? error.message : String(error || '알 수 없는 오류'));
        }
        return '';
      }
    );
    return {
      covers: covers,
      errors: errors,
      markdown: body.replace(/^\s*\n/, '').replace(/\n{3,}/g, '\n\n')
    };
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

  function parseMarkdownTable(lines, startIndex, references) {
    var headerCells = splitMarkdownTableRow(lines[startIndex]);
    if (!headerCells.length ||
        !isMarkdownTableSeparator(lines[startIndex + 1], headerCells.length)) {
      return null;
    }

    var tableImages = [];
    function collectCellImages(cell) {
      splitMarkdownImages(cell, references).forEach(function (part) {
        if (part.type === 'image') tableImages.push(part);
      });
    }
    headerCells.forEach(collectCellImages);

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
      cells.forEach(collectCellImages);
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
      item: { type: 'table', rows: rows, images: tableImages },
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

  function readPositiveNumber(value) {
    var number = Number(String(value == null ? '' : value).replace(/px$/i, '').trim());
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function makeImageItem(src, alt, width, height) {
    var source = decodeBasicHtmlEntities(String(src == null ? '' : src).trim());
    if (!source) return null;
    return {
      type: 'image',
      src: source,
      alt: normalizeBlockText(decodeBasicHtmlEntities(alt || ''), false),
      width: readPositiveNumber(width),
      height: readPositiveNumber(height)
    };
  }

  function imageElementToDocxItem(image) {
    if (!image || typeof image.getAttribute !== 'function') return null;
    var source = image.getAttribute('src') ||
      image.getAttribute('data-src') ||
      image.getAttribute('data-original-src') || '';
    return makeImageItem(
      source,
      image.getAttribute('alt') || image.getAttribute('title') || '',
      image.getAttribute('width'),
      image.getAttribute('height')
    );
  }

  function appendDomInlineItems(node, items, textItem) {
    var parts = [];

    function walk(current) {
      if (!current) return;
      if (current.nodeType === 3 || current.nodeType === 4) {
        parts.push({ type: 'text', text: String(current.nodeValue || '') });
        return;
      }
      if (current.nodeType !== 1) return;
      var tag = getTagName(current);
      if (tag === 'img') {
        var imageItem = imageElementToDocxItem(current);
        if (imageItem) parts.push(imageItem);
        return;
      }
      if (tag === 'br') {
        parts.push({ type: 'text', text: '\n' });
        return;
      }
      if (tag === 'script' || tag === 'style' || tag === 'button') return;
      getChildNodes(current).forEach(walk);
    }

    walk(node);
    var text = '';
    function flushText() {
      var normalized = normalizeBlockText(text, true);
      if (normalized) items.push(Object.assign({}, textItem || { type: 'paragraph' }, { text: normalized }));
      text = '';
    }
    parts.forEach(function (part) {
      if (part.type === 'image') {
        flushText();
        items.push(part);
      } else {
        text += part.text || '';
      }
    });
    flushText();
  }

  function parseHtmlImageTag(tagSource) {
    var source = String(tagSource || '');
    function attribute(name) {
      var match = source.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
      return match ? (match[1] || match[2] || match[3] || '') : '';
    }
    return makeImageItem(
      attribute('src') || attribute('data-src') || attribute('data-original-src'),
      attribute('alt') || attribute('title'),
      attribute('width'),
      attribute('height')
    );
  }

  function findMarkdownImageEnd(source, openParenIndex) {
    var depth = 0;
    var quote = '';
    var escaped = false;
    for (var index = openParenIndex; index < source.length; index += 1) {
      var character = source.charAt(index);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return -1;
  }

  function parseMarkdownImageTarget(rawTarget) {
    var target = String(rawTarget || '').trim();
    if (!target) return '';
    if (target.charAt(0) === '<') {
      var close = target.indexOf('>');
      return close > 0 ? target.slice(1, close).trim() : '';
    }
    var quoteIndex = -1;
    var escaped = false;
    var depth = 0;
    for (var index = 0; index < target.length; index += 1) {
      var character = target.charAt(index);
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')' && depth > 0) {
        depth -= 1;
      } else if (/\s/.test(character) && depth === 0) {
        quoteIndex = index;
        break;
      }
    }
    return (quoteIndex >= 0 ? target.slice(0, quoteIndex) : target)
      .replace(/\\([()\\])/g, '$1')
      .trim();
  }

  function splitMarkdownImages(value, references) {
    var source = String(value == null ? '' : value);
    var parts = [];
    var cursor = 0;
    var index = 0;

    function pushText(end) {
      if (end > cursor) parts.push({ type: 'text', text: source.slice(cursor, end) });
    }

    while (index < source.length) {
      var markdownStart = source.indexOf('![', index);
      var htmlMatch = /<img\b[^>]*>/i.exec(source.slice(index));
      var htmlStart = htmlMatch ? index + htmlMatch.index : -1;
      var start;
      var kind;
      if (markdownStart < 0 || (htmlStart >= 0 && htmlStart < markdownStart)) {
        start = htmlStart;
        kind = 'html';
      } else {
        start = markdownStart;
        kind = 'markdown';
      }
      if (start < 0) break;

      if (kind === 'html') {
        var tag = htmlMatch[0];
        var htmlImage = parseHtmlImageTag(tag);
        if (htmlImage) {
          pushText(start);
          parts.push(htmlImage);
          cursor = start + tag.length;
        }
        index = start + Math.max(1, tag.length);
        continue;
      }

      var altEnd = source.indexOf(']', start + 2);
      if (altEnd < 0) {
        index = start + 2;
        continue;
      }
      var alt = source.slice(start + 2, altEnd);
      var image = null;
      var end = -1;
      if (source.charAt(altEnd + 1) === '(') {
        end = findMarkdownImageEnd(source, altEnd + 1);
        if (end >= 0) {
          image = makeImageItem(
            parseMarkdownImageTarget(source.slice(altEnd + 2, end)),
            stripInlineMarkdown(alt)
          );
        }
      } else if (source.charAt(altEnd + 1) === '[') {
        var refEnd = source.indexOf(']', altEnd + 2);
        if (refEnd >= 0) {
          var refName = source.slice(altEnd + 2, refEnd) || alt;
          var refTarget = references && references[String(refName).trim().toLowerCase()];
          if (refTarget) image = makeImageItem(refTarget, stripInlineMarkdown(alt));
          end = refEnd;
        }
      }
      if (!image) {
        index = start + 2;
        continue;
      }
      pushText(start);
      parts.push(image);
      cursor = end + 1;
      index = cursor;
    }
    pushText(source.length);
    return parts;
  }

  function appendMarkdownTextAndImages(value, items, textItem, references) {
    var parts = splitMarkdownImages(value, references);
    var foundImage = parts.some(function (part) { return part.type === 'image'; });
    if (!foundImage) {
      var textOnly = stripInlineMarkdown(value);
      if (textOnly) items.push(Object.assign({}, textItem || { type: 'paragraph' }, { text: textOnly }));
      return;
    }
    parts.forEach(function (part) {
      if (part.type === 'image') {
        items.push(part);
        return;
      }
      var text = stripInlineMarkdown(part.text);
      if (text) items.push(Object.assign({}, textItem || { type: 'paragraph' }, { text: text }));
    });
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

    var images = [];
    if (table && typeof table.querySelectorAll === 'function') {
      Array.prototype.slice.call(table.querySelectorAll('img')).forEach(function (image) {
        var item = imageElementToDocxItem(image);
        if (item) images.push(item);
      });
    }
    return rows.length ? { type: 'table', rows: rows, images: images } : null;
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
    if (tag === 'img') {
      var imageItem = imageElementToDocxItem(node);
      if (imageItem) items.push(imageItem);
      return;
    }
    if (tag === 'table') {
      var tableItem = tableElementToDocxItem(node);
      if (tableItem) {
        items.push(tableItem);
        (tableItem.images || []).forEach(function (image) { items.push(image); });
      }
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      appendDomInlineItems(node, items, {
        type: 'heading',
        level: Math.min(3, Number(tag.slice(1)) || 1)
      });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      getChildElements(node, ['li']).forEach(function (listItem) {
        appendDomInlineItems(listItem, items, {
          type: tag === 'ol' ? 'numbered' : 'bullet',
          marker: tag === 'ol' ? '1. ' : ''
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
      appendDomInlineItems(node, items, { type: 'paragraph' });
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
    var references = {};
    var inFence = false;
    var codeLines = [];
    var index = 0;

    lines.forEach(function (line) {
      var definition = String(line || '').match(/^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+.*)?$/);
      if (!definition) return;
      references[String(definition[1] || '').trim().toLowerCase()] = definition[2] || definition[3] || '';
    });

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
      if (/^\s{0,3}\[[^\]]+\]:\s*/.test(line)) {
        index += 1;
        continue;
      }

      if (index + 1 < lines.length && line.indexOf('|') >= 0) {
        var parsedTable = parseMarkdownTable(lines, index, references);
        if (parsedTable) {
          items.push(parsedTable.item);
          (parsedTable.item.images || []).forEach(function (image) { items.push(image); });
          index = parsedTable.nextIndex;
          continue;
        }
      }

      var heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        appendMarkdownTextAndImages(heading[2], items, {
          type: 'heading',
          level: Math.min(3, heading[1].length)
        }, references);
        index += 1;
        continue;
      }

      var bullet = trimmed.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        appendMarkdownTextAndImages(bullet[1], items, { type: 'bullet' }, references);
        index += 1;
        continue;
      }

      var ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
      if (ordered) {
        appendMarkdownTextAndImages(ordered[2], items, {
          type: 'numbered',
          marker: ordered[1] + '. '
        }, references);
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
            parseMarkdownTable(lines, index, references)) {
          break;
        }
        paragraphLines.push(nextTrimmed);
        index += 1;
      }
      appendMarkdownTextAndImages(
        paragraphLines.join(' '),
        items,
        { type: 'paragraph' },
        references
      );
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

  function dataUrlToBlob(dataUrl) {
    var raw = String(dataUrl || '');
    var match = raw.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/i);
    if (!match) throw new Error('Invalid image data URL.');
    var mime = match[1] || 'application/octet-stream';
    var bytes;
    if (match[2]) {
      var binary = global.atob(match[3].replace(/\s+/g, ''));
      bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    } else {
      var decoded = decodeURIComponent(match[3]);
      bytes = new TextEncoder().encode(decoded);
    }
    return new Blob([bytes], { type: mime });
  }

  function normalizeResolvedBlob(value) {
    if (!value) return null;
    var candidate = value.blob || value.data || value;
    if (typeof candidate === 'string' && /^data:/i.test(candidate)) {
      return { blob: dataUrlToBlob(candidate), width: value.width, height: value.height };
    }
    if (typeof global.Blob === 'function' && candidate instanceof global.Blob) {
      return { blob: candidate, width: value.width, height: value.height };
    }
    if (candidate instanceof ArrayBuffer || ArrayBuffer.isView(candidate)) {
      return {
        blob: new Blob([candidate], { type: value.mime || value.type || 'application/octet-stream' }),
        width: value.width,
        height: value.height
      };
    }
    return null;
  }

  function resolveImageUrl(src, baseUrl) {
    var source = String(src || '').trim();
    if (!source || /^(data:|blob:|internal:)/i.test(source)) return source;
    try {
      return new URL(source, baseUrl || (global.document && global.document.baseURI) || undefined).href;
    } catch (_) {
      return source;
    }
  }

  function findRenderedImageElement(src, baseUrl) {
    if (!global.document || typeof global.document.querySelectorAll !== 'function') return null;
    var source = String(src || '').trim();
    var resolved = resolveImageUrl(source, baseUrl);
    var internalId = '';
    if (/^internal:\/\//i.test(source)) {
      try { internalId = decodeURIComponent(source.replace(/^internal:\/\//i, '')); } catch (_) {}
    }
    var images = global.document.querySelectorAll('img');
    for (var index = 0; index < images.length; index += 1) {
      var image = images[index];
      var candidates = [
        image.getAttribute('src'),
        image.getAttribute('data-src'),
        image.getAttribute('data-original-src'),
        image.currentSrc,
        image.src
      ].filter(Boolean);
      if (internalId && String(image.getAttribute('data-internal-id') || '') === internalId) return image;
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        var candidate = String(candidates[candidateIndex] || '').trim();
        if (candidate === source || candidate === resolved || resolveImageUrl(candidate, baseUrl) === resolved) {
          return image;
        }
      }
    }
    return null;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas && typeof canvas.toBlob === 'function') {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Canvas image capture failed.'));
        }, 'image/png');
        return;
      }
      try {
        resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
      } catch (error) {
        reject(error);
      }
    });
  }

  async function captureRenderedImage(image) {
    if (!image || !global.document || typeof global.document.createElement !== 'function') return null;
    var width = Number(image.naturalWidth || image.width || 0);
    var height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) return null;
    var scale = Math.min(1, 2400 / Math.max(width, height));
    var canvas = global.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    var context = canvas.getContext && canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      blob: await canvasToBlob(canvas),
      width: width,
      height: height
    };
  }

  async function fetchImageBlob(src) {
    if (typeof global.fetch !== 'function') return null;
    var response = await global.fetch(src, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache'
    });
    if (!response.ok) throw new Error('Image download failed (HTTP ' + response.status + ').');
    var blob = await response.blob();
    if (!blob || !blob.size) throw new Error('Downloaded image is empty.');
    if (blob.size > 30 * 1024 * 1024) throw new Error('Image is larger than 30 MB.');
    return { blob: blob };
  }

  function makeLocalImageProxyUrl(src) {
    if (!/^https?:\/\//i.test(String(src || '')) || !global.location) return '';
    var host = String(global.location.hostname || '').toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return '';
    try {
      var proxy = new URL('/__mdviewer_image_proxy', global.location.href);
      proxy.searchParams.set('url', src);
      return proxy.href;
    } catch (_) {
      return '';
    }
  }

  async function resolveImageBlob(item, payload) {
    var data = payload || {};
    var source = String(item && item.src || '').trim();
    if (!source) return null;

    if (typeof data.resolveImage === 'function') {
      try {
        var custom = normalizeResolvedBlob(await data.resolveImage(source, item));
        if (custom && custom.blob && custom.blob.size) return custom;
      } catch (_) {}
    }

    if (/^data:/i.test(source)) return { blob: dataUrlToBlob(source) };
    var baseUrl = data.baseUrl || (global.document && global.document.baseURI) || '';
    var resolvedSource = resolveImageUrl(source, baseUrl);
    var renderedImage = findRenderedImageElement(source, baseUrl);
    var candidates = [resolvedSource];
    if (renderedImage) {
      var renderedSource = renderedImage.currentSrc || renderedImage.src || renderedImage.getAttribute('src') || '';
      if (renderedSource && candidates.indexOf(renderedSource) < 0) candidates.unshift(renderedSource);
    }

    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      if (!candidate || /^internal:/i.test(candidate)) continue;
      try {
        var downloaded = await fetchImageBlob(candidate);
        if (downloaded) return downloaded;
      } catch (_) {}
    }

    var proxyUrl = makeLocalImageProxyUrl(resolvedSource);
    if (proxyUrl) {
      try {
        var proxied = await fetchImageBlob(proxyUrl);
        if (proxied) return proxied;
      } catch (_) {}
    }

    if (renderedImage) {
      try {
        var captured = await captureRenderedImage(renderedImage);
        if (captured) return captured;
      } catch (_) {}
    }
    throw new Error('Image could not be downloaded or captured: ' + source);
  }

  function sniffImageMime(bytes, fallback) {
    var type = String(fallback || '').toLowerCase().split(';')[0].trim();
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 6 && String.fromCharCode.apply(null, bytes.slice(0, 6)) === 'GIF89a') return 'image/gif';
    if (bytes.length >= 6 && String.fromCharCode.apply(null, bytes.slice(0, 6)) === 'GIF87a') return 'image/gif';
    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
    return type || 'application/octet-stream';
  }

  function parseImageDimensions(bytes, mime) {
    if (mime === 'image/png' && bytes.length >= 24) {
      return {
        width: ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0,
        height: ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0
      };
    }
    if (mime === 'image/gif' && bytes.length >= 10) {
      return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
    }
    if (mime === 'image/jpeg') {
      var offset = 2;
      while (offset + 8 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        var marker = bytes[offset + 1];
        var length = (bytes[offset + 2] << 8) + bytes[offset + 3];
        if (length < 2) break;
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return {
            height: (bytes[offset + 5] << 8) + bytes[offset + 6],
            width: (bytes[offset + 7] << 8) + bytes[offset + 8]
          };
        }
        offset += 2 + length;
      }
    }
    return { width: 0, height: 0 };
  }

  function loadImageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      if (typeof global.Image !== 'function' || !global.URL || typeof global.URL.createObjectURL !== 'function') {
        reject(new Error('Browser image decoder is unavailable.'));
        return;
      }
      var url = global.URL.createObjectURL(blob);
      var image = new global.Image();
      image.onload = function () {
        global.URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        global.URL.revokeObjectURL(url);
        reject(new Error('Image decoding failed.'));
      };
      image.src = url;
    });
  }

  function readCoverNumber(value, fallback, minimum, maximum) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    if (Number.isFinite(minimum)) number = Math.max(minimum, number);
    if (Number.isFinite(maximum)) number = Math.min(maximum, number);
    return number;
  }

  function getNoteCoverPageSize(config) {
    var id = String(config && config.pageSizeId || 'a4').toLowerCase();
    var size = NOTE_COVER_PAGE_SIZES[id] || NOTE_COVER_PAGE_SIZES.a4;
    return { id: id, width: size.width, height: size.height, screenWidth: size.screenWidth };
  }

  function getNoteCoverElements(config) {
    if (global.NoteCoverRenderer && typeof global.NoteCoverRenderer.collectLayerElements === 'function') {
      return global.NoteCoverRenderer.collectLayerElements(config);
    }
    var elements = Array.isArray(config && config.elements) ? config.elements.filter(function (item) {
      return item && typeof item === 'object' && item.id;
    }) : [];
    var groups = Array.isArray(config && config.groups) ? config.groups : [];
    var elementMap = new Map();
    var groupMap = new Map();
    var output = [];
    var visited = new Set();
    elements.forEach(function (item) { elementMap.set(String(item.id), item); });
    groups.forEach(function (item) {
      if (item && item.id) groupMap.set(String(item.id), item);
    });
    function walk(id) {
      var key = String(id || '');
      if (!key || visited.has(key)) return;
      visited.add(key);
      if (elementMap.has(key)) {
        output.push(elementMap.get(key));
        return;
      }
      var group = groupMap.get(key);
      if (group && Array.isArray(group.childIds)) group.childIds.forEach(walk);
    }
    var roots = Array.isArray(config && config.rootLayerIds) && config.rootLayerIds.length
      ? config.rootLayerIds
      : elements.map(function (item) { return item.id; });
    roots.forEach(walk);
    elements.forEach(function (item) {
      if (!visited.has(String(item.id))) output.push(item);
    });
    return output;
  }

  function getEditableNoteCoverTextElements(config, pageSize) {
    var layout = config && config.layout && typeof config.layout === 'object' ? config.layout : {};
    var align = /^(?:left|center|right)$/.test(String(layout.align || '').toLowerCase())
      ? String(layout.align).toLowerCase()
      : 'center';
    var containerWidthPct = readCoverNumber(layout.containerWidthPct, 100, 10, 100);
    var pageWidthPt = pageSize.width / 25.4 * 72;
    var pageHeightPt = pageSize.height / 25.4 * 72;
    var containerWidthPt = pageWidthPt * containerWidthPct / 100;
    var containerLeftPt = align === 'center'
      ? (pageWidthPt - containerWidthPt) / 2
      : (align === 'right' ? pageWidthPt - containerWidthPt : 0);
    var fontScale = containerWidthPt / pageSize.screenWidth;
    return getNoteCoverElements(config).map(function (element, index) {
      if (String(element && element.type || '').toLowerCase() !== 'text') return null;
      return {
        id: String(element.id || ('text-' + index)),
        text: String(element.text || ''),
        xPt: containerLeftPt + containerWidthPt * readCoverNumber(element.x, 0, -1000, 1000) / 100,
        yPt: pageHeightPt * readCoverNumber(element.y, 0, -1000, 1000) / 100,
        widthPt: containerWidthPt * readCoverNumber(element.w, 10, 0, 2000) / 100,
        heightPt: pageHeightPt * readCoverNumber(element.h, 10, 0, 2000) / 100,
        rotation: readCoverNumber(element.rotation, 0, -3600, 3600),
        fontSizePt: readCoverNumber(element.fontSize, 16, 4, 600) * fontScale,
        fontFamily: String(element.fontFamily || '').replace(/[;{}<>]/g, '').trim() || 'Arial',
        fontWeight: String(element.fontWeight == null ? 400 : element.fontWeight).trim(),
        fontStyle: String(element.fontStyle || '').toLowerCase() === 'italic' ? 'italic' : 'normal',
        textAlign: String(element.textAlign || 'left').toLowerCase(),
        color: String(element.color || '#111111'),
        zIndex: index + 2
      };
    }).filter(Boolean);
  }

  function getCoverImageSource(value) {
    var source = String(value || '').trim();
    if (!source) return '';
    if (/^(?:https?:|blob:|internal:\/\/)/i.test(source)) return source;
    if (/^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,/i.test(source)) return source;
    if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return '';
    return source;
  }

  function getCoverColor(value, fallback) {
    var color = String(value || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(color) ||
        /^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s+-]+\)$/i.test(color) ||
        /^[a-z]{3,24}$/i.test(color)) return color;
    return fallback || '#ffffff';
  }

  function drawImageCover(context, image, x, y, width, height) {
    var imageWidth = Number(image.naturalWidth || image.width || 0);
    var imageHeight = Number(image.naturalHeight || image.height || 0);
    if (!imageWidth || !imageHeight || !width || !height) return;
    var scale = Math.max(width / imageWidth, height / imageHeight);
    var sourceWidth = width / scale;
    var sourceHeight = height / scale;
    var sourceX = (imageWidth - sourceWidth) / 2;
    var sourceY = (imageHeight - sourceHeight) / 2;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  function drawImageContain(context, image, x, y, width, height) {
    var imageWidth = Number(image.naturalWidth || image.width || 0);
    var imageHeight = Number(image.naturalHeight || image.height || 0);
    if (!imageWidth || !imageHeight || !width || !height) return;
    var scale = Math.min(width / imageWidth, height / imageHeight);
    var targetWidth = imageWidth * scale;
    var targetHeight = imageHeight * scale;
    context.drawImage(
      image,
      x + (width - targetWidth) / 2,
      y + (height - targetHeight) / 2,
      targetWidth,
      targetHeight
    );
  }

  function wrapCoverText(context, value, maximumWidth) {
    var output = [];
    String(value == null ? '' : value).replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
      if (!line) {
        output.push('');
        return;
      }
      var words = line.split(/(\s+)/).filter(Boolean);
      var current = '';
      words.forEach(function (word) {
        var candidate = current + word;
        if (current && !/^\s+$/.test(word) && context.measureText(candidate).width > maximumWidth) {
          output.push(current.trimEnd());
          current = word.replace(/^\s+/, '');
        } else {
          current = candidate;
        }
      });
      output.push(current.trimEnd());
    });
    return output;
  }

  async function loadCoverImage(source, alt, payload) {
    var resolved = await resolveImageBlob({ src: source, alt: alt || '' }, payload);
    if (!resolved || !resolved.blob) throw new Error('Cover image data is missing.');
    return loadImageFromBlob(resolved.blob);
  }

  async function renderNoteCoverToPng(config, payload, options) {
    if (!global.document || typeof global.document.createElement !== 'function') {
      throw new Error('표지 이미지 렌더링을 위한 Canvas를 사용할 수 없습니다.');
    }
    if (global.document.fonts && global.document.fonts.ready) {
      try { await global.document.fonts.ready; } catch (_) {}
    }
    var pageSize = getNoteCoverPageSize(config);
    var renderOptions = options || {};
    var dpi = 144;
    var canvas = global.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(pageSize.width / 25.4 * dpi));
    canvas.height = Math.max(1, Math.round(pageSize.height / 25.4 * dpi));
    var context = canvas.getContext && canvas.getContext('2d');
    if (!context) throw new Error('표지 이미지 Canvas를 초기화할 수 없습니다.');

    var background = config && config.bg && typeof config.bg === 'object' ? config.bg : {};
    context.fillStyle = getCoverColor(background.color, '#ffffff');
    context.fillRect(0, 0, canvas.width, canvas.height);
    var backgroundSource = getCoverImageSource(background.imagePath || '');
    if (backgroundSource) {
      try {
        drawImageCover(context, await loadCoverImage(backgroundSource, '표지 배경', payload), 0, 0, canvas.width, canvas.height);
      } catch (error) {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('[DOCX export] 표지 배경 이미지를 불러오지 못했습니다.', error);
        }
      }
    }

    var layout = config && config.layout && typeof config.layout === 'object' ? config.layout : {};
    var align = /^(?:left|center|right)$/.test(String(layout.align || '').toLowerCase())
      ? String(layout.align).toLowerCase()
      : 'center';
    var containerWidthPct = readCoverNumber(layout.containerWidthPct, 100, 10, 100);
    var containerWidth = canvas.width * containerWidthPct / 100;
    var containerLeft = align === 'center'
      ? (canvas.width - containerWidth) / 2
      : (align === 'right' ? canvas.width - containerWidth : 0);
    var fontScale = containerWidth / pageSize.screenWidth;

    var elements = getNoteCoverElements(config);
    for (var index = 0; index < elements.length; index += 1) {
      var element = elements[index] || {};
      var x = containerLeft + containerWidth * readCoverNumber(element.x, 0, -1000, 1000) / 100;
      var y = canvas.height * readCoverNumber(element.y, 0, -1000, 1000) / 100;
      var width = containerWidth * readCoverNumber(element.w, 10, 0, 2000) / 100;
      var height = canvas.height * readCoverNumber(element.h, 10, 0, 2000) / 100;
      var rotation = readCoverNumber(element.rotation, 0, -3600, 3600) * Math.PI / 180;
      context.save();
      context.globalAlpha = readCoverNumber(element.opacity, 1, 0, 1);
      context.translate(x + width / 2, y + height / 2);
      if (rotation) context.rotate(rotation);
      var localX = -width / 2;
      var localY = -height / 2;
      var type = String(element.type || '').toLowerCase();
      if (type === 'text' && renderOptions.omitText === true) {
        context.restore();
        continue;
      }
      if (type === 'image') {
        var imageSource = getCoverImageSource(element.path || element.src || '');
        try {
          if (!imageSource) throw new Error('이미지 경로 없음');
          drawImageContain(
            context,
            await loadCoverImage(imageSource, element.name || '표지 이미지', payload),
            localX,
            localY,
            width,
            height
          );
        } catch (_) {
          context.fillStyle = '#f8fafc';
          context.strokeStyle = '#cbd5e1';
          context.lineWidth = Math.max(1, canvas.width / 800);
          context.setLineDash([8, 6]);
          context.fillRect(localX, localY, width, height);
          context.strokeRect(localX, localY, width, height);
          context.setLineDash([]);
          context.fillStyle = '#64748b';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.font = Math.max(12, 12 * fontScale) + 'px sans-serif';
          context.fillText(String(element.name || '표지 이미지'), 0, 0, Math.max(1, width - 12));
        }
      } else if (type === 'text') {
        var fontSize = readCoverNumber(element.fontSize, 16, 4, 600) * fontScale;
        var family = String(element.fontFamily || '').replace(/[;{}<>]/g, '').trim() || 'Arial, sans-serif';
        var weight = String(element.fontWeight == null ? 400 : element.fontWeight).trim();
        if (!/^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(weight)) weight = '400';
        var fontStyle = String(element.fontStyle || '').toLowerCase() === 'italic' ? 'italic' : 'normal';
        var textAlign = /^(?:left|center|right)$/.test(String(element.textAlign || '').toLowerCase())
          ? String(element.textAlign).toLowerCase()
          : 'left';
        context.fillStyle = getCoverColor(element.color, '#111111');
        context.font = fontStyle + ' ' + weight + ' ' + fontSize + 'px ' + family;
        context.textAlign = textAlign;
        context.textBaseline = 'top';
        var textX = textAlign === 'center' ? 0 : (textAlign === 'right' ? width / 2 : localX);
        var lines = wrapCoverText(context, element.text || '', Math.max(1, width));
        var lineHeight = fontSize * 1.15;
        lines.forEach(function (line, lineIndex) {
          context.fillText(line, textX, localY + lineIndex * lineHeight);
        });
      }
      context.restore();
    }

    return {
      blob: await canvasToBlob(canvas),
      width: canvas.width,
      height: canvas.height,
      pageSize: pageSize
    };
  }

  async function prepareNoteCoverAsset(item, payload, index) {
    var config = item.config || {};
    var rendered = await renderNoteCoverToPng(config, payload, { omitText: true });
    var bytes = new Uint8Array(await rendered.blob.arrayBuffer());
    var pageSize = rendered.pageSize || NOTE_COVER_PAGE_SIZES.a4;
    return {
      blob: rendered.blob,
      bytes: bytes,
      mime: 'image/png',
      extension: 'png',
      fileName: 'cover' + index + '.png',
      widthEmu: Math.round(pageSize.width / 25.4 * 914400),
      heightEmu: Math.round(pageSize.height / 25.4 * 914400),
      pageWidthTwips: Math.round(pageSize.width / 25.4 * 1440),
      pageHeightTwips: Math.round(pageSize.height / 25.4 * 1440),
      editableTextElements: getEditableNoteCoverTextElements(config, pageSize),
      alt: '문서 표지',
      source: 'note-cover'
    };
  }

  async function rasterizeToPng(blob) {
    var image = await loadImageFromBlob(blob);
    var width = Number(image.naturalWidth || image.width || 0);
    var height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) throw new Error('Image dimensions are invalid.');
    var scale = Math.min(1, 2400 / Math.max(width, height));
    var canvas = global.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { blob: await canvasToBlob(canvas), width: width, height: height };
  }

  async function prepareImageAsset(item, payload, index) {
    var resolved = await resolveImageBlob(item, payload);
    var blob = resolved && resolved.blob;
    if (!blob) throw new Error('Image data is missing.');
    var bytes = new Uint8Array(await blob.arrayBuffer());
    var mime = sniffImageMime(bytes, blob.type);
    var dimensions = parseImageDimensions(bytes, mime);
    var width = readPositiveNumber(item.width) || readPositiveNumber(resolved.width) || dimensions.width;
    var height = readPositiveNumber(item.height) || readPositiveNumber(resolved.height) || dimensions.height;
    var extension = mime === 'image/png' ? 'png' :
      mime === 'image/jpeg' ? 'jpg' :
      mime === 'image/gif' ? 'gif' :
      mime === 'image/bmp' ? 'bmp' : '';

    if (!extension) {
      var rasterized = await rasterizeToPng(blob);
      blob = rasterized.blob;
      bytes = new Uint8Array(await blob.arrayBuffer());
      mime = 'image/png';
      extension = 'png';
      width = width || rasterized.width;
      height = height || rasterized.height;
    }

    if (!width || !height) {
      try {
        var decoded = await loadImageFromBlob(blob);
        width = width || Number(decoded.naturalWidth || decoded.width || 0);
        height = height || Number(decoded.naturalHeight || decoded.height || 0);
      } catch (_) {}
    }
    width = width || 640;
    height = height || 360;

    var widthEmu = Math.round(width * 9525);
    var heightEmu = Math.round(height * 9525);
    var scale = Math.min(1, (6.1 * 914400) / widthEmu, (8.5 * 914400) / heightEmu);
    widthEmu = Math.max(1, Math.round(widthEmu * scale));
    heightEmu = Math.max(1, Math.round(heightEmu * scale));
    return {
      blob: blob,
      bytes: bytes,
      mime: mime,
      extension: extension,
      fileName: 'image' + index + '.' + extension,
      widthEmu: widthEmu,
      heightEmu: heightEmu,
      alt: item.alt || '',
      source: item.src || ''
    };
  }

  function makeDocxDrawingRun(item) {
    var id = Math.max(1, Number(item.drawingId) || 1);
    var relationshipId = escapeXml(item.relationshipId || '');
    var name = escapeXml(item.fileName || ('Image ' + id));
    var description = escapeXml(item.alt || '');
    var width = Math.max(1, Number(item.widthEmu) || 1);
    var height = Math.max(1, Number(item.heightEmu) || 1);
    return '<w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + width + '" cy="' + height + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="' + name + '" descr="' + description + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '" descr="' + description + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + relationshipId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + width + '" cy="' + height + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }

  function makeDocxImageParagraph(item) {
    return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' + makeDocxDrawingRun(item) + '</w:p>';
  }

  function makeDocxCoverDrawingRun(item) {
    var id = Math.max(1, Number(item.drawingId) || 1);
    var relationshipId = escapeXml(item.relationshipId || '');
    var name = escapeXml(item.fileName || ('Cover ' + id));
    var description = escapeXml(item.alt || '문서 표지');
    var width = Math.max(1, Number(item.widthEmu) || 1);
    var height = Math.max(1, Number(item.heightEmu) || 1);
    return '<w:r><w:drawing>' +
      '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">' +
      '<wp:simplePos x="0" y="0"/>' +
      '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>' +
      '<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
      '<wp:extent cx="' + width + '" cy="' + height + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
      '<wp:docPr id="' + id + '" name="' + name + '" descr="' + description + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '" descr="' + description + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + relationshipId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + width + '" cy="' + height + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  }

  function getWordCoverColor(value) {
    var source = String(value || '').trim();
    var hex = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      var digits = hex[1];
      if (digits.length === 3) digits = digits.split('').map(function (digit) { return digit + digit; }).join('');
      return digits.slice(0, 6).toUpperCase();
    }
    var rgb = source.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
      return rgb.slice(1, 4).map(function (part) {
        return Math.max(0, Math.min(255, Number(part) || 0)).toString(16).padStart(2, '0');
      }).join('').toUpperCase();
    }
    var named = {
      black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000',
      gray: '808080', grey: '808080', navy: '000080', teal: '008080', purple: '800080',
      orange: 'FFA500', yellow: 'FFFF00'
    };
    return named[source.toLowerCase()] || '111111';
  }

  function makeDocxEditableCoverTextRun(element) {
    var fontFamily = escapeXml(element.fontFamily || 'Arial');
    var fontSize = Math.max(2, Math.round((Number(element.fontSizePt) || 12) * 2));
    var numericWeight = Number(element.fontWeight);
    var isBold = /^(?:bold|bolder)$/i.test(element.fontWeight || '') ||
      (Number.isFinite(numericWeight) && numericWeight >= 600);
    var isItalic = String(element.fontStyle || '').toLowerCase() === 'italic';
    var properties = '<w:rPr>' +
      '<w:rFonts w:ascii="' + fontFamily + '" w:hAnsi="' + fontFamily + '" w:eastAsia="' + fontFamily + '"/>' +
      '<w:color w:val="' + getWordCoverColor(element.color) + '"/>' +
      '<w:sz w:val="' + fontSize + '"/><w:szCs w:val="' + fontSize + '"/>' +
      (isBold ? '<w:b/><w:bCs/>' : '') +
      (isItalic ? '<w:i/><w:iCs/>' : '') +
      '</w:rPr>';
    var content = String(element.text || '').replace(/\r\n?/g, '\n').split('\n').map(function (line, index) {
      return (index ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + escapeXml(line) + '</w:t>';
    }).join('');
    return '<w:r>' + properties + content + '</w:r>';
  }

  function makeDocxEditableCoverTextBox(element, index) {
    var x = Number(element.xPt) || 0;
    var y = Number(element.yPt) || 0;
    var width = Math.max(1, Number(element.widthPt) || 1);
    var height = Math.max(1, Number(element.heightPt) || 1);
    var rotation = Number(element.rotation) || 0;
    var alignment = /^(?:center|right)$/.test(element.textAlign || '')
      ? element.textAlign
      : (element.textAlign === 'justify' ? 'both' : 'left');
    var style = 'position:absolute;'
      + 'margin-left:' + x.toFixed(2) + 'pt;margin-top:' + y.toFixed(2) + 'pt;'
      + 'width:' + width.toFixed(2) + 'pt;height:' + height.toFixed(2) + 'pt;'
      + (rotation ? 'rotation:' + rotation.toFixed(2) + ';' : '')
      + 'z-index:' + Math.max(2, Number(element.zIndex) || (index + 2)) + ';'
      + 'mso-position-horizontal-relative:page;mso-position-vertical-relative:page;'
      + 'mso-wrap-style:none';
    return '<w:r><w:pict>' +
      '<v:rect id="_x0000_s' + (2048 + index) + '" style="' + escapeXml(style) + '" ' +
      'filled="f" stroked="f" o:allowincell="f">' +
      '<v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:t">' +
      '<w:txbxContent><w:p><w:pPr><w:jc w:val="' + alignment + '"/>' +
      '<w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/></w:pPr>' +
      makeDocxEditableCoverTextRun(element) +
      '</w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r>';
  }

  function makeDocxCoverBlock(item) {
    var pageWidth = Math.max(1, Number(item.pageWidthTwips) || 11906);
    var pageHeight = Math.max(1, Number(item.pageHeightTwips) || 16838);
    var orientation = pageWidth > pageHeight ? ' w:orient="landscape"' : '';
    return '<w:p><w:pPr>' +
      '<w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/>' +
      '<w:sectPr><w:type w:val="nextPage"/>' +
      '<w:pgSz w:w="' + pageWidth + '" w:h="' + pageHeight + '"' + orientation + '/>' +
      '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>' +
      '</w:sectPr></w:pPr>' + makeDocxCoverDrawingRun(item) +
      (Array.isArray(item.editableTextElements) ? item.editableTextElements.map(makeDocxEditableCoverTextBox).join('') : '') +
      '</w:p>';
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
    if (item && item.type === 'table') return makeDocxTable(item);
    if (item && item.type === 'image') return makeDocxImageParagraph(item);
    if (item && item.type === 'coverImage') return makeDocxCoverBlock(item);
    return makeDocxParagraph(item);
  }

  function makeCenteredFrontParagraph(text, size, bold, before, after) {
    if (!String(text || '').trim()) return '';
    return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="' + (before || 0) + '" w:after="' + (after || 0) + '"/></w:pPr>' +
      '<w:r><w:rPr>' + (bold ? '<w:b/><w:bCs/>' : '') + '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr>' +
      '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r></w:p>';
  }

  function makeMergeCoverXml(cover) {
    if (!cover) return '';
    var meta = [cover.author, cover.institution, cover.date].filter(function (value) {
      return String(value || '').trim();
    }).join('\n');
    return makeCenteredFrontParagraph(cover.title, 64, true, 3000, 360) +
      makeCenteredFrontParagraph(cover.subtitle, 36, false, 0, 1800) +
      makeCenteredFrontParagraph(meta, 24, false, 0, 120) +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function makeAutomaticTocXml(enabled) {
    if (!enabled) return '';
    return '<w:p><w:pPr><w:pStyle w:val="TOCHeading"/><w:jc w:val="center"/></w:pPr>' +
      '<w:r><w:t>목차</w:t></w:r></w:p>' +
      '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:t>문서를 열면 목차가 자동으로 업데이트됩니다.</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  async function createBlob(payload) {
    if (typeof global.JSZip !== 'function') {
      throw new Error('DOCX export requires JSZip.');
    }

    var data = payload || {};
    var extractedCovers = extractNoteCoverBlocks(String(data.content || ''));
    var markdown = extractedCovers.markdown;
    var html = String(data.html || '').trim();
    var useHtmlSource = /<(?:html|body|article|section|div|table|h[1-6]|p|ul|ol|blockquote|pre)\b/i.test(markdown) &&
      !/^(?:\s{0,3}#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s)/m.test(markdown);
    var items = useHtmlSource ? htmlToDocxItems(markdown) : markdownToDocxItems(markdown);
    if (!items.length && html && !extractedCovers.covers.length) items = htmlToDocxItems(html);
    items = extractedCovers.covers.map(function (config) {
      return { type: 'cover', config: config };
    }).concat(extractedCovers.errors.map(function (message) {
      return { type: 'paragraph', text: '[표지 렌더링 오류: ' + message + ']' };
    }), items);
    if (!items.length) items = [{ type: 'paragraph', text: '' }];

    var imageSequence = 0;
    var preparedImages = await Promise.all(items.map(async function (item) {
      if (!item || (item.type !== 'image' && item.type !== 'cover')) return null;
      imageSequence += 1;
      try {
        if (item.type === 'cover') return await prepareNoteCoverAsset(item, data, imageSequence);
        return await prepareImageAsset(item, data, imageSequence);
      } catch (error) {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('[DOCX export] ' + String(error && error.message || error), item.src || '');
        }
        return { error: error };
      }
    }));

    var media = [];
    var relationshipSequence = 2;
    var drawingSequence = 1;
    items = items.map(function (item, itemIndex) {
      if (!item || (item.type !== 'image' && item.type !== 'cover')) return item;
      var prepared = preparedImages[itemIndex];
      if (!prepared || prepared.error) {
        if (item.type === 'cover') {
          return { type: 'paragraph', text: '[표지를 DOCX 이미지로 렌더링하지 못했습니다.]' };
        }
        var label = item.alt ? item.alt + ' — ' : '';
        return {
          type: 'paragraph',
          text: '[이미지를 불러오지 못했습니다: ' + label + String(item.src || '') + ']'
        };
      }
      prepared.relationshipId = 'rId' + relationshipSequence;
      prepared.drawingId = drawingSequence;
      relationshipSequence += 1;
      drawingSequence += 1;
      media.push(prepared);
      return Object.assign({}, item, prepared, {
        type: item.type === 'cover' ? 'coverImage' : 'image'
      });
    });

    var frontMatterXml = makeMergeCoverXml(data.mergeCover) + makeAutomaticTocXml(data.includeToc);
    var documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
      'xmlns:v="urn:schemas-microsoft-com:vml" ' +
      'xmlns:o="urn:schemas-microsoft-com:office:office">' +
      '<w:body>' +
      frontMatterXml +
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
      '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:qFormat/></w:style>' +
      '</w:styles>';

    var zip = new global.JSZip();
    var imageContentTypes = {};
    media.forEach(function (asset) {
      imageContentTypes[asset.extension] = asset.mime;
    });
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      Object.keys(imageContentTypes).map(function (extension) {
        return '<Default Extension="' + escapeXml(extension) + '" ContentType="' +
          escapeXml(imageContentTypes[extension]) + '"/>';
      }).join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      (data.includeToc ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' : '') +
      '</Types>');
    zip.folder('_rels').file('.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');
    zip.folder('word').file('document.xml', documentXml);
    zip.folder('word').file('styles.xml', stylesXml);
    if (data.includeToc) {
      zip.folder('word').file('settings.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:updateFields w:val="true"/></w:settings>');
    }
    zip.folder('word').folder('_rels').file('document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      (data.includeToc ? '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' : '') +
      media.map(function (asset) {
        return '<Relationship Id="' + escapeXml(asset.relationshipId) + '" ' +
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
          'Target="media/' + escapeXml(asset.fileName) + '"/>';
      }).join('') +
      '</Relationships>');
    var mediaFolder = zip.folder('word').folder('media');
    media.forEach(function (asset) {
      mediaFolder.file(asset.fileName, asset.bytes || asset.blob);
    });

    return await zip.generateAsync({
      type: 'blob',
      mimeType: DOCX_MIME,
      compression: 'DEFLATE'
    });
  }

  global.DocxExport = Object.freeze({
    createBlob: createBlob,
    extractNoteCoverBlocks: extractNoteCoverBlocks,
    mimeType: DOCX_MIME
  });
})(window);
