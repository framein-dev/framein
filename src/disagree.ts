// Disagreement Protocol (F-LOOP-5, ADR-0008): bound model-vs-model debate so it converges instead
// of looping. A proposal is met with at most `maxRounds` blocking challenges; the reviewer returns
// CLAIMS + a required change (never edits — the lead keeps control); no agreement after the cap
// escalates to the human with exactly two options. Pure state machine; the model-authored content
// of each turn is the deferred live path.

import type { Agent } from './types.js';
import { PLAIN, type Painter } from './ui/theme.js';

export interface Proposal { text: string; by?: Agent; }
export interface Challenge { verdict: 'challenge' | 'accept'; claim?: string; requiredChange?: string; by?: Agent; }
export interface Revision { text: string; accepted: boolean; by?: Agent; }

export type DebateEntry =
  | { kind: 'proposal'; proposal: Proposal }
  | { kind: 'challenge'; challenge: Challenge }
  | { kind: 'revision'; revision: Revision };

export interface Debate { topic: string; entries: DebateEntry[]; maxRounds: number; }

export type DebateStatus =
  | { state: 'awaiting-challenge' }
  | { state: 'awaiting-revision'; required?: string }
  | { state: 'resolved'; how: 'accepted-by-reviewer' | 'lead-accepted' }
  | { state: 'escalate'; reason: string; options: string[] };

export const MAX_ROUNDS = 2;

export function newDebate(topic: string, proposal: Proposal, maxRounds = MAX_ROUNDS): Debate {
  return { topic, entries: [{ kind: 'proposal', proposal }], maxRounds };
}

export function challengeCount(d: Debate): number {
  return d.entries.filter((e) => e.kind === 'challenge').length;
}

function leadPosition(d: Debate): string {
  for (let i = d.entries.length - 1; i >= 0; i--) {
    const e = d.entries[i];
    if (e.kind === 'revision') return e.revision.text || d.topic;
    if (e.kind === 'proposal') return e.proposal.text;
  }
  return d.topic;
}
function reviewerRequirement(d: Debate): string | undefined {
  for (let i = d.entries.length - 1; i >= 0; i--) {
    const e = d.entries[i];
    if (e.kind === 'challenge' && e.challenge.verdict === 'challenge') return e.challenge.requiredChange ?? e.challenge.claim;
  }
  return undefined;
}

export function debateStatus(d: Debate): DebateStatus {
  const last = d.entries[d.entries.length - 1];
  const rounds = challengeCount(d);
  const escalate = (): DebateStatus => ({
    state: 'escalate',
    reason: `no agreement after ${rounds} round${rounds === 1 ? '' : 's'} (max ${d.maxRounds})`,
    options: [`A: ${leadPosition(d)}`, `B: ${reviewerRequirement(d) ?? 'reviewer change'}`],
  });

  if (!last || last.kind === 'proposal') return { state: 'awaiting-challenge' };
  if (last.kind === 'challenge') {
    if (last.challenge.verdict === 'accept') return { state: 'resolved', how: 'accepted-by-reviewer' };
    if (rounds >= d.maxRounds) return escalate();
    return { state: 'awaiting-revision', required: last.challenge.requiredChange };
  }
  // last is a revision
  if (last.revision.accepted) return { state: 'resolved', how: 'lead-accepted' };
  if (rounds >= d.maxRounds) return escalate();
  return { state: 'awaiting-challenge' };
}

export function renderDebate(d: Debate, ui: Painter = PLAIN): string {
  const lines = [`Debate: ${d.topic}`, ''];
  for (const e of d.entries) {
    if (e.kind === 'proposal') lines.push(`proposal${e.proposal.by ? ` (${e.proposal.by})` : ''}: ${e.proposal.text}`);
    else if (e.kind === 'challenge') {
      const c = e.challenge;
      lines.push(c.verdict === 'accept'
        ? `challenge${c.by ? ` (${c.by})` : ''}: accept`
        : `challenge${c.by ? ` (${c.by})` : ''}: ${c.claim ?? ''}${c.requiredChange ? ` → require: ${c.requiredChange}` : ''}`);
    } else {
      lines.push(`revision: ${e.revision.accepted ? 'accepted' : 'rejected'}${e.revision.text ? ` — ${e.revision.text}` : ''}`);
    }
  }
  lines.push('');
  const st = debateStatus(d);
  if (st.state === 'resolved') lines.push(ui.tone(`Resolved (${st.how}).`, 'success'));
  else if (st.state === 'escalate') { lines.push(ui.tone(`Escalate to human — ${st.reason}:`, 'warning')); for (const o of st.options) lines.push(`  ${o}`); }
  else if (st.state === 'awaiting-revision') lines.push(ui.tone(`Awaiting lead revision${st.required ? ` (required: ${st.required})` : ''}.`, 'info'));
  else lines.push(ui.tone('Awaiting reviewer challenge.', 'info'));
  return lines.join('\n');
}
