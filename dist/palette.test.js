import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPalette, paletteSuggestions, reducePaletteKey, renderPaletteSuggestions } from './palette.js';
const CMDS = [
    { cmd: '/go', desc: 'hand the terminal to the lead agent' },
    { cmd: '/lead', desc: 'switch the lead agent' },
    { cmd: '/verify', desc: 'run build/test, check validation' },
    { cmd: '/ship', desc: 'deployment readiness' },
    { cmd: '/help', desc: 'all commands' },
    { cmd: '/exit', desc: 'leave the lobby' },
];
const k = (name, extra = {}) => ({ name, ...extra });
const type = (s, ch) => {
    const step = reducePaletteKey(s, { sequence: ch }, CMDS);
    assert.equal(step.kind, 'edit');
    return step.state;
};
test('paletteSuggestions: only shows while typing a slash command', () => {
    assert.deepEqual(paletteSuggestions('', CMDS), []); // empty line → no popup
    assert.deepEqual(paletteSuggestions('verify', CMDS), []); // bare verb → no popup (types freely)
    assert.equal(paletteSuggestions('/', CMDS).length, CMDS.length); // `/` shows them all
});
test('paletteSuggestions: filters by substring of cmd + desc after the slash', () => {
    assert.deepEqual(paletteSuggestions('/ship', CMDS).map((c) => c.cmd), ['/ship']);
    // substring matches the description too (discoverability): "lead" also hits /go's "…the lead agent".
    assert.deepEqual(paletteSuggestions('/lead', CMDS).map((c) => c.cmd), ['/go', '/lead']);
    assert.deepEqual(paletteSuggestions('/readiness', CMDS).map((c) => c.cmd), ['/ship']); // matches desc only
    assert.deepEqual(paletteSuggestions('/zzz', CMDS), []); // no match
});
test('typing a printable char extends the buffer and resets the highlight', () => {
    const navigated = { buf: '/s', index: 2, navigated: true };
    assert.deepEqual(reducePaletteKey(navigated, { sequence: 'h' }, CMDS), { kind: 'edit', state: { buf: '/sh', index: 0, navigated: false } });
});
test('Enter runs exactly what was typed when the user has NOT navigated (no force-select)', () => {
    let s = initPalette('');
    for (const ch of '/verify')
        s = type(s, ch);
    const step = reducePaletteKey(s, k('return'), CMDS);
    assert.deepEqual(step, { kind: 'submit', line: '/verify' });
});
test('Enter runs the highlighted suggestion only after the user navigates with arrows', () => {
    let s = initPalette('/');
    const down = reducePaletteKey(s, k('down'), CMDS); // move off the first item, mark navigated
    assert.equal(down.kind, 'edit');
    s = down.state;
    assert.equal(s.navigated, true);
    assert.equal(s.index, 1);
    const step = reducePaletteKey(s, k('return'), CMDS);
    assert.deepEqual(step, { kind: 'submit', line: CMDS[1].cmd }); // '/lead'
});
test('Enter on a bare slash or empty line does nothing (non-trapping peek)', () => {
    assert.deepEqual(reducePaletteKey(initPalette('/'), k('return'), CMDS), { kind: 'edit', state: initPalette('/') });
    assert.deepEqual(reducePaletteKey(initPalette(''), k('return'), CMDS), { kind: 'edit', state: initPalette('') });
});
test('Enter submits a bare verb / agent line verbatim (no slash, no popup)', () => {
    let s = initPalette('');
    for (const ch of 'codex fix the bug')
        s = type(s, ch);
    assert.deepEqual(reducePaletteKey(s, k('return'), CMDS), { kind: 'submit', line: 'codex fix the bug' });
});
test('Tab accepts the highlighted suggestion into the buffer (then types freely)', () => {
    const s = initPalette('/sh');
    const step = reducePaletteKey(s, k('tab'), CMDS);
    assert.deepEqual(step, { kind: 'edit', state: { buf: '/ship ', index: 0, navigated: false } });
});
test('Esc clears the line (closes the palette)', () => {
    assert.deepEqual(reducePaletteKey(initPalette('/ver'), k('escape'), CMDS), { kind: 'edit', state: initPalette('') });
});
test('Backspace removes the last char and resets navigation', () => {
    const navigated = { buf: '/ship', index: 0, navigated: true };
    assert.deepEqual(reducePaletteKey(navigated, k('backspace'), CMDS), { kind: 'edit', state: { buf: '/shi', index: 0, navigated: false } });
});
test('Ctrl-C signals sigint; Ctrl-D exits only on an empty line', () => {
    assert.deepEqual(reducePaletteKey(initPalette('/x'), { name: 'c', ctrl: true }, CMDS), { kind: 'sigint' });
    assert.deepEqual(reducePaletteKey(initPalette(''), { name: 'd', ctrl: true }, CMDS), { kind: 'exit' });
    assert.equal(reducePaletteKey(initPalette('/x'), { name: 'd', ctrl: true }, CMDS).kind, 'edit'); // non-empty → not exit
});
test('renderPaletteSuggestions marks the highlighted row and lists all on bare slash', () => {
    const lines = renderPaletteSuggestions({ buf: '/', index: 1, navigated: true }, CMDS, '>');
    assert.equal(lines.length, CMDS.length);
    assert.match(lines[1], /^> \/lead/); // highlighted
    assert.match(lines[0], /^ {2}\/go/); // not highlighted
    assert.deepEqual(renderPaletteSuggestions(initPalette('verify'), CMDS), []); // no popup for bare verb
});
