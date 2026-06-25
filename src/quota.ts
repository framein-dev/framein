// Reactive quota detection (F-ROLE-3). Parse a CLI's stderr/output for rate-limit / quota /
// overload signals so the orchestrator can fail over to another agent. This is NOT "bypassing
// limits" — it routes work within each subscription's normal use. Pure + fixture-tested; the
// live capture of `output` (a real CLI run) is the B-layer spawn (see delegate.ts / M10).

import type { Agent } from './types.js';

export type QuotaKind = 'rate-limit' | 'quota' | 'overloaded';

export interface QuotaSignal {
  agent: Agent;
  exhausted: boolean;   // true => route away from this agent right now
  kind?: QuotaKind;
  retryAfterSec?: number;
}

// Checked in order of severity: a hard quota wins over a transient rate-limit / overload.
const QUOTA = /quota|usage limit|resource_exhausted|insufficient_quota/i;
const RATE = /\b429\b|rate[\s_-]?limit|too many requests/i;
const OVERLOAD = /overloaded|server is busy|try again later|\b529\b/i;

function parseRetryAfter(text: string): number | undefined {
  const m = text.match(/retry[\s-]?after[:\s]+(\d+)/i) ?? text.match(/try again in (\d+)\s*(seconds?|secs?|minutes?|mins?)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = (m[2] ?? 's').toLowerCase();
  return unit.startsWith('min') ? n * 60 : n;
}

/** Classify a single agent's output. `exhausted` is the failover trigger. */
export function detectQuotaSignal(agent: Agent, output: string): QuotaSignal {
  const text = output ?? '';
  let kind: QuotaKind | undefined;
  if (QUOTA.test(text)) kind = 'quota';
  else if (RATE.test(text)) kind = 'rate-limit';
  else if (OVERLOAD.test(text)) kind = 'overloaded';
  return { agent, exhausted: kind !== undefined, kind, retryAfterSec: parseRetryAfter(text) };
}
