'use strict';

const assert = require('assert');

global.window = global;
let requestedUrl = '';
global.fetch = async function (url) {
  requestedUrl = String(url);
  return {
    ok: true,
    json: async function () {
      return {
        message: {
          items: [{
            DOI: '10.1234/example',
            title: ['온라인 영어 독서프로그램 연구'],
            'container-title': ['The Korea English Education Society'],
            author: [
              { given: 'Jisuk', family: 'Lee' },
              { given: 'Jeongryeol', family: 'Kim' }
            ],
            published: { 'date-parts': [[2021]] },
            volume: '20',
            issue: '4',
            page: '163-180',
            abstract: '<jats:p>Public abstract text.</jats:p>',
            type: 'journal-article'
          }]
        }
      };
    }
  };
};

const api = require('../js/Scholarref/crossref-search.js');

(async function () {
  assert(api && typeof api.search === 'function');
  assert.strictEqual(typeof api.formatMarkdown, 'function');

  const result = await api.search('online English reading', 15, {
    periodYears: 5,
    reviewOnly: true
  });
  assert.strictEqual(result.results.length, 1);
  assert(requestedUrl.includes('api.crossref.org/works'));
  assert(requestedUrl.includes('rows=45'));
  assert(requestedUrl.includes('from-pub-date'));

  const markdown = api.formatMarkdown(result.results, result.queryUsed);
  assert(markdown.includes('## 1. 온라인 영어 독서프로그램 연구'));
  assert(markdown.includes('저자·연도: Jisuk Lee & Jeongryeol Kim (2021)'));
  assert(markdown.includes('학술지: The Korea English Education Society'));
  assert(markdown.includes('DOI: https://doi.org/10.1234/example'));
  assert(markdown.includes('메타데이터: Crossref'));
  assert(markdown.includes('### 초록'));
  const apa = api.formatApaList(result.results);
  assert.strictEqual(apa.length, 1);
  assert(apa[0].includes('Lee, J., & Kim, J. (2021).'));
  assert(apa[0].includes('The Korea English Education Society, 20(4), 163-180.'));
  assert(apa[0].includes('https://doi.org/10.1234/example'));

  console.log('academic Crossref search tests passed');
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
