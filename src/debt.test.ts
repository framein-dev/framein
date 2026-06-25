import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiffDebt, renderDebt } from './debt.js';
import { ownershipBrief } from './brief.js';

test('parseDiffDebt: counts added/removed lines, new deps, and TODOs', () => {
  const diff = [
    'diff --git a/package.json b/package.json',
    '+++ b/package.json',
    '@@ -1 +1,2 @@',
    '+    "left-pad": "^1.3.0",',
    'diff --git a/src/x.ts b/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -1 +1,3 @@',
    '+// TODO: clean this up',
    '+const a = 1;',
    '-const old = 0;',
  ].join('\n');
  const d = parseDiffDebt(diff);
  assert.deepEqual(d.addedDeps, ['left-pad']);
  assert.equal(d.todos, 1);
  assert.equal(d.addedLines, 3);
  assert.equal(d.removedLines, 1);
});

test('renderDebt: shows only what THIS change added; clean diff says so', () => {
  assert.match(renderDebt(parseDiffDebt('')), /no new deps/i);
  assert.match(renderDebt({ addedLines: 5, removedLines: 2, addedDeps: ['x'], todos: 1 }), /1 runtime dependency: x/);
});

test('ownershipBrief: fills the known facts, marks narrative sections for the explainer', () => {
  const out = ownershipBrief({ goal: 'add login', changedFiles: ['src/auth.ts'], testCommand: 'npm test', lastGreen: '8f2c1abdead' });
  assert.match(out, /add login/);
  assert.match(out, /src\/auth\.ts/);
  assert.match(out, /npm test/);
  assert.match(out, /git reset --hard 8f2c1ab/);
  assert.match(out, /What will likely break next/); // forward-looking section present
  assert.match(out, /explainer/i);                   // narrative left to the live explainer
});
