#!/usr/bin/env node
'use strict';

const { performance } = require('node:perf_hooks');
const mdComment = require('../js/md-comment.js');

const DEFAULT_SIZES = [10_000, 100_000, 300_000, 600_000];

function repeatToSize(unit, size) {
    const source = String(unit || 'x');
    return source.repeat(Math.ceil(size / source.length)).slice(0, size);
}

function createFixture(kind, size) {
    switch (kind) {
        case 'comments':
            return repeatToSize('본문 한 줄 <!-- 짧은 주석 --> 다음 문장\n', size);
        case 'multiline-comments':
            return repeatToSize('본문\n<!-- 첫 줄 주석\n둘째 줄 주석 -->\n다음 본문\n', size);
        case 'unterminated-comment': {
            const suffix = '<!-- 닫히지 않은 주석 표식';
            const prefix = repeatToSize('일반 본문과 **Markdown** 내용\n', Math.max(0, size - suffix.length));
            return (prefix + suffix).slice(0, size);
        }
        case 'rich-markdown':
            return repeatToSize([
                '# 제목',
                '',
                '본문 $E = mc^2$ 와 [DOI](https://doi.org/10.1000/test)',
                '',
                '```mermaid',
                'flowchart LR',
                '  A --> B',
                '```',
                '',
                '![내부 이미지](internal://benchmark-image)',
                ''
            ].join('\n'), size);
        case 'plain':
        default:
            return repeatToSize('일반 본문과 **Markdown** 내용입니다.\n', size);
    }
}

function percentile(sorted, ratio) {
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
}

function measureOperation(operation, source, iterations) {
    for (let i = 0; i < Math.min(5, iterations); i += 1) operation(source);

    const samples = [];
    for (let i = 0; i < iterations; i += 1) {
        const startedAt = performance.now();
        operation(source);
        samples.push(performance.now() - startedAt);
    }
    samples.sort((a, b) => a - b);
    const total = samples.reduce((sum, value) => sum + value, 0);
    return {
        iterations,
        averageMs: Number((total / samples.length).toFixed(3)),
        p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
        p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
        maxMs: Number(samples[samples.length - 1].toFixed(3))
    };
}

function getIterations(size) {
    if (size <= 10_000) return 200;
    if (size <= 100_000) return 60;
    if (size <= 300_000) return 25;
    return 12;
}

function runBenchmark(options) {
    const settings = options || {};
    const sizes = Array.isArray(settings.sizes) && settings.sizes.length
        ? settings.sizes
        : DEFAULT_SIZES;
    const fixtureKinds = settings.fixtureKinds || [
        'plain',
        'comments',
        'multiline-comments',
        'unterminated-comment',
        'rich-markdown'
    ];
    const results = [];

    fixtureKinds.forEach((fixtureKind) => {
        sizes.forEach((size) => {
            const source = createFixture(fixtureKind, size);
            const iterations = getIterations(size);
            results.push({
                fixture: fixtureKind,
                chars: source.length,
                highlight: measureOperation(mdComment.createHighlightMarkup, source, iterations),
                hideForRender: measureOperation(mdComment.stripForRender, source, iterations)
            });
        });
    });

    return {
        generatedAt: new Date().toISOString(),
        runtime: process.version,
        scope: 'Pure string processing only; browser DOM, style and layout costs are excluded.',
        results
    };
}

if (require.main === module) {
    process.stdout.write(JSON.stringify(runBenchmark(), null, 2) + '\n');
}

module.exports = {
    DEFAULT_SIZES,
    createFixture,
    measureOperation,
    runBenchmark
};
