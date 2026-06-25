import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRepoStats, explainRoute, renderRouteExplain, renderStats } from './stats.js';
import type { LedgerEntry } from './types.js';

const led = (kind: string, target = ''): LedgerEntry => ({ id: 0, ts: '', kind, target, detail: '' });

test('computeRepoStats: parses delegated / delegate-fail / quota from the ledger', () => {
  const stats = computeRepoStats([
    led('delegated', 'reviewer:codex'),
    led('delegated', 'reviewer:codex'),
    led('delegate-fail', 'implementer:claude'),
    led('quota', 'codex'),
    led('edit', 'x.ts'), // ignored
  ]);
  assert.deepEqual(stats.codex, { delegations: 2, failures: 0, quotaHits: 1 });
  assert.deepEqual(stats.claude, { delegations: 1, failures: 1, quotaHits: 0 });
});

test('explainRoute: better local record wins and the reasons explain why', () => {
  const stats = { codex: { delegations: 5, failures: 0, quotaHits: 0 }, claude: { delegations: 5, failures: 4, quotaHits: 0 } };
  const e = explainRoute('reviewer', { authMode: {} }, stats);
  assert.equal(e.agent, 'codex');
  assert.ok(e.reasons.some((r) => /success/i.test(r)));
  assert.ok(e.alternative); // claude as the runner-up with a confidence
});

test('explainRoute: a strong local record overrides the default role priority', () => {
  // reviewer defaults to codex first, but here codex has a terrible local record
  const stats = { codex: { delegations: 5, failures: 5, quotaHits: 3 }, claude: { delegations: 5, failures: 0, quotaHits: 0 } };
  const e = explainRoute('reviewer', { authMode: {} }, stats);
  assert.equal(e.agent, 'claude');
});

test('renderStats / renderRouteExplain are readable; empty stats are graceful', () => {
  assert.match(renderStats({}), /No repo-local stats/i);
  assert.match(renderStats({ codex: { delegations: 2, failures: 0, quotaHits: 0 } }), /codex: 2 delegations/);
  assert.match(renderRouteExplain(explainRoute('reviewer', { authMode: {} }, { codex: { delegations: 3, failures: 0, quotaHits: 0 } })), /Selected codex as reviewer/);
});
