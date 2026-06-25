// Active Frame banner + status block. PURE.
// Width math is done on PLAIN text; color is applied by wrapping whole already-sized lines, so ANSI
// escapes never corrupt alignment. Unicode box-drawing falls back to ASCII per capabilities (Windows).

import type { Painter } from './theme.js';
import { statusTone } from './theme.js';

export interface BannerCtx {
  readonly ui: Painter;
  readonly unicode: boolean;
  readonly columns: number;
}

const MAXW = 72;

function fit(s: string, w: number, unicode: boolean): string {
  if (s.length <= w) return s.padEnd(w);
  return s.slice(0, Math.max(0, w - 1)) + (unicode ? '…' : '~');
}

/** The open "Active Frame": brand-colored border with the title in the top rule. */
export function renderFrame(title: string, body: string[], ctx: BannerCtx): string {
  const longest = Math.max(title.length + 4, ...body.map((b) => b.length + 2), 32);
  const inner = Math.min(longest, MAXW - 2, Math.max(18, ctx.columns - 2));
  const ch = ctx.unicode
    ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };
  const topRule = `${ch.h} ${title} `.padEnd(inner, ch.h).slice(0, inner);
  const top = ctx.ui.tone(`${ch.tl}${topRule}${ch.tr}`, 'brand');
  const bottom = ctx.ui.tone(`${ch.bl}${ch.h.repeat(inner)}${ch.br}`, 'brand');
  const mid = body.map((b) => `${ch.v} ${fit(b, inner - 2, ctx.unicode)} ${ch.v}`);
  return [top, ...mid, bottom].join('\n');
}

/** Indented, aligned key/value rows (§7.2 / §8.1 status block). Keys muted, values default. */
export function renderKeyVals(rows: readonly (readonly [string, string])[], ui: Painter): string {
  const kw = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  return rows.map(([k, v]) => `  ${ui.tone(k.padEnd(kw), 'muted')}   ${v}`).join('\n');
}

/** A result header: bold label + semantically-colored status word (§8.6/§8.7). */
export function statusLine(label: string, status: string, ui: Painter): string {
  return `${ui.bold(label)}  ${ui.tone(status, statusTone(status))}`;
}
