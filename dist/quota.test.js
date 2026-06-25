import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectQuotaSignal } from './quota.js';
import { selectAgent } from './roles.js';
test('detectQuotaSignal: recognizes rate-limit / quota / overload, ignores clean output', () => {
    assert.equal(detectQuotaSignal('claude', 'Error: 429 rate limit exceeded').kind, 'rate-limit');
    assert.equal(detectQuotaSignal('claude', 'overloaded_error: server is busy').kind, 'overloaded');
    assert.equal(detectQuotaSignal('codex', "You've hit your usage limit").kind, 'quota');
    assert.equal(detectQuotaSignal('gemini', 'RESOURCE_EXHAUSTED: Quota exceeded').kind, 'quota');
    const clean = detectQuotaSignal('claude', 'done. wrote 3 files.');
    assert.equal(clean.exhausted, false);
    assert.equal(clean.kind, undefined);
});
test('detectQuotaSignal: parses retry-after (seconds and minutes) when present', () => {
    assert.equal(detectQuotaSignal('claude', 'rate limit. Retry-After: 60').retryAfterSec, 60);
    assert.equal(detectQuotaSignal('codex', 'rate limited, try again in 2 minutes').retryAfterSec, 120);
    assert.equal(detectQuotaSignal('gemini', 'quota exceeded').retryAfterSec, undefined);
});
test('quota signal drives failover: an exhausted agent is skipped in routing', () => {
    const sig = detectQuotaSignal('codex', '429 rate limit'); // reviewer defaults to codex first
    assert.equal(sig.exhausted, true);
    const picked = selectAgent(['codex', 'claude'], { role: 'reviewer', authMode: {}, unavailable: { codex: sig.exhausted } });
    assert.equal(picked, 'claude'); // failover to the next-priority agent
    // when every candidate is unavailable, selection yields null (caller surfaces "all exhausted")
    assert.equal(selectAgent(['codex'], { role: 'reviewer', authMode: {}, unavailable: { codex: true } }), null);
});
