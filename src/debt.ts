// Vibe Debt Delta (F-LOOP-9, ADR-0008): show the debt THIS change added — not the codebase's
// hundreds of pre-existing warnings. Pure: parse a unified git diff into a small delta. Heuristic
// by design (a hint, not a linter); reading the diff (git) lives in cli.ts.

import { PLAIN, type Painter } from './ui/theme.js';

export interface DebtDelta {
  addedLines: number;
  removedLines: number;
  addedDeps: string[];
  todos: number;
}

export function parseDiffDebt(diff: string): DebtDelta {
  let addedLines = 0, removedLines = 0, todos = 0;
  const addedDeps: string[] = [];
  let curFile = '';
  for (const line of (diff ?? '').split('\n')) {
    if (line.startsWith('+++ ')) { curFile = line.replace(/^\+\+\+ (b\/)?/, '').trim(); continue; }
    if (line.startsWith('--- ') || line.startsWith('@@') || line.startsWith('diff ')) continue;
    if (line.startsWith('+')) {
      addedLines++;
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) todos++;
      if (/package\.json$/.test(curFile)) {
        const m = line.match(/^\+\s*"([^"]+)":\s*"[~^]?\d/); // "pkg": "^1.2.3" style additions
        if (m) addedDeps.push(m[1]);
      }
    } else if (line.startsWith('-')) {
      removedLines++;
    }
  }
  return { addedLines, removedLines, addedDeps, todos };
}

export function renderDebt(d: DebtDelta, ui: Painter = PLAIN): string {
  const lines = [ui.tone('Debt delta (this change only):', 'muted')];
  if (d.addedDeps.length) lines.push(ui.tone(`  + ${d.addedDeps.length} runtime dependency${d.addedDeps.length > 1 ? '(ies)' : ''}: ${d.addedDeps.join(', ')}`, 'warning'));
  if (d.todos) lines.push(ui.tone(`  + ${d.todos} TODO/FIXME`, 'warning'));
  lines.push(`  ~ ${d.addedLines} added / ${d.removedLines} removed lines`);
  if (!d.addedDeps.length && !d.todos) lines.push(ui.tone('  (no new deps or TODOs)', 'success'));
  return lines.join('\n');
}
