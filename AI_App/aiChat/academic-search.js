/* Compatibility entrypoint. The implementation lives in js/Scholarref/ai/. */
(function (root) {
  'use strict';

  if (root.AIChatAcademicSearch || typeof document === 'undefined') return;
  var current = document.currentScript && document.currentScript.src;
  var script = document.createElement('script');
  script.charset = 'utf-8';
  script.src = current
    ? new URL('../../js/Scholarref/ai/academic-search.js', current).href
    : './js/Scholarref/ai/academic-search.js';
  document.head.appendChild(script);
})(window);
