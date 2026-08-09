const assert = require('node:assert/strict');
const test = require('node:test');
const coordinatorApi = require('../js/render/render-coordinator.js');

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test('same consumer is debounced to its final scheduled render', async () => {
    const coordinator = coordinatorApi.create(globalThis);
    const calls = [];
    for (let i = 0; i < 100; i += 1) {
        coordinator.schedule('mini-preview', () => calls.push(i), { delayMs: 5, revision: i });
    }
    await wait(20);
    assert.deepEqual(calls, [99]);
    const stats = coordinator.getStats();
    assert.equal(stats.executed, 1);
    assert.equal(stats.pending, 0);
    assert.equal(stats.cancelled, 99);
});

test('stale revisions are skipped before callback execution', async () => {
    const coordinator = coordinatorApi.create(globalThis);
    let currentRevision = 2;
    let calls = 0;
    coordinator.schedule('toc', () => { calls += 1; }, {
        delayMs: 1,
        revision: 1,
        isCurrent: (revision) => revision === currentRevision
    });
    await wait(10);
    assert.equal(calls, 0);
    assert.equal(coordinator.getStats().staleSkipped, 1);

    coordinator.schedule('toc', () => { calls += 1; }, {
        delayMs: 1,
        revision: currentRevision,
        isCurrent: (revision) => revision === currentRevision
    });
    await wait(10);
    assert.equal(calls, 1);
});

