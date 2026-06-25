import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symbolSet, painter, PLAIN, statusTone } from './theme.js';

test('symbolSet swaps UTF-8 ↔ ASCII', () => {
  assert.equal(symbolSet(true).pass, '✓');
  assert.equal(symbolSet(false).pass, '[ok]');
  assert.equal(symbolSet(false).next, '->');
});

test('PLAIN painter: no ANSI, UTF-8 symbols (matches legacy plain output)', () => {
  assert.equal(PLAIN.color, false);
  assert.equal(PLAIN.tone('READY', 'success'), 'READY');
  assert.equal(PLAIN.bold('x'), 'x');
  assert.equal(PLAIN.sym.pass, '✓');
});

test('color painter emits truecolor at depth 24 and ANSI-16 below', () => {
  const tc = painter({ color: true, colorDepth: 24, unicode: true });
  assert.equal(tc.tone('ok', 'success'), '\x1b[38;2;82;210;115mok\x1b[0m');
  const a16 = painter({ color: true, colorDepth: 4, unicode: true });
  assert.equal(a16.tone('ok', 'success'), '\x1b[92mok\x1b[0m');
  assert.equal(a16.tone('x', 'danger'), '\x1b[91mx\x1b[0m');
});

test('color:false painter is a passthrough regardless of depth', () => {
  const p = painter({ color: false, colorDepth: 24, unicode: false });
  assert.equal(p.tone('BLOCKED', 'danger'), 'BLOCKED');
  assert.equal(p.sym.pass, '[ok]');
});

test('statusTone maps framein status words to semantic tones', () => {
  assert.equal(statusTone('READY'), 'success');
  assert.equal(statusTone('NOT READY'), 'danger');
  assert.equal(statusTone('BLOCKED'), 'danger');
  assert.equal(statusTone('RUNNING'), 'info');
  assert.equal(statusTone('READY WITH WARNING'), 'warning');
});
