import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdrDigest } from './adr.js';
import type { Adr } from './types.js';

function adr(id: number, title: string): Adr {
  return { id, createdAt: '', title, status: 'accepted', context: '', decision: title, consequences: '', authorAgent: null, supersedes: null };
}

test('empty digest message', () => {
  assert.match(buildAdrDigest([]), /No decisions/);
});

test('digest is newest-first and bounded by max', () => {
  const adrs = Array.from({ length: 15 }, (_, i) => adr(i + 1, `decision ${i + 1}`));
  const d = buildAdrDigest(adrs, { max: 10 });
  assert.match(d, /15 decision/);
  assert.match(d, /ADR-15/);            // newest present
  assert.match(d, /earlier decision/);  // overflow note present
  assert.ok(!d.includes('ADR-5'));      // outside the window
});
