// Rescue Mode (F-LOOP-3, ADR-0008): promote the anomaly detector from a side feature to a
// flagship. When the ledger shows a repair loop, assemble a rescue report — the signals, the last
// green checkpoint, and three options (diagnose / rewind / continue) — and NEVER act automatically.
// Pure logic; the actual model diagnosis (option A) and the git rewind (option B) live in cli.ts.

import type { AnomalySignal } from './anomaly.js';
import type { Agent } from './types.js';
import { PLAIN, type Painter } from './ui/theme.js';

export interface RescueOption { key: string; label: string; }
export interface GreenCheckpoint { sha: string; label?: string; }

export interface RescueReport {
  triggered: boolean;
  signals: AnomalySignal[];
  lastGreen?: GreenCheckpoint;
  reviewer?: Agent;
  options: RescueOption[];
}

const short = (sha: string): string => sha.slice(0, 7);

export function buildRescue(
  signals: AnomalySignal[],
  opts: { lastGreen?: GreenCheckpoint; reviewer?: Agent } = {},
): RescueReport {
  const triggered = signals.length > 0;
  const options: RescueOption[] = [];
  if (triggered) {
    const who = opts.reviewer ?? 'the reviewer role';
    options.push({ key: 'A', label: `Ask ${who} to diagnose without editing` });
    if (opts.lastGreen) {
      options.push({ key: 'B', label: `Rewind to checkpoint ${short(opts.lastGreen.sha)}${opts.lastGreen.label ? ` (${opts.lastGreen.label})` : ''}` });
    }
    options.push({ key: opts.lastGreen ? 'C' : 'B', label: 'Continue with the current agent' });
  }
  return { triggered, signals, lastGreen: opts.lastGreen, reviewer: opts.reviewer, options };
}

export function renderRescue(report: RescueReport, ui: Painter = PLAIN): string {
  if (!report.triggered) return 'No repair loop detected. (rescue is anomaly-triggered — ADR-0005)';
  const lines = [ui.tone('Framein detected a repair loop.', 'danger'), ''];
  for (const s of report.signals) lines.push(`  ${ui.tone(ui.sym.warn, 'warning')} ${s.message}`);
  lines.push('');
  if (report.lastGreen) {
    lines.push(`Last green checkpoint: ${short(report.lastGreen.sha)}${report.lastGreen.label ? ` (${report.lastGreen.label})` : ''}`);
  } else {
    lines.push('No green checkpoint recorded (run `frame checkpoint` at a known-good state).');
  }
  lines.push('', 'Recommended:');
  for (const o of report.options) lines.push(`  ${ui.tone(o.key, 'brand')}. ${o.label}`);
  lines.push('', ui.tone('No action taken automatically.', 'muted'));
  return lines.join('\n');
}
