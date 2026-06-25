// Pure core for the lobby's inline `/` command palette (Claude-style, non-modal). Unlike the modal
// picker (select.ts), here the TYPED LINE is primary: a suggestion list appears *below* the line you're
// editing as soon as it starts with `/`, filters as you type, and ⏎ runs exactly what you typed — it
// never force-selects the top item. ↑/↓ opt into picking a suggestion; ⏎ then runs the highlighted one.
// No npm deps, no I/O — the raw-mode stdin loop + ANSI redraw live in cli.ts (readLobbyLine).
export function initPalette(buf = '') { return { buf, index: 0, navigated: false }; }
/** Suggestions are shown ONLY while the buffer is a slash-command being typed (`/…`). Filtered by the
 *  text after the leading `/` (substring over cmd + desc). Empty when the line isn't a slash command —
 *  so bare verbs / agent names (`verify`, `codex fix bug`) type freely with no popup. */
export function paletteSuggestions(buf, cmds) {
    if (!buf.startsWith('/'))
        return [];
    const q = buf.slice(1).trim().toLowerCase();
    if (!q)
        return cmds;
    return cmds.filter((c) => `${c.cmd} ${c.desc}`.toLowerCase().includes(q));
}
/** Pure reducer: (state, key) → next state OR a terminal step. Mirrors select.ts but the default ⏎
 *  action is "run what I typed", not "accept the highlighted item". */
export function reducePaletteKey(state, key, cmds) {
    const sugg = paletteSuggestions(state.buf, cmds);
    const n = sugg.length;
    const idx = n ? Math.min(state.index, n - 1) : 0;
    if (key.ctrl && key.name === 'c')
        return { kind: 'sigint' };
    if (key.ctrl && key.name === 'd')
        return state.buf ? { kind: 'edit', state } : { kind: 'exit' };
    if (key.name === 'escape')
        return { kind: 'edit', state: initPalette('') }; // close the palette / clear the line
    if (key.name === 'return' || key.name === 'enter') {
        if (n && state.navigated)
            return { kind: 'submit', line: sugg[idx].cmd }; // user picked one → run it
        const line = state.buf.trim();
        if (line === '' || line === '/')
            return { kind: 'edit', state }; // nothing meaningful typed → no-op
        return { kind: 'submit', line };
    }
    if (key.name === 'up')
        return { kind: 'edit', state: { ...state, index: n ? (idx - 1 + n) % n : 0, navigated: true } };
    if (key.name === 'down')
        return { kind: 'edit', state: { ...state, index: n ? (idx + 1) % n : 0, navigated: true } };
    if (key.name === 'tab')
        return n ? { kind: 'edit', state: { buf: `${sugg[idx].cmd} `, index: 0, navigated: false } } : { kind: 'edit', state };
    if (key.name === 'backspace')
        return { kind: 'edit', state: { ...state, buf: state.buf.slice(0, -1), index: 0, navigated: false } };
    // A single printable character extends the line (control sequences ignored). Typing resets the
    // highlight so ⏎ goes back to "run what I typed" until the user navigates again.
    const ch = key.sequence;
    if (ch && ch.length === 1 && ch >= ' ' && !key.ctrl) {
        return { kind: 'edit', state: { ...state, buf: state.buf + ch, index: 0, navigated: false } };
    }
    return { kind: 'edit', state };
}
/** Pure renderer for the suggestion list drawn below the input line (no ANSI; the I/O layer colors the
 *  hints). Returns [] when no suggestions are visible. The input line itself is drawn by the caller. */
export function renderPaletteSuggestions(state, cmds, marker = '>') {
    const sugg = paletteSuggestions(state.buf, cmds);
    if (!sugg.length)
        return [];
    const w = Math.max(...sugg.map((c) => c.cmd.length));
    const idx = Math.min(state.index, sugg.length - 1);
    return sugg.map((c, i) => `${i === idx ? `${marker} ` : '  '}${c.cmd.padEnd(w)}   ${c.desc}`);
}
