import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDebate, debateStatus, challengeCount, renderDebate, type Debate } from './disagree.js';

test('debate: proposal -> blocking challenge -> lead accepts => resolved', () => {
  const d = newDebate('use a transaction', { text: 'use a transaction' });
  assert.deepEqual(debateStatus(d), { state: 'awaiting-challenge' });
  d.entries.push({ kind: 'challenge', challenge: { verdict: 'challenge', claim: 'race remains', requiredChange: 'add unique index' } });
  assert.deepEqual(debateStatus(d), { state: 'awaiting-revision', required: 'add unique index' });
  d.entries.push({ kind: 'revision', revision: { text: 'added unique index', accepted: true } });
  assert.deepEqual(debateStatus(d), { state: 'resolved', how: 'lead-accepted' });
});

test('debate: reviewer accept resolves it', () => {
  const d = newDebate('t', { text: 't' });
  d.entries.push({ kind: 'challenge', challenge: { verdict: 'accept' } });
  assert.deepEqual(debateStatus(d), { state: 'resolved', how: 'accepted-by-reviewer' });
});

test('debate: two blocking rounds without agreement => escalate with two options', () => {
  const d = newDebate('topic', { text: 'approach A' });
  d.entries.push({ kind: 'challenge', challenge: { verdict: 'challenge', requiredChange: 'do B' } });
  d.entries.push({ kind: 'revision', revision: { text: 'keep A', accepted: false } });
  d.entries.push({ kind: 'challenge', challenge: { verdict: 'challenge', requiredChange: 'really do B' } });
  const st = debateStatus(d);
  assert.equal(st.state, 'escalate');
  if (st.state === 'escalate') {
    assert.equal(challengeCount(d), 2);
    assert.equal(st.options.length, 2);
    assert.match(st.options[0], /keep A/);     // lead position
    assert.match(st.options[1], /really do B/); // reviewer's required change
  }
});

test('renderDebate: shows the exchange and the terminal status', () => {
  const d = newDebate('t', { text: 'p' });
  d.entries.push({ kind: 'challenge', challenge: { verdict: 'challenge', requiredChange: 'fix it' } });
  const out = renderDebate(d);
  assert.match(out, /proposal: p/);
  assert.match(out, /require: fix it/);
  assert.match(out, /Awaiting lead revision/);
});
