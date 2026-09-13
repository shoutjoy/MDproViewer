/* AI Jena web-search adapter: integrated service first, same-origin API fallback. */
(function (root) {
  'use strict';

  var INTEGRATED_BASE = 'http://127.0.0.1:8765/api';

  function sameOriginSearchUrl(params) {
    try {
      if (root.location && /^https?:$/.test(root.location.protocol)) {
        return new URL('/api/web-search/?' + params, root.location.href).href;
      }
    } catch (_) {}
    return '';
  }

  async function readJson(response) {
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || payload.detail || '인터넷 검색에 실패했습니다.');
    }
    return payload;
  }

  async function webSearch(query, count, mode, options) {
    var value = String(query || '').trim().slice(0, 500);
    if (!value) throw new Error('인터넷 검색어를 입력하세요.');
    var limit = Math.max(1, Math.min(50, Math.round(Number(count) || 10)));
    var searchMode = mode === 'reasoning' ? 'reasoning' : 'quick';
    var params = new URLSearchParams({ q: value, count: String(limit), mode: searchMode });
    var request = { cache: 'no-store', signal: options && options.signal };
    var primaryError = null;
    var sameOriginUrl = sameOriginSearchUrl(params);
    if (sameOriginUrl) {
      try {
        return await readJson(await fetch(sameOriginUrl, request));
      } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        primaryError = error;
      }
    }
    try {
      return await readJson(await fetch(INTEGRATED_BASE + '/web-search/?' + params, request));
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new Error((error && error.message) || (primaryError && primaryError.message) || '인터넷 검색 서비스를 사용할 수 없습니다.');
    }
  }

  root.AIJenaLocalAPI = Object.freeze({ webSearch: webSearch });
})(window);
