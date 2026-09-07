const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const window = {};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../js/a4-pages.js'), 'utf8'), { window });
const api = window.A4Pages;
assert.equal(api.parse('# Existing document\n\nHello'), null);
const pages = [{ direction: 'portrait', text: '한글😀\n\n# 제목\n' }, { direction: 'landscape', text: '' }, { direction: 'portrait', text: '끝' }];
assert.equal(JSON.stringify(api.parse(api.serialize(pages))), JSON.stringify(pages));
const original = '한글😀 abc\n'.repeat(100);
let remaining = original, restored = '', count = 0;
while (remaining) {
    const [head, tail] = api.splitToFit(remaining, text => Array.from(text).length <= 37);
    assert.ok(head.length); restored += head; remaining = tail; count++;
    assert.ok(!/[\uD800-\uDBFF]$/.test(head));
}
assert.equal(restored, original); assert.ok(count > 1);
console.log('A4 persistence, legacy isolation and Unicode pagination passed.');
