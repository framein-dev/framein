import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustPlan, parseDuration, DEFAULT_TRUST_TTL_SEC } from './trust.js';
test('trustPlan: per-agent bypass flags + time-box + safety warnings', () => {
    assert.deepEqual(trustPlan('claude').flags, ['--dangerously-skip-permissions']);
    assert.deepEqual(trustPlan('codex').flags, ['--full-auto']);
    assert.deepEqual(trustPlan('gemini').flags, ['--yolo']);
    assert.equal(trustPlan('claude').ttlSec, DEFAULT_TRUST_TTL_SEC); // default time-box
    assert.equal(trustPlan('claude', { ttlSec: 600 }).ttlSec, 600);
    assert.ok(trustPlan('claude').warnings.some((w) => /not a sandbox/i.test(w))); // honest limit
});
test('parseDuration: s/m/h units, bare number = seconds, junk = null', () => {
    assert.equal(parseDuration('90s'), 90);
    assert.equal(parseDuration('30m'), 1800);
    assert.equal(parseDuration('1h'), 3600);
    assert.equal(parseDuration('45'), 45);
    assert.equal(parseDuration('nope'), null);
    assert.equal(parseDuration(''), null);
});
