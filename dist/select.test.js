import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterItems, initSelect, reduceSelectKey, renderSelectLines } from './select.js';
const ITEMS = [
    { value: 'claude', label: 'claude', hint: 'installed' },
    { value: 'codex', label: 'codex', hint: 'not on PATH' },
    { value: 'gemini', label: 'gemini' },
];
test('filterItems: empty query returns all; substring matches label/hint/value, case-insensitive', () => {
    assert.equal(filterItems(ITEMS, '').length, 3);
    assert.deepEqual(filterItems(ITEMS, 'COD').map((i) => i.value), ['codex']);
    assert.deepEqual(filterItems(ITEMS, 'path').map((i) => i.value), ['codex']); // matches hint
    assert.equal(filterItems(ITEMS, 'zzz').length, 0);
});
test('reduceSelectKey: up/down wrap around the visible list', () => {
    const s0 = initSelect(ITEMS);
    assert.deepEqual(reduceSelectKey(s0, { name: 'down' }), { kind: 'move', state: { ...s0, index: 1 } });
    assert.deepEqual(reduceSelectKey(s0, { name: 'up' }), { kind: 'move', state: { ...s0, index: 2 } }); // wraps to last
    const s2 = { ...s0, index: 2 };
    assert.deepEqual(reduceSelectKey(s2, { name: 'down' }), { kind: 'move', state: { ...s2, index: 0 } }); // wraps to first
});
test('reduceSelectKey: enter accepts the current visible value', () => {
    const s = { ...initSelect(ITEMS), index: 1 };
    assert.deepEqual(reduceSelectKey(s, { name: 'return' }), { kind: 'accept', value: 'codex' });
});
test('reduceSelectKey: escape and ctrl+c cancel', () => {
    const s = initSelect(ITEMS);
    assert.deepEqual(reduceSelectKey(s, { name: 'escape' }), { kind: 'cancel' });
    assert.deepEqual(reduceSelectKey(s, { name: 'c', ctrl: true }), { kind: 'cancel' });
});
test('reduceSelectKey: printable chars build the filter query and reset index; backspace trims', () => {
    const s = { ...initSelect(ITEMS), index: 2 };
    const afterG = reduceSelectKey(s, { sequence: 'g', name: 'g' });
    assert.deepEqual(afterG, { kind: 'move', state: { ...s, query: 'g', index: 0 } });
    const back = reduceSelectKey({ ...s, query: 'ge' }, { name: 'backspace' });
    assert.deepEqual(back, { kind: 'move', state: { ...s, query: 'g', index: 0 } });
});
test('reduceSelectKey: enter with zero matches does not accept', () => {
    const s = { ...initSelect(ITEMS), query: 'zzz' };
    assert.equal(reduceSelectKey(s, { name: 'return' }).kind, 'move');
});
test('renderSelectLines: marks the selected row, shows hints + filter header', () => {
    const s = { ...initSelect(ITEMS), index: 1 };
    const lines = renderSelectLines('pick a lead', s, '>');
    assert.equal(lines[0], 'pick a lead');
    assert.match(lines[2], /^> codex/); // selected row marked
    assert.match(lines[1], /claude.*installed/); // hint rendered
    const filtered = renderSelectLines('pick a lead', { ...s, query: 'cod' }, '>');
    assert.match(filtered[0], /filter: cod/);
    assert.match(filtered[1], /^> codex/); // index clamps onto the only match
});
test('renderSelectLines: no matches shows a hint line', () => {
    const lines = renderSelectLines('pick', { ...initSelect(ITEMS), query: 'zzz' });
    assert.match(lines[1], /no matches/);
});
