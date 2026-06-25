import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyContract, amendContract, contractIssues, renderContractDigest, renderContractFull, buildGuidedContract, GUIDED_CONTRACT_STEPS } from './task.js';

test('emptyContract: goal + empty lists', () => {
  const c = emptyContract('add Google login');
  assert.equal(c.goal, 'add Google login');
  assert.deepEqual(c.acceptance, []);
  assert.deepEqual(c.mustPreserve, []);
});

test('amendContract: goal is set, list fields append, original is not mutated', () => {
  const c0 = emptyContract('g');
  const c1 = amendContract(c0, 'acceptance', 'tests pass');
  const c2 = amendContract(c1, 'acceptance', 'existing login works');
  const c3 = amendContract(c2, 'nongoal', 'UI redesign');
  const c4 = amendContract(c3, 'goal', 'g2');
  assert.deepEqual(c2.acceptance, ['tests pass', 'existing login works']);
  assert.deepEqual(c3.nonGoals, ['UI redesign']);
  assert.equal(c4.goal, 'g2');
  assert.deepEqual(c0.acceptance, []); // immutability: c0 untouched
});

test('contractIssues: flags missing goal / empty acceptance', () => {
  assert.ok(contractIssues(emptyContract('')).some((i) => /goal/i.test(i)));
  assert.ok(contractIssues(emptyContract('g')).some((i) => /acceptance/i.test(i)));
  const full = amendContract(emptyContract('g'), 'acceptance', 'done');
  assert.deepEqual(contractIssues(full), []); // goal + at least one acceptance => no issues
});

test('renderContractDigest: compact, shows goal + acceptance; empty => placeholder', () => {
  const c = amendContract(amendContract(emptyContract('add login'), 'acceptance', 'A'), 'nongoal', 'N');
  const d = renderContractDigest(c);
  assert.match(d, /add login/);
  assert.match(d, /A/);
  assert.match(renderContractDigest(emptyContract('')), /No active task contract/i);
});

test('buildGuidedContract: goal required, blank optional answers skipped (conversational start)', () => {
  assert.ok(GUIDED_CONTRACT_STEPS[0].field === 'goal', 'goal is asked first');
  const c = buildGuidedContract({ goal: '  add Google login ', acceptance: 'email login still works', nongoal: '' });
  assert.equal(c.goal, 'add Google login');                 // trimmed
  assert.deepEqual(c.acceptance, ['email login still works']);
  assert.deepEqual(c.nonGoals, []);                          // blank answer skipped, not pushed
});

test('renderContractFull: lists every section for `task show`', () => {
  const c = amendContract(emptyContract('g'), 'preserve', 'email login');
  const f = renderContractFull(c);
  assert.match(f, /g/);
  assert.match(f, /email login/);
  assert.match(f, /must preserve/i);
});
