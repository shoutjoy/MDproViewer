(function (global) {
  'use strict';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = require('./crossref/search.js');
    return;
  }
  if (global.ScholarCrossrefSearch || typeof document === 'undefined') return;

  var current = document.currentScript && document.currentScript.src;
  var script = document.createElement('script');
  script.charset = 'utf-8';
  script.src = current ? new URL('./crossref/search.js', current).href : './js/Scholarref/crossref/search.js';
  document.head.appendChild(script);
})(typeof window !== 'undefined' ? window : globalThis);
