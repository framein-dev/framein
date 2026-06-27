// Task Capsule (F-LOOP-4, ADR-0008): when a session compacts, hits quota, or switches CLI, hand
// over an AUTO-GENERATED structured state — not the chat transcript. The capsule is assembled from
// what framein already holds (contract + ADRs + git + validation results + ledger), so "no manual
// handoff; Framein rebuilds the working context from validation results." Pure assembly; the CLI
// gathers the inputs.

import type { LedgerEntry, TaskContract } from './types.js';
import type { TestSummary } from './evidence.js';
import { detectThrash } from './anomaly.js';
import { renderContractDigest } from './task.js';
import { PLAIN, type Painter } from './ui/theme.js';

export interface DelegationSummary { agent: string; ok: boolean; }

export interface CapsuleInput {
  goal?: string;
  contract?: TaskContract;
  decisions?: { id: number; title: string }[];
  branch?: string;
  lastGreen?: string;
  changedFiles?: string[];
  testSummary?: TestSummary | null;
  ledger?: LedgerEntry[];
  blocker?: string;
  lastDelegation?: DelegationSummary;
  handoffTarget?: string;
  openDebate?: boolean;
}

export interface Capsule {
  goal: string;
  contract?: TaskContract;
  nextAction: string;
  branch?: string;
  lastGreen?: string;
  decisions: { id: number; title: string }[];
  changed: string[];
  evidence?: TestSummary;
  blocker?: string;
  lastDelegation?: DelegationSummary;
  handoffTarget?: string;
  recentActivity: string[];
}

function inferNextAction(input: CapsuleInput, blocker: string | undefined): string {
  const contract = input.contract;
  if (!contract?.goal.trim() && !input.goal?.trim()) return 'Start a task contract with `framein start "<goal>"`.';
  if (input.openDebate) return 'Resolve the open challenge with `framein decide accept|reject ...`.';
  if (contract && contract.acceptance.length === 0) return 'Add acceptance criteria with `framein task amend acceptance "<check>"`.';
  if (blocker) return 'Resolve the current blocker, then run `framein verify`.';
  if (input.testSummary && input.testSummary.failed > 0) return 'Fix failing validation, then run `framein verify`.';
  if (input.handoffTarget) return `Continue with ${input.handoffTarget}; run \`framein capsule\` first, then proceed from local facts.`;
  if (input.changedFiles?.length) return 'Run `framein verify`; if green, run `framein ship`.';
  return 'Continue from the task contract; record evidence with `framein verify`.';
}

export function buildCapsule(input: CapsuleInput): Capsule {
  const ledger = input.ledger ?? [];
  const recentActivity = ledger.slice(-8).map((e) => `${e.kind}${e.target ? ' ' + e.target : ''}`);

  // Derive a blocker from a repeated-failure signal when one isn't supplied explicitly.
  let blocker = input.blocker;
  const testsAreGreen = input.testSummary !== null && input.testSummary !== undefined && input.testSummary.failed === 0;
  if (!blocker && !testsAreGreen && ledger.length) {
    const fail = detectThrash(ledger).find((s) => s.kind === 'repeated-failure');
    if (fail) blocker = fail.message;
  }

  return {
    goal: input.contract?.goal ?? input.goal ?? '(no task contract)',
    contract: input.contract,
    nextAction: inferNextAction(input, blocker),
    branch: input.branch,
    lastGreen: input.lastGreen,
    decisions: input.decisions ?? [],
    changed: input.changedFiles ?? [],
    evidence: input.testSummary ?? undefined,
    blocker,
    lastDelegation: input.lastDelegation,
    handoffTarget: input.handoffTarget,
    recentActivity,
  };
}

const short = (sha: string): string => sha.slice(0, 7);

/** Readable capsule for `frame resume` / `frame capsule show`. Empty sections are omitted. */
export function renderCapsule(c: Capsule, ui: Painter = PLAIN): string {
  const lines = [`task: ${c.goal}`];
  if (c.contract) {
    lines.push('contract:');
    for (const line of renderContractDigest(c.contract).split('\n')) lines.push(`  ${line.replace(/\*\*/g, '')}`);
  }
  lines.push(`next_action: ${c.nextAction}`);
  if (c.branch) lines.push(`branch: ${c.branch}`);
  if (c.lastGreen) lines.push(`last_green: ${short(c.lastGreen)}`);
  if (c.decisions.length) {
    lines.push('decisions:');
    for (const d of c.decisions) lines.push(`  - ADR-${d.id}: ${d.title}`);
  }
  if (c.changed.length) {
    lines.push('changed:');
    for (const f of c.changed) lines.push(`  - ${f}`);
  }
  if (c.evidence) lines.push(`validation: tests ${c.evidence.passed} passed, ${c.evidence.failed} failed`);
  if (c.lastDelegation) lines.push(`last_delegation: ${c.lastDelegation.agent} (${c.lastDelegation.ok ? 'ok' : 'failed'})`);
  if (c.handoffTarget) lines.push(`handoff: ${c.handoffTarget} (armed)`);
  if (c.blocker) lines.push(ui.tone(`current_blocker: ${c.blocker}`, 'danger'));
  if (c.recentActivity.length) {
    lines.push('recent:');
    for (const a of c.recentActivity) lines.push(`  - ${a}`);
  }
  return lines.join('\n');
}
