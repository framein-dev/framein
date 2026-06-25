import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFrame, renderKeyVals, statusLine } from './banner.js';
import { PLAIN, painter } from './theme.js';
const ctx = (unicode) => ({ ui: PLAIN, unicode, columns: 80 });
test('renderFrame draws a titled Unicode box; ASCII fallback swaps the glyphs', () => {
    const u = renderFrame('FRAMEIN', ['Intent in · Validation in · Drift out'], ctx(true));
    const lines = u.split('\n');
    assert.ok(lines[0].startsWith('┌') && lines[0].includes('FRAMEIN') && lines[0].endsWith('┐'));
    assert.ok(lines.at(-1).startsWith('└') && lines.at(-1).endsWith('┘'));
    assert.ok(lines[1].startsWith('│') && lines[1].endsWith('│'));
    const a = renderFrame('FRAMEIN', ['x'], ctx(false));
    assert.ok(a.split('\n')[0].startsWith('+') && a.includes('|'));
    assert.ok(!a.includes('┌'));
});
test('renderFrame border is brand-colored when the painter has color', () => {
    const colored = renderFrame('FRAMEIN', ['x'], { ui: painter({ color: true, colorDepth: 24, unicode: true }), unicode: true, columns: 80 });
    assert.ok(colored.split('\n')[0].includes('\x1b[38;2;200;255;61m')); // brand truecolor on the top rule
});
test('renderKeyVals aligns keys and indents two spaces', () => {
    const out = renderKeyVals([['lead', 'claude'], ['reviewer', 'codex']], PLAIN);
    const lines = out.split('\n');
    assert.equal(lines[0], '  lead       claude'); // 'lead' padded to width of 'reviewer' (8) + 3 spaces
    assert.equal(lines[1], '  reviewer   codex');
});
test('statusLine pairs a bold label with a semantically toned status', () => {
    assert.equal(statusLine('VERIFY', 'NOT READY', PLAIN), 'VERIFY  NOT READY');
    const c = statusLine('VERIFY', 'NOT READY', painter({ color: true, colorDepth: 4, unicode: true }));
    assert.ok(c.includes('\x1b[91m')); // danger (bright red) on NOT READY
});
