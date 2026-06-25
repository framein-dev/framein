import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAgent, selectAgent, isForbiddenAuth, isAgent, isRole } from './roles.js';

test('compliance: gemini consumer-login is forbidden', () => {
  assert.equal(isForbiddenAuth('gemini', 'consumer-login'), true);
  assert.equal(isForbiddenAuth('gemini', 'api-key'), false);
  assert.equal(isForbiddenAuth('claude', 'oauth'), false);
});

test('role fit: higher-priority agent scores higher', () => {
  const ctx = { role: 'reviewer' as const, authMode: {} }; // priority [codex, claude]
  assert.ok(scoreAgent('codex', ctx) > scoreAgent('claude', ctx));
});

test('selectAgent never picks a forbidden-auth agent (falls back)', () => {
  const ctx = { role: 'explainer' as const, authMode: { gemini: 'consumer-login' as const } };
  assert.equal(selectAgent(['gemini', 'claude'], ctx), 'claude');
});

test('quota exhaustion + failures override raw priority', () => {
  const ctx = {
    role: 'implementer' as const, // priority [claude, codex]
    authMode: {},
    remainingQuota: { claude: 0.0, codex: 1.0 },
    recentFailures: { claude: 3 },
  };
  assert.equal(selectAgent(['claude', 'codex'], ctx), 'codex');
});

test('all candidates forbidden => null', () => {
  const ctx = { role: 'researcher' as const, authMode: { gemini: 'consumer-login' as const } };
  assert.equal(selectAgent(['gemini'], ctx), null);
});

test('isAgent: only the three first-class agents are valid', () => {
  assert.equal(isAgent('claude'), true);
  assert.equal(isAgent('codex'), true);
  assert.equal(isAgent('gemini'), true);
  assert.equal(isAgent('clade'), false);   // typo
  assert.equal(isAgent('qwen'), false);     // not (yet) supported
  assert.equal(isAgent(''), false);
});

test('isRole: only the five role presets are valid', () => {
  assert.equal(isRole('lead'), true);
  assert.equal(isRole('implementer'), true);
  assert.equal(isRole('reviewer'), true);
  assert.equal(isRole('explainer'), true);
  assert.equal(isRole('researcher'), true);
  assert.equal(isRole('boss'), false);
});
