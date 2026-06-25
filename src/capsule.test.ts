import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCapsule, renderCapsule } from './capsule.js';
import type { LedgerEntry } from './types.js';

const led = (kind: string, target = ''): LedgerEntry => ({ id: 0, ts: '', kind, target, detail: '' });

test('buildCapsule: carries goal, decisions, validation results, compressed recent activity', () => {
  const c = buildCapsule({
    goal: 'add Google login',
    decisions: [{ id: 12, title: 'keep session cookie' }],
    branch: 'feat/google-auth',
    lastGreen: '8f2c1abdead',
    changedFiles: ['src/auth/google.ts'],
    testSummary: { passed: 41, failed: 1 },
    ledger: [led('edit', 'a.ts'), led('test-fail', 't'), led('turn')],
  });
  assert.equal(c.goal, 'add Google login');
  assert.deepEqual(c.decisions, [{ id: 12, title: 'keep session cookie' }]);
  assert.deepEqual(c.evidence, { passed: 41, failed: 1 });
  assert.ok(c.recentActivity.length <= 8);
  assert.ok(c.recentActivity.some((a) => /edit a\.ts/.test(a)));
});

test('buildCapsule: surfaces the last delegation result (ingest from a live run)', () => {
  const c = buildCapsule({ goal: 'g', lastDelegation: { agent: 'claude', ok: true } });
  assert.deepEqual(c.lastDelegation, { agent: 'claude', ok: true });
  assert.match(renderCapsule(c), /last_delegation: claude \(ok\)/);
});

test('buildCapsule: surfaces an armed handoff target for model switches', () => {
  const c = buildCapsule({ goal: 'g', handoffTarget: 'gemini' });
  assert.equal(c.handoffTarget, 'gemini');
  assert.match(renderCapsule(c), /handoff: gemini \(armed\)/);
});

test('buildCapsule: derives a blocker from repeated test failures', () => {
  const c = buildCapsule({ ledger: [led('test-fail', 'auth.test.ts'), led('test-fail', 'auth.test.ts')] });
  assert.match(c.blocker ?? '', /auth\.test\.ts/);
});

test('buildCapsule: green current validation suppresses stale repeated-failure blockers', () => {
  const c = buildCapsule({
    testSummary: { passed: 8, failed: 0 },
    ledger: [led('test-fail', 'blog.test.ts'), led('test-fail', 'blog.test.ts')],
  });
  assert.equal(c.blocker, undefined);
});

test('buildCapsule: empty input is graceful (no crash)', () => {
  const c = buildCapsule({});
  assert.match(c.goal, /no task contract/i);
  assert.deepEqual(c.decisions, []);
  assert.equal(c.evidence, undefined);
});

test('renderCapsule: readable, shows known sections and omits empty ones', () => {
  const out = renderCapsule(buildCapsule({ goal: 'g', decisions: [{ id: 3, title: 'X' }], testSummary: { passed: 5, failed: 0 } }));
  assert.match(out, /task: g/);
  assert.match(out, /ADR-3/);
  assert.match(out, /validation/i);
  assert.doesNotMatch(out, /changed:/); // no changed files => section omitted
});
