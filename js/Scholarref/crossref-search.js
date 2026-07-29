(function (global) {
  'use strict';

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
    return cleanText(value)
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .toLowerCase();
  }

  function normalizeTitle(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();
  }

  function publishedYear(item) {
    var candidates = [
      item && item.published,
      item && item['published-print'],
      item && item['published-online'],
      item && item.issued,
      item && item.created
    ];
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

  function fromCrossref(item) {
    var rawAuthors = Array.isArray(item && item.author) ? item.author : [];
    var authors = rawAuthors.map(function (author) {
      return cleanText([author && author.given, author && author.family].filter(Boolean).join(' '));
    }).filter(Boolean);
    var doi = normalizeDoi(item && item.DOI);
    var title = Array.isArray(item && item.title) ? item.title[0] : item && item.title;
    var journal = Array.isArray(item && item['container-title'])
      ? item['container-title'][0]
      : item && item['container-title'];
    return {
      id: doi ? 'https://doi.org/' + doi : cleanText(item && item.URL),
      sources: ['Crossref'],
      title: cleanText(title),
      authors: authors,
      apaAuthors: rawAuthors.map(function (author) {
        return {
          given: cleanText(author && author.given),
          family: cleanText(author && author.family),
          name: cleanText(author && author.name)
        };
      }),
      authorLabel: authorLabel(authors),
      year: publishedYear(item),
      journal: cleanText(journal),
      volume: cleanText(item && item.volume),
      issue: cleanText(item && item.issue),
      page: cleanText(item && (item.page || item.article_number)),
      doi: doi,
      url: doi ? 'https://doi.org/' + doi : cleanText(item && item.URL),
      abstract: cleanText(item && item.abstract).slice(0, 6000),
      type: cleanText(item && item.type)
    };
  }

  function recordKey(item) {
    if (item.doi) return 'doi:' + item.doi;
    return 'title:' + normalizeTitle(item.title);
  }

  function mergeRecords(records, count) {
    var merged = [];
    var byKey = new Map();
    (records || []).forEach(function (item) {
      if (!item || !item.title) return;
      var key = recordKey(item);
      if (!key || key === 'title:') return;
      var existing = byKey.get(key);
      if (!existing) {
        var copy = Object.assign({}, item);
        byKey.set(key, copy);
        merged.push(copy);
        return;
      }
      if (!existing.abstract && item.abstract) existing.abstract = item.abstract;
      if (!existing.doi && item.doi) existing.doi = item.doi;
      if (!existing.url && item.url) existing.url = item.url;
      if (!existing.journal && item.journal) existing.journal = item.journal;
      if (!existing.year && item.year) existing.year = item.year;
      if ((!existing.authors || !existing.authors.length) && item.authors && item.authors.length) {
        existing.authors = item.authors;
        existing.authorLabel = item.authorLabel;
      }
    });
    return merged.slice(0, count);
  }

  async function fetchRecords(query, rows, options) {
    var opts = options || {};
    var params = new URLSearchParams();
    var filters = [];
    params.set('query.bibliographic', query);
    params.set('rows', String(rows));
    if (opts.requireAbstract !== false) filters.push('has-abstract:true');
    if (Number(opts.fromYear) > 0) {
      filters.push('from-pub-date:' + Math.floor(Number(opts.fromYear)) + '-01-01');
    }
    if (filters.length) params.set('filter', filters.join(','));

    var response = await fetch(CROSSREF_API + '?' + params.toString(), {
      headers: { Accept: 'application/json' },
      signal: opts.signal
    });
    if (!response.ok) throw new Error('Crossref 검색 오류: HTTP ' + response.status);
    var data = await response.json();
    var items = data && data.message && Array.isArray(data.message.items) ? data.message.items : [];
    return items.map(fromCrossref);
  }

  async function search(query, count, options) {
    var q = cleanText(query).slice(0, 500);
    if (!q) throw new Error('학술검색어가 없습니다.');
    var limit = Math.max(1, Math.min(MAX_RESULTS, Number(count) || 15));
    var rows = Math.min(100, Math.max(25, limit * 3));
    var opts = options || {};
    var progress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var searchQuery = opts.reviewOnly === true ? q + ' (review OR survey)' : q;
    var periodYears = Math.max(0, Number(opts.periodYears) || 0);
    var fromYear = periodYears > 0 ? new Date().getFullYear() - periodYears + 1 : 0;
    var warnings = [];

    progress('Crossref에서 공개 초록을 검색하는 중...');
    var abstractRecords = [];
    try {
      abstractRecords = await fetchRecords(searchQuery, rows, {
        signal: opts.signal,
        requireAbstract: true,
        fromYear: fromYear
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      warnings.push(cleanText(error && (error.message || error)));
    }

    var results = mergeRecords(abstractRecords, limit);
    if (results.length < limit) {
      progress('Crossref 서지정보를 추가로 검색하는 중...');
      try {
        var metadataRecords = await fetchRecords(searchQuery, rows, {
          signal: opts.signal,
          requireAbstract: false,
          fromYear: fromYear
        });
        results = mergeRecords(abstractRecords.concat(metadataRecords), limit);
      } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        var warning = cleanText(error && (error.message || error));
        if (warning && warnings.indexOf(warning) < 0) warnings.push(warning);
      }
    }

    if (!results.length) {
      throw new Error(warnings.filter(Boolean).join(' / ') || 'Crossref 검색 결과가 없습니다.');
    }
    progress('Crossref 검색 결과 ' + results.length + '건을 정리하는 중...');
    return {
      results: results,
      warnings: warnings.filter(Boolean),
      requestedCount: limit,
      abstractCount: results.filter(function (item) {
        return !!cleanText(item && item.abstract);
      }).length,
      queryUsed: q
    };
  }

  function formatMarkdown(results, query) {
    var items = Array.isArray(results) ? results : [];
    var lines = [
      '# Crossref 학술검색 결과',
      '',
      '검색어: ' + cleanText(query),
      '',
      '검색 결과: ' + items.length + '건',
      ''
    ];
    items.forEach(function (item, index) {
      var authors = Array.isArray(item.authors) ? item.authors.map(cleanText).filter(Boolean) : [];
      var authorText = authors.length ? authorLabel(authors) : '저자 정보 없음';
      lines.push('## ' + (index + 1) + '. ' + cleanText(item.title));
      lines.push('');
      lines.push('저자·연도: ' + authorText + ' (' + (item.year || '연도 정보 없음') + ')');
      lines.push('');
      lines.push('학술지: ' + (cleanText(item.journal) || '학술지 정보 없음'));
      lines.push('');
      lines.push('DOI: ' + (item.doi ? 'https://doi.org/' + item.doi : 'DOI 정보 없음'));
      lines.push('');
      lines.push('메타데이터: Crossref');
      lines.push('');
      lines.push('### 초록');
      lines.push('');
      lines.push(cleanText(item.abstract) || 'Crossref 공개 메타데이터에서 초록을 제공하지 않음');
      lines.push('');
    });
    return lines.join('\n');
  }

  function apaInitials(given) {
    return cleanText(given).split(/\s+/).filter(Boolean).map(function (part) {
      return part.split('-').filter(Boolean).map(function (piece) {
        return piece.charAt(0).toUpperCase() + '.';
      }).join('-');
    }).join(' ');
  }

  function formatApaAuthors(item) {
    var authors = Array.isArray(item && item.apaAuthors) ? item.apaAuthors : [];
    var names = authors.map(function (author) {
      if (author.family) {
        var initials = apaInitials(author.given);
        return author.family + (initials ? ', ' + initials : '');
      }
      return author.name || '';
    }).filter(Boolean);
    if (!names.length) {
      names = (Array.isArray(item && item.authors) ? item.authors : []).map(cleanText).filter(Boolean);
    }
    if (!names.length) return '저자 정보 없음';
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
  }

  function formatApaReference(item) {
    var parts = [];
    var authors = formatApaAuthors(item);
    var year = item && item.year ? String(item.year) : 'n.d.';
    var title = cleanText(item && item.title) || '제목 정보 없음';
    var journal = cleanText(item && item.journal);
    var volume = cleanText(item && item.volume);
    var issue = cleanText(item && item.issue);
    var page = cleanText(item && item.page);
    var doi = normalizeDoi(item && item.doi);

    parts.push(authors + ' (' + year + ').');
    parts.push(title.replace(/\.$/, '') + '.');
    if (journal) {
      var publication = journal;
      if (volume) publication += ', ' + volume;
      if (issue) publication += '(' + issue + ')';
      if (page) publication += ', ' + page;
      parts.push(publication.replace(/\.$/, '') + '.');
    }
    if (doi) parts.push('https://doi.org/' + doi);
    else if (item && item.url) parts.push(cleanText(item.url));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function formatApaList(results) {
    return (Array.isArray(results) ? results : []).map(formatApaReference).filter(Boolean);
  }

  global.ScholarCrossrefSearch = Object.freeze({
    search: search,
    formatMarkdown: formatMarkdown,
    formatApaReference: formatApaReference,
    formatApaList: formatApaList
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.ScholarCrossrefSearch;
  }
})(typeof window !== 'undefined' ? window : globalThis);
