const assert = require('assert');

global.window = global;
require('../js/Scholarref/scholarref.js');

const source = 'Lee, J., & Kim, J. (2021). Online English reading. The Korea English Education Society, 20(4), 163-180. https://doi.org/10.18649/jkees.2021.20.4.163';
const expectedMarkdown = 'Lee, J., & Kim, J. (2021). Online English reading. *The Korea English Education Society, 20*(4), 163-180. https://doi.org/10.18649/jkees.2021.20.4.163';

assert.strictEqual(
  global.ScholarRef.formatApaReferenceMarkdown(source),
  expectedMarkdown
);
assert.strictEqual(
  global.ScholarRef.formatApaReferenceMarkdown(expectedMarkdown),
  expectedMarkdown,
  '이미 서식이 있는 참고문헌은 이탤릭 기호가 중복되면 안 됩니다.'
);
assert.ok(
  global.ScholarRef.formatApaReferenceHtml(source).includes('<em>The Korea English Education Society, 20</em>(4)'),
  '화면 표시에서는 학술지명과 권만 em 요소여야 합니다.'
);
assert.ok(
  global.ScholarRef.formatApaReferenceHtml(source).includes('target="_blank" rel="noopener noreferrer"'),
  '저장 목록의 DOI 링크는 새 탭으로 열려야 합니다.'
);
assert.strictEqual(
  global.ScholarRef.formatApaReferenceMarkdown('Kim, J. (2024). Book title. Publisher.'),
  'Kim, J. (2024). Book title. Publisher.',
  '학술지 패턴이 아닌 참고문헌은 변경하지 않아야 합니다.'
);

console.log('Scholarref APA format tests passed.');
