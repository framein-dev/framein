import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessBlastRadius, renderBlast, riskRank, riskTransition } from './blast.js';

test('assessBlastRadius: sensitive categories => HIGH with the right gates', () => {
  const a = assessBlastRadius(['src/auth/login.ts', 'migrations/001_init.sql']);
  assert.equal(a.level, 'high');
  assert.ok(a.hits.some((h) => h.category === 'auth'));
  assert.ok(a.hits.some((h) => h.category === 'migration'));
  assert.ok(a.requiredGates.some((g) => /rollback/i.test(g)));
  assert.ok(a.requiredGates.some((g) => /security/i.test(g)));
});

test('assessBlastRadius: dependency / config => MEDIUM', () => {
  assert.equal(assessBlastRadius(['package.json']).level, 'medium');
  assert.equal(assessBlastRadius(['config/app.yaml']).level, 'medium');
});

test('assessBlastRadius: ordinary files => LOW, no required gates', () => {
  const a = assessBlastRadius(['src/utils/string.ts', 'README.md']);
  assert.equal(a.level, 'low');
  assert.equal(a.requiredGates.length, 0);
});

test('riskRank orders levels; riskTransition only fires on an increase', () => {
  assert.ok(riskRank('high') > riskRank('medium') && riskRank('medium') > riskRank('low'));
  assert.match(riskTransition('low', 'high') ?? '', /MEDIUM|HIGH|→/);
  assert.equal(riskTransition('high', 'low'), undefined); // a decrease is not surfaced
  assert.equal(riskTransition('medium', 'medium'), undefined);
});

test('renderBlast: shows level, reasons, and required gates', () => {
  const out = renderBlast(assessBlastRadius(['src/billing/charge.ts', '.env']));
  assert.match(out, /HIGH/);
  assert.match(out, /security review/i);
  assert.match(out, /secret/i);
  assert.match(renderBlast(assessBlastRadius(['README.md'])), /LOW/);
});

import { painter as _painter } from './ui/theme.js';
test('renderBlast tones risk level by severity; default stays plain', () => {
  const c = _painter({ color: true, colorDepth: 4, unicode: true });
  const high = { level: 'high' as const, hits: [{ category: 'auth', file: 'a.ts' }], requiredGates: ['security review'] };
  assert.match(renderBlast(high, c), /\x1b\[91m/);   // danger
  assert.doesNotMatch(renderBlast(high), /\x1b\[/);  // PLAIN default
});
