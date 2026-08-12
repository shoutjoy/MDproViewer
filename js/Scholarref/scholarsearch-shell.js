(function (global) {
  'use strict';

  if (typeof document === 'undefined' || global.ScholarSearchShell) return;
  var current = document.currentScript && document.currentScript.src;

  function source(relative, fallback) {
    return current ? new URL(relative, current).href : fallback;
  }

  function load(url, ready) {
    if (ready()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.charset = 'utf-8';
      script.src = url;
      script.onload = function () { ready() ? resolve() : reject(new Error('Scholar module API missing: ' + url)); };
      script.onerror = function () { reject(new Error('Scholar module load failed: ' + url)); };
      document.head.appendChild(script);
    });
  }

  load(
    source('./crossref/search.js', './js/Scholarref/crossref/search.js'),
    function () { return !!global.ScholarCrossrefSearch; }
  ).then(function () {
    return load(
      source('./ui/scholarsearch-shell.js', './js/Scholarref/ui/scholarsearch-shell.js'),
      function () { return !!global.ScholarSearchShell; }
    );
  }).catch(function (error) {
    console.error(error);
  });
})(window);
