const assert = require('assert');
const MarkdownBold = require('../js/Markdown_bold.js');

const mixed = '- **정서적 몰입 (Affective Commitment):** **"내가 이 회사에** ***있고 싶어서*** **남고 싶다."**라는 감정';
assert.strictEqual(
    MarkdownBold.preprocessBold(mixed),
    '- <b>정서적 몰입 (Affective Commitment):</b> <b>"내가 이 회사에</b> <b><i>있고 싶어서</i></b> <b>남고 싶다."</b>라는 감정'
);

assert.strictEqual(
    MarkdownBold.preprocessBold('**"따옴표 (괄호): [대괄호], 느낌표!"**'),
    '<b>"따옴표 (괄호): [대괄호], 느낌표!"</b>'
);

assert.strictEqual(
    MarkdownBold.preprocessBold('**굵게 안의 *기울임* 처리**'),
    '<b>굵게 안의 <i>기울임</i> 처리</b>'
);

assert.strictEqual(
    MarkdownBold.preprocessBold('`**인라인 코드**`\n```\n**코드 블록**\n```'),
    '`**인라인 코드**`\n```\n**코드 블록**\n```'
);

console.log('Markdown bold special-character tests passed.');
