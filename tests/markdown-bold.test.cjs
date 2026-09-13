const test = require('node:test');
const assert = require('node:assert/strict');

const markdownBold = require('../js/Markdown_bold.js');

test('bold can span an inline-code segment', () => {
    assert.equal(
        markdownBold.preprocessBold('**앞 `const value = 1` 뒤**'),
        '<b>앞 `const value = 1` 뒤</b>'
    );
});

test('bold delimiters inside inline code remain literal', () => {
    assert.equal(
        markdownBold.preprocessBold('`**코드 안 별표**`와 **바깥 볼드**'),
        '`**코드 안 별표**`와 <b>바깥 볼드</b>'
    );
});

test('inline code containing bold-like characters does not close outer bold', () => {
    assert.equal(
        markdownBold.preprocessBold('**앞 `a ** b` 뒤**'),
        '<b>앞 `a ** b` 뒤</b>'
    );
});

test('an unmatched backtick is treated as a normal special character in bold', () => {
    assert.equal(markdownBold.preprocessBold('**앞 ` 뒤**'), '<b>앞 ` 뒤</b>');
});
