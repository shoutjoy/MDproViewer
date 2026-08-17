(function (global) {
  'use strict';

  var WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function localChildren(node, name) {
    return Array.from(node && node.children || []).filter(function (child) {
      return child.localName === name;
    });
  }

  function localChild(node, name) {
    return localChildren(node, name)[0] || null;
  }

  function descendants(node, name) {
    if (!node || typeof node.getElementsByTagNameNS !== 'function') return [];
    return Array.from(node.getElementsByTagNameNS('*', name));
  }

  function wordValue(node, fallback) {
    if (!node) return fallback;
    return node.getAttributeNS(WORD_NS, 'val')
      || node.getAttribute('w:val')
      || node.getAttribute('val')
      || fallback;
  }

  function wordAttr(node, name, fallback) {
    if (!node) return fallback;
    return node.getAttributeNS(WORD_NS, name)
      || node.getAttribute('w:' + name)
      || node.getAttribute(name)
      || fallback;
  }

  function parseXml(text, label) {
    var parsed = new DOMParser().parseFromString(String(text || ''), 'application/xml');
    if (descendants(parsed, 'parsererror').length) {
      throw new Error((label || 'DOCX XML') + '을 읽을 수 없습니다.');
    }
    return parsed;
  }

  function appendStyle(element, name, value) {
    if (!element || value == null || value === '') return;
    element.style.setProperty(name, String(value));
  }

  function widthToCss(widthNode) {
    var type = String(wordAttr(widthNode, 'type', 'dxa')).toLowerCase();
    var value = Number(wordAttr(widthNode, 'w', 0));
    if (!Number.isFinite(value) || value <= 0 || type === 'auto' || type === 'nil') return '';
    if (type === 'pct') return Math.min(100, value / 50) + '%';
    if (type === 'dxa') return (value / 20).toFixed(2).replace(/\.00$/, '') + 'pt';
    return value + 'px';
  }

  function normalizeColor(value, fallback) {
    var color = String(value || '').replace(/^#/, '');
    if (!color || color === 'auto' || !/^[0-9a-f]{6}$/i.test(color)) return fallback || '';
    return '#' + color;
  }

  function applyColorModifier(color, tintValue, shadeValue) {
    var hex = String(color || '').replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return '';
    var tint = parseInt(String(tintValue || ''), 16);
    var shade = parseInt(String(shadeValue || ''), 16);
    var channels = [0, 2, 4].map(function (offset) { return parseInt(hex.slice(offset, offset + 2), 16); });
    if (Number.isFinite(tint)) channels = channels.map(function (channel) { return Math.round(channel + (255 - channel) * tint / 255); });
    if (Number.isFinite(shade)) channels = channels.map(function (channel) { return Math.round(channel * shade / 255); });
    return '#' + channels.map(function (channel) { return Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'); }).join('');
  }

  function readThemeColors(themeXml) {
    var colors = {};
    if (!themeXml) return colors;
    var scheme = descendants(themeXml, 'clrScheme')[0];
    Array.from(scheme && scheme.children || []).forEach(function (entry) {
      var valueNode = Array.from(entry.children || []).find(function (child) {
        return child.localName === 'srgbClr' || child.localName === 'sysClr';
      });
      var value = valueNode && (valueNode.localName === 'sysClr'
        ? (valueNode.getAttribute('lastClr') || valueNode.getAttribute('val'))
        : valueNode.getAttribute('val'));
      var normalized = normalizeColor(value, '');
      if (normalized) colors[entry.localName] = normalized;
    });
    return colors;
  }

  function shadingColor(shadingNode, themeColors) {
    if (!shadingNode) return '';
    var direct = wordAttr(shadingNode, 'fill', '');
    if (direct && !/^(?:auto|none|nil)$/i.test(direct)) return normalizeColor(direct, '');
    var themeName = wordAttr(shadingNode, 'themeFill', '');
    var themeColor = themeColors && themeColors[themeName];
    if (themeColor) {
      return applyColorModifier(
        themeColor,
        wordAttr(shadingNode, 'themeFillTint', ''),
        wordAttr(shadingNode, 'themeFillShade', '')
      );
    }
    return 'transparent';
  }

  function needsDarkText(backgroundColor) {
    var hex = String(backgroundColor || '').replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
    var channels = [0, 2, 4].map(function (offset) {
      var value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    var luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return luminance > 0.42;
  }

  function borderCss(borderNode) {
    if (!borderNode) return '';
    var kind = String(wordValue(borderNode, 'single')).toLowerCase();
    if (kind === 'nil' || kind === 'none') return 'none';
    var styles = {
      dashed: 'dashed', dashsmallgap: 'dashed', dotdash: 'dashed', dotdotdash: 'dashed',
      dotted: 'dotted', double: 'double', triple: 'double'
    };
    var size = Math.max(0.5, Number(wordAttr(borderNode, 'sz', 8)) / 8);
    return size + 'pt ' + (styles[kind] || 'solid') + ' '
      + normalizeColor(wordAttr(borderNode, 'color', ''), '#9aa3af');
  }

  function applyBorders(element, bordersNode) {
    if (!element || !bordersNode) return;
    [['top', 'top'], ['right', 'right'], ['bottom', 'bottom'], ['left', 'left']].forEach(function (pair) {
      var css = borderCss(localChild(bordersNode, pair[1]));
      if (css) appendStyle(element, 'border-' + pair[0], css);
    });
    var insideH = borderCss(localChild(bordersNode, 'insideH'));
    var insideV = borderCss(localChild(bordersNode, 'insideV'));
    if (insideH) element.dataset.docxInsideH = insideH;
    if (insideV) element.dataset.docxInsideV = insideV;
  }

  function applyTableCellDefaults(table, tableBorders) {
    if (!table || !tableBorders) return;
    var cells = Array.from(table.querySelectorAll('th,td'));
    var outside = {
      top: borderCss(localChild(tableBorders, 'top')),
      right: borderCss(localChild(tableBorders, 'right')),
      bottom: borderCss(localChild(tableBorders, 'bottom')),
      left: borderCss(localChild(tableBorders, 'left'))
    };
    var insideH = borderCss(localChild(tableBorders, 'insideH'));
    var insideV = borderCss(localChild(tableBorders, 'insideV'));
    cells.forEach(function (cell) {
      if (insideH) {
        appendStyle(cell, 'border-top', insideH);
        appendStyle(cell, 'border-bottom', insideH);
      }
      if (insideV) {
        appendStyle(cell, 'border-left', insideV);
        appendStyle(cell, 'border-right', insideV);
      }
    });
    var rows = Array.from(table.rows || []);
    if (!rows.length) return;
    Array.from(rows[0].cells || []).forEach(function (cell) { if (outside.top) appendStyle(cell, 'border-top', outside.top); });
    Array.from(rows[rows.length - 1].cells || []).forEach(function (cell) { if (outside.bottom) appendStyle(cell, 'border-bottom', outside.bottom); });
    rows.forEach(function (row) {
      var rowCells = Array.from(row.cells || []);
      if (rowCells[0] && outside.left) appendStyle(rowCells[0], 'border-left', outside.left);
      if (rowCells.length && outside.right) appendStyle(rowCells[rowCells.length - 1], 'border-right', outside.right);
    });
  }

  function applyCellMargins(cell, margins) {
    if (!cell || !margins) return;
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      var value = widthToCss(localChild(margins, side));
      if (value) appendStyle(cell, 'padding-' + side, value);
    });
  }

  function applyCellProperties(cell, tcPr, inheritedTcPr, themeColors) {
    if (!cell) return;
    [inheritedTcPr, tcPr].forEach(function (properties) {
      if (!properties) return;
      var width = widthToCss(localChild(properties, 'tcW'));
      if (width) appendStyle(cell, 'width', width);
      var shading = localChild(properties, 'shd');
      if (shading) {
        var backgroundColor = shadingColor(shading, themeColors);
        appendStyle(cell, 'background-color', backgroundColor);
        if (needsDarkText(backgroundColor)) cell.dataset.docxTextContrast = 'dark';
        else delete cell.dataset.docxTextContrast;
      }
      var valign = String(wordValue(localChild(properties, 'vAlign'), '')).toLowerCase();
      if (valign) appendStyle(cell, 'vertical-align', valign === 'center' ? 'middle' : valign);
      var direction = String(wordValue(localChild(properties, 'textDirection'), '')).toLowerCase();
      if (direction.indexOf('tb') === 0) appendStyle(cell, 'writing-mode', 'vertical-rl');
      applyCellMargins(cell, localChild(properties, 'tcMar'));
      applyBorders(cell, localChild(properties, 'tcBorders'));
    });
  }

  function findStyleProperties(stylesXml, styleId) {
    if (!stylesXml || !styleId) return {};
    var style = descendants(stylesXml, 'style').find(function (candidate) {
      return wordAttr(candidate, 'styleId', '') === styleId;
    });
    if (!style) return {};
    var conditional = {};
    localChildren(style, 'tblStylePr').forEach(function (part) {
      var type = String(wordAttr(part, 'type', '') || wordValue(part, '')).trim();
      if (!type) return;
      conditional[type] = {
        tcPr: localChild(part, 'tcPr'),
        rPr: localChild(part, 'rPr')
      };
    });
    return {
      tblPr: localChild(style, 'tblPr'),
      tcPr: localChild(style, 'tcPr'),
      rPr: localChild(style, 'rPr'),
      conditional: conditional
    };
  }

  function isWordToggleEnabled(node, fallback) {
    if (!node) return !!fallback;
    var value = String(wordValue(node, '1')).toLowerCase();
    return value !== '0' && value !== 'false' && value !== 'off' && value !== 'none';
  }

  function tableLookEnabled(tblPr, name, fallback) {
    var look = localChild(tblPr, 'tblLook');
    if (!look) return !!fallback;
    var value = wordAttr(look, name, '');
    if (value === '') return !!fallback;
    return !/^(?:0|false|off)$/i.test(String(value));
  }

  function collectConditionalCellStyles(styleProperties, tblPr, rowIndex, colIndex, rowCount, colCount) {
    var conditional = styleProperties && styleProperties.conditional || {};
    var parts = [];
    var noHBand = tableLookEnabled(tblPr, 'noHBand', false);
    var noVBand = tableLookEnabled(tblPr, 'noVBand', true);
    if (!noHBand) parts.push(conditional[rowIndex % 2 === 0 ? 'band1Horz' : 'band2Horz']);
    if (!noVBand) parts.push(conditional[colIndex % 2 === 0 ? 'band1Vert' : 'band2Vert']);
    if (colIndex === 0 && tableLookEnabled(tblPr, 'firstColumn', false)) parts.push(conditional.firstCol);
    if (colIndex === colCount - 1 && tableLookEnabled(tblPr, 'lastColumn', false)) parts.push(conditional.lastCol);
    if (rowIndex === 0 && tableLookEnabled(tblPr, 'firstRow', true)) parts.push(conditional.firstRow);
    if (rowIndex === rowCount - 1 && tableLookEnabled(tblPr, 'lastRow', false)) parts.push(conditional.lastRow);
    if (rowIndex === 0 && colIndex === 0) parts.push(conditional.nwCell);
    if (rowIndex === 0 && colIndex === colCount - 1) parts.push(conditional.neCell);
    if (rowIndex === rowCount - 1 && colIndex === 0) parts.push(conditional.swCell);
    if (rowIndex === rowCount - 1 && colIndex === colCount - 1) parts.push(conditional.seCell);
    return parts.filter(Boolean);
  }

  function applyRunPropertiesToCell(cell, rPr) {
    if (!cell || !rPr) return;
    var bold = localChild(rPr, 'b');
    if (bold) appendStyle(cell, 'font-weight', isWordToggleEnabled(bold, true) ? '700' : '400');
  }

  function isVerticalMergeContinuation(tcPr) {
    var merge = localChild(tcPr, 'vMerge');
    return !!merge && String(wordValue(merge, '')).toLowerCase() !== 'restart';
  }

  function applyTableProperties(htmlTable, xmlTable, stylesXml, themeColors) {
    if (!htmlTable || !xmlTable) return;
    var tblPr = localChild(xmlTable, 'tblPr');
    var styleId = wordValue(localChild(tblPr, 'tblStyle'), '');
    var styleProperties = findStyleProperties(stylesXml, styleId);
    var effectiveTblPr = tblPr || styleProperties.tblPr;
    htmlTable.classList.add('docx-import-table');
    appendStyle(htmlTable, 'border-collapse', 'collapse');
    appendStyle(htmlTable, 'max-width', '100%');
    appendStyle(htmlTable, 'margin-top', '0.8em');
    appendStyle(htmlTable, 'margin-bottom', '0.8em');

    [styleProperties.tblPr, effectiveTblPr].forEach(function (properties) {
      if (!properties) return;
      var width = widthToCss(localChild(properties, 'tblW'));
      if (width) appendStyle(htmlTable, 'width', width);
      var align = String(wordValue(localChild(properties, 'jc'), '')).toLowerCase();
      if (align === 'center') {
        appendStyle(htmlTable, 'margin-left', 'auto');
        appendStyle(htmlTable, 'margin-right', 'auto');
      } else if (align === 'right' || align === 'end') {
        appendStyle(htmlTable, 'margin-left', 'auto');
      }
    });

    var gridColumns = localChildren(localChild(xmlTable, 'tblGrid'), 'gridCol');
    if (gridColumns.length) {
      appendStyle(htmlTable, 'table-layout', 'fixed');
      var existing = Array.from(htmlTable.children || []).find(function (child) {
        return child.localName === 'colgroup';
      });
      if (existing) existing.remove();
      var colgroup = htmlTable.ownerDocument.createElement('colgroup');
      gridColumns.forEach(function (gridColumn) {
        var col = htmlTable.ownerDocument.createElement('col');
        var width = Number(wordAttr(gridColumn, 'w', 0));
        if (width > 0) col.style.width = (width / 20).toFixed(2).replace(/\.00$/, '') + 'pt';
        colgroup.appendChild(col);
      });
      htmlTable.insertBefore(colgroup, htmlTable.firstChild);
    }

    var borders = localChild(tblPr, 'tblBorders')
      || localChild(styleProperties.tblPr, 'tblBorders');
    applyTableCellDefaults(htmlTable, borders);

    var xmlRows = localChildren(xmlTable, 'tr');
    var htmlRows = Array.from(htmlTable.rows || []);
    xmlRows.forEach(function (xmlRow, rowIndex) {
      var htmlRow = htmlRows[rowIndex];
      if (!htmlRow) return;
      var trPr = localChild(xmlRow, 'trPr');
      var heightNode = localChild(trPr, 'trHeight');
      var height = Number(wordAttr(heightNode, 'val', 0));
      if (height > 0) appendStyle(htmlRow, 'height', (height / 20).toFixed(2).replace(/\.00$/, '') + 'pt');
      if (localChild(trPr, 'cantSplit')) appendStyle(htmlRow, 'break-inside', 'avoid');

      var htmlCells = Array.from(htmlRow.cells || []);
      var xmlCells = localChildren(xmlRow, 'tc');
      var htmlCellIndex = 0;
      xmlCells.forEach(function (xmlCell, xmlCellIndex) {
        var tcPr = localChild(xmlCell, 'tcPr');
        if (isVerticalMergeContinuation(tcPr)) return;
        var htmlCell = htmlCells[htmlCellIndex++];
        if (!htmlCell) return;
        // The app theme gives every THEAD cell a gray fill and bold weight. DOCX
        // cells must start neutral, then receive only the Word styles that apply.
        appendStyle(htmlCell, 'background-color', 'transparent');
        appendStyle(htmlCell, 'font-weight', '400');
        applyCellProperties(htmlCell, styleProperties.tcPr, null, themeColors);
        applyRunPropertiesToCell(htmlCell, styleProperties.rPr);
        collectConditionalCellStyles(
          styleProperties,
          tblPr,
          rowIndex,
          xmlCellIndex,
          xmlRows.length,
          xmlCells.length
        ).forEach(function (conditionalStyle) {
          applyCellProperties(htmlCell, conditionalStyle.tcPr, null, themeColors);
          applyRunPropertiesToCell(htmlCell, conditionalStyle.rPr);
        });
        var gridSpan = Number(wordValue(localChild(tcPr, 'gridSpan'), 1));
        if (gridSpan > 1) htmlCell.colSpan = gridSpan;
        applyCellProperties(htmlCell, tcPr, null, themeColors);
        var paragraph = localChild(xmlCell, 'p');
        var align = String(wordValue(localChild(localChild(paragraph, 'pPr'), 'jc'), '')).toLowerCase();
        if (align) appendStyle(htmlCell, 'text-align', align === 'both' || align === 'distribute' ? 'justify' : align);
      });
    });
  }

  async function enhanceHtml(arrayBuffer, html) {
    if (!global.JSZip || typeof global.JSZip.loadAsync !== 'function' || typeof DOMParser === 'undefined') {
      return { html: String(html || ''), warning: 'DOCX 표 서식 보강 모듈을 사용할 수 없습니다.' };
    }
    var zip = await global.JSZip.loadAsync(arrayBuffer);
    var documentPart = zip.file('word/document.xml');
    if (!documentPart) return { html: String(html || ''), warning: 'DOCX 본문 XML을 찾지 못했습니다.' };
    var documentXml = parseXml(await documentPart.async('string'), 'DOCX 본문');
    var stylesPart = zip.file('word/styles.xml');
    var stylesXml = stylesPart ? parseXml(await stylesPart.async('string'), 'DOCX 스타일') : null;
    var themePart = zip.file('word/theme/theme1.xml');
    var themeXml = themePart ? parseXml(await themePart.async('string'), 'DOCX 테마') : null;
    var themeColors = readThemeColors(themeXml);
    var htmlDocument = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    var xmlTables = descendants(documentXml, 'tbl');
    var htmlTables = Array.from(htmlDocument.body.querySelectorAll('table'));
    var count = Math.min(xmlTables.length, htmlTables.length);
    for (var index = 0; index < count; index += 1) {
      applyTableProperties(htmlTables[index], xmlTables[index], stylesXml, themeColors);
    }
    return {
      html: htmlDocument.body.innerHTML,
      warning: xmlTables.length === htmlTables.length ? '' : '일부 복합 표의 개수가 원본과 달라 확인이 필요합니다.',
      tableCount: count
    };
  }

  async function convert(arrayBuffer, options) {
    var opts = options || {};
    var mammothApi = opts.mammoth || global.mammoth;
    if (!mammothApi || typeof mammothApi.convertToHtml !== 'function') {
      throw new Error('Mammoth DOCX 변환기를 사용할 수 없습니다.');
    }
    var result = await mammothApi.convertToHtml({ arrayBuffer: arrayBuffer }, opts.mammothOptions || {});
    var enhanced = await enhanceHtml(arrayBuffer, String(result && result.value || ''));
    return {
      value: enhanced.html,
      messages: Array.isArray(result && result.messages) ? result.messages : [],
      tableCount: enhanced.tableCount || 0,
      enhancementWarning: enhanced.warning || ''
    };
  }

  global.DocxImport = {
    convert: convert,
    enhanceHtml: enhanceHtml,
    __test: {
      widthToCss: widthToCss,
      borderCss: borderCss,
      normalizeColor: normalizeColor
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
