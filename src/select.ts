// Pure core for the zero-dep arrow-key picker. The raw-mode stdin loop + ANSI redraw live in cli.ts
// (promptSelect); this module is the testable reducer: (state, keypress) -> next state OR a terminal
// action. No npm deps, no I/O. `index` always refers to the CURRENTLY VISIBLE (filtered) list.

export interface SelectItem { value: string; label: string; hint?: string; }
export interface SelectState { items: SelectItem[]; query: string; index: number; }
export type KeyEvent = { name?: string; ctrl?: boolean; sequence?: string };
export type SelectStep =
  | { kind: 'move'; state: SelectState }
  | { kind: 'accept'; value: string }
  | { kind: 'cancel' };

/** Case-insensitive substring filter over label + hint + value. Order preserved. */
export function filterItems(items: SelectItem[], query: string): SelectItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => `${it.label} ${it.hint ?? ''} ${it.value}`.toLowerCase().includes(q));
}

export function initSelect(items: SelectItem[]): SelectState {
  return { items, query: '', index: 0 };
}

/** Pure reducer. Returns the next state (kind 'move') or a terminal action ('accept' | 'cancel'). */
export function reduceSelectKey(state: SelectState, key: KeyEvent): SelectStep {
  const visible = filterItems(state.items, state.query);
  const n = visible.length;
  const idx = n ? Math.min(state.index, n - 1) : 0;

  if (key.ctrl && key.name === 'c') return { kind: 'cancel' };
  if (key.name === 'escape') return { kind: 'cancel' };
  if (key.name === 'return' || key.name === 'enter') {
    return n ? { kind: 'accept', value: visible[idx].value } : { kind: 'move', state };
  }
  if (key.name === 'up') return { kind: 'move', state: { ...state, index: n ? (idx - 1 + n) % n : 0 } };
  if (key.name === 'down') return { kind: 'move', state: { ...state, index: n ? (idx + 1) % n : 0 } };
  if (key.name === 'backspace') return { kind: 'move', state: { ...state, query: state.query.slice(0, -1), index: 0 } };

  // A single printable character extends the type-to-filter query (control sequences are ignored).
  const ch = key.sequence;
  if (ch && ch.length === 1 && ch >= ' ' && !key.ctrl) {
    return { kind: 'move', state: { ...state, query: state.query + ch, index: 0 } };
  }
  return { kind: 'move', state };
}

/** Pure renderer: the lines to draw (no ANSI; the I/O layer colors them). First line is the label. */
export function renderSelectLines(label: string, state: SelectState, marker = '>'): string[] {
  const visible = filterItems(state.items, state.query);
  const head = state.query ? `${label}  (filter: ${state.query})` : label;
  if (!visible.length) return [head, '  (no matches — backspace to clear)'];
  const idx = Math.min(state.index, visible.length - 1);
  return [head, ...visible.map((it, i) => {
    const hint = it.hint ? `   ${it.hint}` : '';
    return `${i === idx ? `${marker} ` : '  '}${it.label}${hint}`;
  })];
}
