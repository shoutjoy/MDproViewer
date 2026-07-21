/* AI Chat public academic search - OpenAlex first, Crossref metadata/abstract enrichment second. */
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
    if (!values.length) return '저자 미상';
    if (values.length === 1) return values[0];
    if (values.length === 2) return values[0] + ' & ' + values[1];
    return values[0] + ' 외';
  }

  function fromOpenAlex(item) {
    var authors = (Array.isArray(item && item.authorships) ? item.authorships : []).map(function (authorship) {
      return authorship && authorship.author ? authorship.author.display_name : '';
    }).map(cleanText).filter(Boolean);
    var primary = item && item.primary_location || {};
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

  async function searchOpenAlex(query, rows, signal) {
    var params = new URLSearchParams();
    params.set('search', query);
    params.set('filter', 'has_abstract:true');
    params.set('per-page', String(rows));
    params.set('select', 'id,doi,title,display_name,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count,type');
    var data = await fetchJson(OPENALEX_API + '?' + params.toString(), signal, 'OpenAlex');
    return (Array.isArray(data && data.results) ? data.results : []).map(fromOpenAlex);
  }

  async function searchCrossref(query, rows, signal) {
    var params = new URLSearchParams();
    params.set('query.bibliographic', query);
    params.set('filter', 'has-abstract:true');
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
    var errors = [];
    try { openAlex = await searchOpenAlex(q, rows, opts.signal); }
    catch (error) {
      if (error && error.name === 'AbortError') throw error;
      errors.push(error.message || String(error));
    }
    progress('Crossref에서 초록과 DOI를 보강하는 중...');
    try { crossref = await searchCrossref(q, rows, opts.signal); }
    catch (error) {
      if (error && error.name === 'AbortError') throw error;
      errors.push(error.message || String(error));
    }
    var results = mergeRecords(openAlex, crossref, limit);
    if (!results.length) throw new Error(errors.length ? errors.join(' / ') : '공개 학술검색 결과가 없습니다.');
    progress('검색 근거 ' + results.length + '건을 AI 분석용으로 정리하는 중...');
    return { results: results, warnings: errors, requestedCount: limit };
  }

  function formatEvidence(results) {
    var items = Array.isArray(results) ? results : [];
    var abstractLimit = Math.max(1200, Math.min(5000, Math.floor(80000 / Math.max(1, items.length))));
    return items.map(function (item, index) {
      var abstract = item.abstract || 'Abstract not available';
      if (abstract.length > abstractLimit) abstract = abstract.slice(0, abstractLimit) + ' [truncated for AI context]';
      return [
        '[SOURCE ' + (index + 1) + ']',
        'Title: ' + item.title,
        'Authors: ' + (item.authors && item.authors.length ? item.authors.join(', ') : 'Unknown'),
        'Citation label: ' + item.authorLabel + ' (' + (item.year || 'n.d.') + ')',
        'Year: ' + (item.year || 'n.d.'),
        'Journal: ' + (item.journal || 'Unknown'),
        'DOI: ' + (item.doi || 'Not available'),
        'URL: ' + (item.url || 'Not available'),
        'Public metadata: ' + (item.sources || []).join(' + '),
        'Abstract: ' + abstract
      ].join('\n');
    }).join('\n\n');
  }

  function formatMarkdown(results, query) {
    var lines = ['## 공개 학술검색 결과', '', '- 검색어: ' + cleanText(query), '- 결과: ' + (results || []).length + '건', ''];
    (results || []).forEach(function (item, index) {
      lines.push('### ' + (index + 1) + '. ' + item.title);
      lines.push('');
      lines.push('- 저자·연도: ' + item.authorLabel + ' (' + (item.year || 'n.d.') + ')');
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

  root.AIChatAcademicSearch = Object.freeze({
    search: search,
    formatEvidence: formatEvidence,
    formatMarkdown: formatMarkdown
  });
})(window);
