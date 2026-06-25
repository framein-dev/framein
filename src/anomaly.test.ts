import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectThrash } from './anomaly.js';
import type { LedgerEntry } from './types.js';

let seq = 0;
function e(kind: string, target = ''): LedgerEntry {
  return { id: ++seq, ts: '', kind, target, detail: '' };
}

test('quiet ledger produces no signals', () => {
  assert.deepEqual(detectThrash([e('turn'), e('edit', 'a.ts'), e('commit')]), []);
});

test('repeated edits of the same file raise a thrash signal', () => {
  const sig = detectThrash([e('edit', 'x.ts'), e('edit', 'x.ts'), e('edit', 'x.ts')]);
  assert.equal(sig.length, 1);
  assert.equal(sig[0].kind, 'repeated-edits');
  assert.equal(sig[0].target, 'x.ts');
  assert.equal(sig[0].count, 3);
});

test('repeated failures of the same test raise a signal (default threshold 2)', () => {
  const sig = detectThrash([e('test-fail', 't1'), e('edit', 'a'), e('test-fail', 't1')]);
  assert.ok(sig.some((s) => s.kind === 'repeated-failure' && s.target === 't1'));
});

test('many turns with no edit/commit raise a no-progress signal', () => {
  const sig = detectThrash([e('turn'), e('turn'), e('turn'), e('turn'), e('turn')]);
  assert.ok(sig.some((s) => s.kind === 'no-progress' && s.count === 5));
});

test('a recent edit resets the no-progress counter', () => {
  const sig = detectThrash([e('turn'), e('turn'), e('turn'), e('edit', 'a'), e('turn'), e('turn')]);
  assert.ok(!sig.some((s) => s.kind === 'no-progress'));
});

test('thresholds are tunable', () => {
  const entries = [e('edit', 'y'), e('edit', 'y')];
  assert.equal(detectThrash(entries).length, 0);                       // default 3
  assert.equal(detectThrash(entries, { repeatedEdits: 2 }).length, 1); // lowered
});
