// Task Contract (F-LOOP-1, ADR-0008): fix "what to treat as done" so every agent judges against
// the same bar. Pure logic only — the store wiring lives in store.ts and the lead drafting a
// contract from the user's prompt is the deferred live path. The contract is stored as structured
// task state (memory scope 'task') and projected into the managed block as standing intent.

import type { TaskContract } from './types.js';
import { PLAIN, type Painter } from './ui/theme.js';

export type ContractField = 'goal' | 'preserve' | 'acceptance' | 'protected' | 'nongoal';

export function emptyContract(goal = ''): TaskContract {
  return { goal, mustPreserve: [], acceptance: [], protected: [], nonGoals: [] };
}

/** Set the goal, or append to a list field. Returns a new contract (does not mutate input). */
export function amendContract(c: TaskContract, field: ContractField, value: string): TaskContract {
  const next: TaskContract = {
    goal: c.goal,
    mustPreserve: [...c.mustPreserve],
    acceptance: [...c.acceptance],
    protected: [...c.protected],
    nonGoals: [...c.nonGoals],
  };
  switch (field) {
    case 'goal': next.goal = value; break;
    case 'preserve': next.mustPreserve.push(value); break;
    case 'acceptance': next.acceptance.push(value); break;
    case 'protected': next.protected.push(value); break;
    case 'nongoal': next.nonGoals.push(value); break;
    default: { const _x: never = field; throw new Error(`unknown contract field: ${String(_x)}`); }
  }
  return next;
}

/** Ordered prompts for the conversational `framein start` (fallback manual path, ADR-0012). goal first;
 *  list fields optional. The interactive readline I/O lives in cli.ts; this is the pure spec. */
export interface GuidedStep { field: ContractField; question: string; }
export const GUIDED_CONTRACT_STEPS: GuidedStep[] = [
  { field: 'goal', question: 'Goal — what should be true when this is done?' },
  { field: 'acceptance', question: 'Acceptance — how will you verify it? (enter to skip)' },
  { field: 'nongoal', question: 'Non-goal — what is explicitly out of scope? (enter to skip)' },
  { field: 'preserve', question: 'Must preserve — what must keep working? (enter to skip)' },
];

/** Build a contract from guided answers: goal is set (trimmed), blank optional answers are skipped. Pure. */
export function buildGuidedContract(answers: Partial<Record<ContractField, string>>): TaskContract {
  let c = emptyContract((answers.goal ?? '').trim());
  for (const { field } of GUIDED_CONTRACT_STEPS) {
    if (field === 'goal') continue;
    const v = (answers[field] ?? '').trim();
    if (v) c = amendContract(c, field, v);
  }
  return c;
}

/** Soft warnings (the "ambiguous items" the lead would confirm once). Empty = well-formed. */
export function contractIssues(c: TaskContract): string[] {
  const issues: string[] = [];
  if (!c.goal.trim()) issues.push('no goal set');
  if (c.acceptance.length === 0) issues.push('no acceptance criteria — how will "done" be judged?');
  return issues;
}

const inline = (xs: string[]): string => xs.join('; ');

/** Compact digest for the managed block (always-loaded standing intent). */
export function renderContractDigest(c: TaskContract): string {
  if (!c.goal.trim() && c.acceptance.length === 0) return '_No active task contract._';
  const lines = [`**Goal:** ${c.goal || '(unset)'}`];
  if (c.acceptance.length) lines.push(`- Acceptance: ${inline(c.acceptance)}`);
  if (c.mustPreserve.length) lines.push(`- Must preserve: ${inline(c.mustPreserve)}`);
  if (c.protected.length) lines.push(`- Protected: ${inline(c.protected)}`);
  if (c.nonGoals.length) lines.push(`- Non-goals: ${inline(c.nonGoals)}`);
  return lines.join('\n');
}

/** Full multi-line view for `frame task show`. */
export function renderContractFull(c: TaskContract, ui: Painter = PLAIN): string {
  const section = (label: string, xs: string[]): string =>
    xs.length ? `  ${ui.tone(label, 'muted')}:\n${xs.map((x) => `    - ${x}`).join('\n')}` : `  ${ui.tone(label, 'muted')}: (none)`;
  return [
    `Task goal: ${ui.bold(c.goal || '(unset)')}`,
    section('must preserve', c.mustPreserve),
    section('acceptance', c.acceptance),
    section('protected', c.protected),
    section('non-goals', c.nonGoals),
  ].join('\n');
}
