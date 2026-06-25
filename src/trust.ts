// Unified permission mode (F-TRUST, ADR-0007 B-3). framein's most dangerous surface, so it leans
// on SAFETY over convenience: per-agent opt-in, time-boxed, with honest limits. This module is
// pure — it only PLANS what trust would enable (the bypass flags each CLI understands). framein
// does NOT auto-apply it; actually launching an agent with these flags is the live path. A
// worktree is NOT a sandbox (network/credentials/installs are not blocked) — surfaced as a warning.

import type { Agent } from './types.js';

export interface TrustPlan {
  agent: Agent;
  flags: string[];      // permission-bypass flags this agent's CLI understands
  ttlSec: number;       // time-box (auto-expiry is the operator's responsibility when they launch)
  warnings: string[];
}

// The "stop asking me" flag per CLI. Codex's --full-auto stays sandboxed; the fuller
// --dangerously-bypass-approvals-and-sandbox also drops the sandbox (mentioned in warnings).
const BYPASS_FLAGS: Record<Agent, string[]> = {
  claude: ['--dangerously-skip-permissions'],
  codex: ['--full-auto'],
  gemini: ['--yolo'],
};

export const DEFAULT_TRUST_TTL_SEC = 1800; // 30m

/** Parse "90s" | "30m" | "1h" | "45" (bare = seconds). Returns seconds, or null if unparseable. */
export function parseDuration(s: string): number | null {
  const m = /^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  if (unit.startsWith('h')) return n * 3600;
  if (unit.startsWith('m')) return n * 60;
  return n;
}

export function trustPlan(agent: Agent, opts: { ttlSec?: number } = {}): TrustPlan {
  const ttlSec = opts.ttlSec && opts.ttlSec > 0 ? opts.ttlSec : DEFAULT_TRUST_TTL_SEC;
  return {
    agent,
    flags: BYPASS_FLAGS[agent],
    ttlSec,
    warnings: [
      `${agent} will run WITHOUT per-action permission prompts (${BYPASS_FLAGS[agent].join(' ')}).`,
      'A worktree is NOT a sandbox: network, credentials, and `npm install` are NOT blocked.',
      'Use per-agent, time-boxed, and only for a task you trust; pair with freeze/careful guardrails.',
    ],
  };
}
