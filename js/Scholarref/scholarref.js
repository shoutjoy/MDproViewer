(function (global) {
  'use strict';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = require('./reference/scholarref.js');
    return;
  }
  if (global.ScholarRef || typeof document === 'undefined') return;

  var current = document.currentScript && document.currentScript.src;
  var script = document.createElement('script');
  script.charset = 'utf-8';
  script.src = current ? new URL('./reference/scholarref.js', current).href : './js/Scholarref/reference/scholarref.js';
  document.head.appendChild(script);
})(typeof window !== 'undefined' ? window : globalThis);
