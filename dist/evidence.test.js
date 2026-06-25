import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestSummary, gate, renderGate, renderShip } from './evidence.js';
import { emptyContract, amendContract } from './task.js';
test('parseTestSummary: node:test and jest/vitest shapes; null when absent', () => {
    assert.deepEqual(parseTestSummary('ℹ tests 104\nℹ pass 104\nℹ fail 0'), { passed: 104, failed: 0 });
    assert.deepEqual(parseTestSummary('Tests: 2 failed, 140 passed'), { passed: 140, failed: 2 });
    assert.equal(parseTestSummary('no counts here'), null);
});
test('gate: build+tests are the hard checks; contract acceptance/unresolved are warnings', () => {
    const contract = amendContract(emptyContract('g'), 'acceptance', 'login works');
    const green = gate(contract, { build: { command: 'b', exitCode: 0 }, tests: { command: 't', summary: { passed: 10, failed: 0 }, exitCode: 0 } });
    assert.equal(green.ready, true);
    assert.ok(green.warnings.some((w) => /acceptance/i.test(w))); // criteria still need verification
    const red = gate(contract, { tests: { command: 't', summary: { passed: 8, failed: 2 }, exitCode: 1 } });
    assert.equal(red.ready, false); // failing tests block the gate
});
test('gate: a missing contract is a warning, not a hard failure', () => {
    const r = gate(undefined, { tests: { command: 't', summary: { passed: 1, failed: 0 }, exitCode: 0 } });
    assert.equal(r.ready, true);
    assert.ok(r.warnings.some((w) => /contract/i.test(w)));
});
test('gate: unresolved items surface as warnings', () => {
    const r = gate(undefined, { tests: { command: 't', summary: { passed: 1, failed: 0 }, exitCode: 0 }, unresolved: ['prod OAuth not tested'] });
    assert.ok(r.warnings.some((w) => /prod OAuth/i.test(w)));
});
test('renderShip: READY/WARNING summary distinguishes commit vs deploy', () => {
    const ok = gate(amendContract(emptyContract('g'), 'acceptance', 'a'), { build: { command: 'b', exitCode: 0 }, tests: { command: 't', summary: { passed: 5, failed: 0 }, exitCode: 0 } });
    const out = renderShip(ok);
    assert.match(out, /READY/);
    assert.match(out, /Safe to commit: yes/);
    assert.match(out, /Safe to deploy: requires human/);
    const bad = renderShip(gate(undefined, { tests: { command: 't', summary: { passed: 0, failed: 3 }, exitCode: 1 } }));
    assert.match(bad, /NOT READY/);
    assert.match(bad, /Safe to commit: no/);
    // renderGate is the shared body without the ship guidance lines
    assert.doesNotMatch(renderGate(ok), /Safe to deploy/);
});
import { painter as _painter } from './ui/theme.js';
test('renderGate colorizes header + marks with a color painter; default stays plain', () => {
    const c = _painter({ color: true, colorDepth: 4, unicode: true });
    const r = gate(undefined, { tests: { command: 't', summary: { passed: 0, failed: 2 }, exitCode: 1 } });
    const out = renderGate(r, c);
    assert.match(out, /\x1b\[91m/); // danger color (NOT READY + × fail mark)
    assert.match(out, /×/); // unified fail glyph (was ✗)
    assert.doesNotMatch(renderGate(r), /\x1b\[/); // PLAIN default = no ANSI
});
