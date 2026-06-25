// Semantic symbols + color. PURE + zero-dep: color is emitted as
// raw ANSI escapes (no chalk/library), gated by a Painter built from UiCapabilities. The default PLAIN
// painter colors nothing and uses UTF-8 symbols → byte-identical to framein's pre-existing renderer
// output, so existing tests pass and color only appears in a real terminal.
// §5.2/§5.3 truecolor + §5.5 ANSI-16 fallback. agent/provider are never color-coded (§5.4).
const TRUECOLOR = {
    brand: [200, 255, 61],
    success: [82, 210, 115],
    warning: [242, 184, 75],
    danger: [255, 101, 119],
    info: [84, 199, 236],
    muted: [160, 160, 165],
};
const ANSI16 = { brand: 96, success: 92, warning: 93, danger: 91, info: 94, muted: 90 };
export function symbolSet(unicode) {
    return unicode
        ? { pass: '✓', warn: '!', fail: '×', running: '●', waiting: '○', next: '→', note: '·' }
        : { pass: '[ok]', warn: '[!]', fail: '[x]', running: '[*]', waiting: '[ ]', next: '->', note: '-' };
}
function makePainter(opts) {
    const sym = symbolSet(opts.unicode);
    if (!opts.color)
        return { sym, color: false, tone: (t) => t, bold: (t) => t };
    const code = (t) => (opts.depth >= 24 ? `38;2;${TRUECOLOR[t].join(';')}` : String(ANSI16[t]));
    return {
        sym,
        color: true,
        tone: (text, t) => `\x1b[${code(t)}m${text}\x1b[0m`,
        bold: (text) => `\x1b[1m${text}\x1b[0m`,
    };
}
export function painter(caps) {
    return makePainter({ color: caps.color, depth: caps.colorDepth, unicode: caps.unicode });
}
/** No color, UTF-8 symbols — the renderer default so non-cli callers (and tests) get stable plain text. */
export const PLAIN = makePainter({ color: false, depth: 0, unicode: true });
/** Map a framein status word to its semantic tone (§8.4). */
export function statusTone(status) {
    const s = status.toUpperCase();
    if (s === 'READY')
        return 'success';
    if (s.includes('NOT READY') || s === 'BLOCKED' || s === 'FAILED')
        return 'danger';
    if (s === 'WARNING' || s.includes('WARNING'))
        return 'warning';
    if (s === 'RUNNING' || s === 'WAITING' || s === 'PAUSED')
        return 'info';
    return 'muted';
}
