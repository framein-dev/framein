import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRescue, renderRescue } from './rescue.js';
const sig = (over = {}) => ({ kind: 'repeated-failure', target: 'auth.test.ts', count: 4, message: "'auth.test.ts' failed 4× — stuck", ...over });
test('buildRescue: not triggered when there are no signals', () => {
    const r = buildRescue([], {});
    assert.equal(r.triggered, false);
    assert.equal(r.options.length, 0);
});
test('buildRescue: with a last-green checkpoint offers diagnose / rewind / continue', () => {
    const r = buildRescue([sig()], { lastGreen: { sha: '8f2c1abdeadbeef', label: 'green' }, reviewer: 'codex' });
    assert.equal(r.triggered, true);
    assert.deepEqual(r.options.map((o) => o.key), ['A', 'B', 'C']);
    assert.match(r.options[0].label, /codex/); // diagnose via reviewer
    assert.match(r.options[1].label, /8f2c1ab/); // rewind to short sha
});
test('buildRescue: without a checkpoint there is no rewind option', () => {
    const r = buildRescue([sig()], { reviewer: 'codex' });
    assert.deepEqual(r.options.map((o) => o.key), ['A', 'B']);
    assert.doesNotMatch(r.options.map((o) => o.label).join(' '), /rewind/i);
});
test('renderRescue: shows signals, options, and the no-auto-action guarantee', () => {
    const out = renderRescue(buildRescue([sig()], { lastGreen: { sha: '8f2c1ab0000' } }));
    assert.match(out, /repair loop/i);
    assert.match(out, /auth\.test\.ts/);
    assert.match(out, /No action taken automatically/);
    assert.match(renderRescue(buildRescue([], {})), /No repair loop/i);
});
import { painter as _painter } from './ui/theme.js';
test('renderRescue colorizes with a color painter; default stays plain', () => {
    const c = _painter({ color: true, colorDepth: 4, unicode: true });
    assert.match(renderRescue(buildRescue([sig()], { lastGreen: { sha: '8f2c1ab0000' } }), c), /\x1b\[/);
    assert.doesNotMatch(renderRescue(buildRescue([sig()], {})), /\x1b\[/);
});
