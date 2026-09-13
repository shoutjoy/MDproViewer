/* AI Jena public academic search - OpenAlex first, Crossref metadata/abstract enrichment second. */
(function (root) {
  'use strict';

  var OPENALEX_API = 'https://api.openalex.org/works';
  var CROSSREF_API = 'https://api.crossref.org/works';
  var MAX_RESULTS = 50;

  function cleanText(value) {
    return String(value == null ? '' : value)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeDoi(value) {
    return cleanText(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
  }

  function normalizeTitle(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();
  }

  function relaxedAcademicQuery(value) {
    return cleanText(value)
      .replace(/([가-힣])(과|와)\s+/g, '$1 ')
      .replace(/([가-힣])([A-Za-z])/g, '$1 $2')
      .replace(/([A-Za-z])([가-힣])/g, '$1 $2')
      .replace(/(?:에\s*대하(?:여|해)|에\s*관한|관련\s*(?:내용|연구)?|논문|연구)\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function abstractFromInvertedIndex(index) {
    if (!index || typeof index !== 'object') return '';
    var words = [];
    Object.keys(index).forEach(function (word) {
      var positions = Array.isArray(index[word]) ? index[word] : [];
      positions.forEach(function (position) {
        var pos = Number(position);
        if (Number.isFinite(pos) && pos >= 0) words[pos] = word;
      });
    });
    return cleanText(words.map(function (word) { return word || ''; }).join(' '));
  }

  function crossrefYear(item) {
    var candidates = [item && item.published, item && item['published-print'], item && item['published-online'], item && item.issued, item && item.created];
    for (var i = 0; i < candidates.length; i++) {
      var parts = candidates[i] && candidates[i]['date-parts'];
      var year = parts && parts[0] && Number(parts[0][0]);
      if (Number.isFinite(year)) return year;
    }
    return null;
  }

  function authorLabel(authors) {
    var values = (Array.isArray(authors) ? authors : []).map(cleanText).filter(Boolean);
    if (!values.length) return '';
    if (values.length === 1) return values[0];
    if (values.length === 2) return values[0] + ' & ' + values[1];
    return values[0] + ' 외';
  }

  function fromOpenAlex(item) {
    var authors = (Array.isArray(item && item.authorships) ? item.authorships : []).map(function (authorship) {
      return authorship && authorship.author ? authorship.author.display_name : '';
    }).map(cleanText).filter(Boolean);
    var primary = item && item.primary_location || {};
    var bestOpenAccess = item && item.best_oa_location || {};
    var source = primary.source || {};
    var doi = normalizeDoi(item && item.doi);
    return {
      id: cleanText(item && item.id),
      sources: ['OpenAlex'],
      title: cleanText(item && (item.display_name || item.title)),
      authors: authors,
      authorLabel: authorLabel(authors),
      year: Number(item && item.publication_year) || null,
      journal: cleanText(source.display_name),
      doi: doi,
      url: doi ? 'https://doi.org/' + doi : cleanText(primary.landing_page_url || item && item.id),
      pdfUrl: cleanText(bestOpenAccess.pdf_url || primary.pdf_url),
      citedBy: Number(item && item.cited_by_count) || 0,
      abstract: abstractFromInvertedIndex(item && item.abstract_inverted_index).slice(0, 6000),
      type: cleanText(item && item.type)
    };
  }

  function fromCrossref(item) {
    var authors = (Array.isArray(item && item.author) ? item.author : []).map(function (author) {
      return cleanText([author && author.given, author && author.family].filter(Boolean).join(' '));
    }).filter(Boolean);
    var doi = normalizeDoi(item && item.DOI);
    var title = Array.isArray(item && item.title) ? item.title[0] : item && item.title;
    var journal = Array.isArray(item && item['container-title']) ? item['container-title'][0] : item && item['container-title'];
    var pdfLink = (Array.isArray(item && item.link) ? item.link : []).find(function (link) {
      return /pdf/i.test(cleanText(link && (link['content-type'] || link.URL)));
    });
    return {
      id: doi ? 'https://doi.org/' + doi : cleanText(item && item.URL),
      sources: ['Crossref'],
      title: cleanText(title),
      authors: authors,
      authorLabel: authorLabel(authors),
      year: crossrefYear(item),
      journal: cleanText(journal),
      doi: doi,
      url: doi ? 'https://doi.org/' + doi : cleanText(item && item.URL),
      pdfUrl: cleanText(pdfLink && pdfLink.URL),
      citedBy: Number(item && item['is-referenced-by-count']) || 0,
      abstract: cleanText(item && item.abstract).slice(0, 6000),
      type: cleanText(item && item.type)
    };
  }

  function recordKey(item) {
    if (item.doi) return 'doi:' + item.doi;
    return 'title:' + normalizeTitle(item.title);
  }

  function mergeRecords(openAlex, crossref, count) {
    var merged = [];
    var byKey = new Map();
    function add(item) {
      if (!item || !item.title) return;
      var key = recordKey(item);
      if (!key || key === 'title:') return;
      var existing = byKey.get(key);
      if (!existing) {
        var copy = Object.assign({}, item, { sources: (item.sources || []).slice() });
        byKey.set(key, copy);
        merged.push(copy);
        return;
      }
      existing.sources = Array.from(new Set((existing.sources || []).concat(item.sources || [])));
      if (!existing.abstract && item.abstract) existing.abstract = item.abstract;
      if (!existing.doi && item.doi) existing.doi = item.doi;
      if (!existing.url && item.url) existing.url = item.url;
      if (!existing.pdfUrl && item.pdfUrl) existing.pdfUrl = item.pdfUrl;
      if (!existing.journal && item.journal) existing.journal = item.journal;
      if (!existing.year && item.year) existing.year = item.year;
      if ((!existing.authors || !existing.authors.length) && item.authors && item.authors.length) {
        existing.authors = item.authors;
        existing.authorLabel = item.authorLabel;
      }
      existing.citedBy = Math.max(Number(existing.citedBy) || 0, Number(item.citedBy) || 0);
    }
    openAlex.forEach(add);
    crossref.forEach(add);
    return merged.slice(0, count);
  }

  async function fetchJson(url, signal, label) {
    var response = await fetch(url, { headers: { Accept: 'application/json' }, signal: signal });
    if (!response.ok) throw new Error(label + ' 검색 오류: HTTP ' + response.status);
    return response.json();
  }

  async function searchOpenAlex(query, rows, signal, requireAbstract) {
    var params = new URLSearchParams();
    params.set('search', query);
    if (requireAbstract !== false) params.set('filter', 'has_abstract:true');
    params.set('per-page', String(rows));
    params.set('select', 'id,doi,title,display_name,publication_year,authorships,primary_location,best_oa_location,abstract_inverted_index,cited_by_count,type');
    var data = await fetchJson(OPENALEX_API + '?' + params.toString(), signal, 'OpenAlex');
    return (Array.isArray(data && data.results) ? data.results : []).map(fromOpenAlex);
  }

  async function searchCrossref(query, rows, signal, requireAbstract) {
    var params = new URLSearchParams();
    params.set('query.bibliographic', query);
    if (requireAbstract !== false) params.set('filter', 'has-abstract:true');
    params.set('rows', String(rows));
    var data = await fetchJson(CROSSREF_API + '?' + params.toString(), signal, 'Crossref');
    var items = data && data.message && Array.isArray(data.message.items) ? data.message.items : [];
    return items.map(fromCrossref);
  }

  async function search(query, count, options) {
    var q = cleanText(query).slice(0, 500);
    if (!q) throw new Error('학술검색어가 없습니다.');
    var limit = Math.max(1, Math.min(MAX_RESULTS, Number(count) || 10));
    var rows = Math.min(100, Math.max(25, limit * 3));
    var opts = options || {};
    var progress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    progress('OpenAlex에서 초록을 검색하는 중...');
    var openAlex = [];
    var crossref = [];
    var warnings = [];
    function addWarning(message) {
      var value = cleanText(message);
      if (value && warnings.indexOf(value) < 0) warnings.push(value);
    }
    try { openAlex = await searchOpenAlex(q, rows, opts.signal, true); }
    catch (error) {
      if (error && error.name === 'AbortError') throw error;
      addWarning(error.message || String(error));
    }
    progress('Crossref에서 초록과 DOI를 보강하는 중...');
    try { crossref = await searchCrossref(q, rows, opts.signal, true); }
    catch (error) {
      if (error && error.name === 'AbortError') throw error;
      addWarning(error.message || String(error));
    }
    var results = mergeRecords(openAlex, crossref, limit);
    if (results.length < limit) {
      progress('공개 초록 결과가 부족하여 서지정보까지 확대 검색하는 중...');
      var metadataOpenAlex = [];
      var metadataCrossref = [];
      try { metadataOpenAlex = await searchOpenAlex(q, rows, opts.signal, false); }
      catch (error) {
        if (error && error.name === 'AbortError') throw error;
        addWarning(error.message || String(error));
      }
      try { metadataCrossref = await searchCrossref(q, rows, opts.signal, false); }
      catch (error) {
        if (error && error.name === 'AbortError') throw error;
        addWarning(error.message || String(error));
      }
      openAlex = openAlex.concat(metadataOpenAlex);
      crossref = crossref.concat(metadataCrossref);
      results = mergeRecords(openAlex, crossref, limit);
      if (metadataOpenAlex.length || metadataCrossref.length) {
        addWarning('공개 초록이 부족하여 일부 서지정보 검색 결과를 포함했습니다. 초록이 없는 자료는 연구 결과의 직접 근거로 사용하지 않습니다.');
      }
    }
    var relaxedQuery = relaxedAcademicQuery(q);
    if (!results.length && /[가-힣]/.test(q) && typeof opts.translateQuery === 'function') {
      progress('한국어 주제를 영문 학술 검색어로 변환하는 중...');
      try {
        var translatedQuery = cleanText(await opts.translateQuery(q)).slice(0, 300);
        if (translatedQuery && translatedQuery !== q) relaxedQuery = translatedQuery;
      } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        addWarning('영문 검색어 변환 실패: ' + (error.message || String(error)));
      }
    }
    if (!results.length && relaxedQuery && relaxedQuery !== q) {
      progress('대체 학술 검색어 “' + relaxedQuery + '”로 다시 검색하는 중...');
      var relaxedOpenAlex = [];
      var relaxedCrossref = [];
      try { relaxedOpenAlex = await searchOpenAlex(relaxedQuery, rows, opts.signal, false); }
      catch (error) {
        if (error && error.name === 'AbortError') throw error;
        addWarning(error.message || String(error));
      }
      try { relaxedCrossref = await searchCrossref(relaxedQuery, rows, opts.signal, false); }
      catch (error) {
        if (error && error.name === 'AbortError') throw error;
        addWarning(error.message || String(error));
      }
      results = mergeRecords(relaxedOpenAlex, relaxedCrossref, limit);
      if (results.length) addWarning('원 검색어를 보완한 대체 검색어 “' + relaxedQuery + '” 결과를 사용했습니다.');
    }
    if (!results.length) {
      throw new Error(warnings.length
        ? warnings.join(' / ')
        : '공개 학술검색 결과가 없습니다. 핵심 개념 2~4개로 검색어를 줄여 다시 시도하세요.');
    }
    var abstractCount = results.filter(function (item) { return !!cleanText(item && item.abstract); }).length;
    progress('검색 근거 ' + results.length + '건(공개 초록 ' + abstractCount + '건)을 AI 분석용으로 정리하는 중...');
    return {
      results: results,
      warnings: warnings,
      requestedCount: limit,
      abstractCount: abstractCount,
      queryUsed: relaxedQuery && relaxedQuery !== q && warnings.some(function (item) { return item.indexOf('대체 검색어') >= 0; }) ? relaxedQuery : q
    };
  }

  function formatEvidence(results, options) {
    var items = Array.isArray(results) ? results : [];
    var opts = options || {};
    var maxChars = Math.max(0, Number(opts.maxChars) || 0);
    var compact = opts.compact === true;
    var includeAll = opts.includeAll === true;
    var itemDivisor = Math.max(1, Math.min(items.length, MAX_RESULTS));
    var abstractLimit = compact && maxChars
      ? Math.max(35, Math.min(400, Math.floor((maxChars - 200) / itemDivisor) - 145))
      : maxChars
      ? Math.max(180, Math.min(1200, Math.floor((maxChars - 500) / itemDivisor) - 320))
      : Math.max(1200, Math.min(5000, Math.floor(80000 / Math.max(1, items.length))));
    var blocks = [];
    var usedChars = 0;
    var included = 0;
    items.some(function (item, index) {
      var knownAuthors = Array.isArray(item.authors) ? item.authors.map(cleanText).filter(Boolean) : [];
      var hasAuthorYear = knownAuthors.length && Number(item.year);
      var citation = hasAuthorYear
        ? '(' + item.authorLabel + ', ' + item.year + ')'
        : '인용 불가: 저자와 연도가 모두 확인되지 않음';
      var abstract = item.abstract || 'Abstract not available';
      if (abstract.length > abstractLimit) abstract = abstract.slice(0, abstractLimit) + ' [truncated for AI context]';
      var block = compact
        ? [
            '[RESEARCH RECORD]',
            'C: ' + citation,
            'T: ' + cleanText(item.title).slice(0, 76),
            'X: ' + abstract
          ].join('\n')
        : [
            '[RESEARCH RECORD]',
            'Title: ' + item.title,
            'Authors: ' + (knownAuthors.length ? knownAuthors.join(', ') : 'Not provided'),
            'Required citation: ' + citation,
            'Year: ' + (item.year || 'n.d.'),
            'Journal: ' + (item.journal || 'Unknown'),
            'DOI: ' + (item.doi || 'Not available'),
            'URL: ' + (item.url || 'Not available'),
            'Public metadata: ' + (item.sources || []).join(' + '),
            'Abstract: ' + abstract
          ].join('\n');
      if (maxChars && !includeAll && blocks.length && usedChars + block.length + 2 > maxChars) return true;
      if (maxChars && block.length > maxChars) block = block.slice(0, Math.max(0, maxChars - 35)) + '\n[truncated for AI context]';
      blocks.push(block);
      usedChars += block.length + 2;
      included += 1;
      return !includeAll && usedChars >= maxChars && maxChars > 0;
    });
    if (included < items.length) {
      var notice = '[CONTEXT NOTICE] ' + included + ' of ' + items.length
        + ' ranked results were supplied to the AI because the local model has a limited context window. The full result list remains visible in the app.';
      while (maxChars && blocks.length > 1 && usedChars + notice.length + 2 > maxChars) {
        usedChars -= blocks.pop().length + 2;
        included -= 1;
        notice = '[CONTEXT NOTICE] ' + included + ' of ' + items.length
          + ' ranked results were supplied to the AI because the local model has a limited context window. The full result list remains visible in the app.';
      }
      blocks.push(notice);
    }
    return blocks.join('\n\n');
  }

  function formatMarkdown(results, query) {
    var lines = ['## 공개 학술검색 결과', '', '- 검색어: ' + cleanText(query), '- 결과: ' + (results || []).length + '건', ''];
    (results || []).forEach(function (item, index) {
      lines.push('### ' + (index + 1) + '. ' + item.title);
      lines.push('');
      var knownAuthors = Array.isArray(item.authors) ? item.authors.map(cleanText).filter(Boolean) : [];
      if (knownAuthors.length) lines.push('- 저자·연도: ' + item.authorLabel + ' (' + (item.year || 'n.d.') + ')');
      else if (item.year) lines.push('- 연도: ' + item.year);
      if (item.journal) lines.push('- 학술지: ' + item.journal);
      if (item.doi) lines.push('- DOI: https://doi.org/' + item.doi);
      lines.push('- 메타데이터: ' + (item.sources || []).join(' + '));
      lines.push('');
      lines.push('**초록**');
      lines.push('');
      lines.push(item.abstract || '공개 메타데이터에서 초록을 제공하지 않음');
      lines.push('');
    });
    return lines.join('\n');
  }

  var api = Object.freeze({
    search: search,
    formatEvidence: formatEvidence,
    formatMarkdown: formatMarkdown
  });
  root.AIChatAcademicSearch = api;
  root.ScholarSearch = root.ScholarSearch || {};
  root.ScholarSearch.AcademicSearch = api;
})(window);
