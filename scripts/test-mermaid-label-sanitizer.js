'use strict';

const assert = require('assert');
const sanitizer = require('../js/mermaid/mermaid-label-sanitizer.js');

const source = [
    'graph TD',
    'subgraph 에빙하우스의 망각 곡선',
    'A[학습 직후 100%] -->|20분 후 (붉은 선)| B[58% (-42%)]',
    'A --> E[반복 학습 개입 시 녹색 선]',
    'end',
    'style A fill:#f99,stroke:#333,stroke-width:2px',
    'classDef forgetting fill:#ffdddd,stroke:#f00',
    'class A,B forgetting'
].join('\n');

const actual = sanitizer.preprocess(source);
assert(actual.includes('A["학습 직후 100%"] -->|"20분 후 (붉은 선)"| B["58% (-42%)"]'));
assert(actual.includes('A --> E["반복 학습 개입 시 녹색 선"]'));
assert(actual.includes('style A fill:#f99,stroke:#333,stroke-width:2px'));
assert(actual.includes('classDef forgetting fill:#ffdddd,stroke:#f00'));

const nestedText = sanitizer.preprocess('flowchart LR\nA[배열 [0] (첫 값)] --> B["이미 안전함"]');
assert(nestedText.includes('A["배열 [0] (첫 값)"]'));
assert(nestedText.includes('B["이미 안전함"]'));

const shapes = sanitizer.preprocess('graph TD\nA[[서브루틴]] --> B[(데이터베이스)]');
assert(shapes.includes('A[[서브루틴]]'));
assert(shapes.includes('B[(데이터베이스)]'));

console.log('mermaid-label-sanitizer tests passed');
