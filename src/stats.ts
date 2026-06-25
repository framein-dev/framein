// Repo-local Routing (F-LOOP-7, ADR-0008): route by THIS repo's actual results, not generic model
// reputation, and — crucially — EXPLAIN the choice rather than auto-deciding silently (trust comes
// from "why", not magic). Pure: derive per-agent stats from the ledger, then score + explain via
// roles.scoreAgent. Accumulating richer signals (first-try pass rate, human reverts) comes later.

import { AGENTS, type Agent, type AgentStats, type LedgerEntry, type Role } from './types.js';
import { scoreAgent, DEFAULT_ROLE_PRIORITY, type RouteContext } from './roles.js';
import { PLAIN, type Painter } from './ui/theme.js';

const isAgentName = (s: string): s is Agent => (AGENTS as readonly string[]).includes(s);

/** The trailing token of a ledger target is the agent: "reviewer:codex" -> codex, "codex" -> codex. */
function agentOf(target: string): Agent | undefined {
  const tail = target.split(':').pop() ?? '';
  return isAgentName(tail) ? tail : undefined;
}

export function computeRepoStats(ledger: LedgerEntry[]): Partial<Record<Agent, AgentStats>> {
  const stats: Partial<Record<Agent, AgentStats>> = {};
  const ensure = (a: Agent): AgentStats => (stats[a] ??= { delegations: 0, failures: 0, quotaHits: 0 });
  for (const e of ledger) {
    const a = agentOf(e.target);
    if (!a) continue;
    if (e.kind === 'delegated') ensure(a).delegations++;
    else if (e.kind === 'delegate-fail') { const s = ensure(a); s.delegations++; s.failures++; }
    else if (e.kind === 'quota') ensure(a).quotaHits++;
  }
  return stats;
}

export interface RouteExplain {
  role: Role;
  agent: Agent | null;
  reasons: string[];
  alternative?: { agent: Agent; confidence: number };
}

function routeReasons(st: AgentStats | undefined): string[] {
  if (!st || st.delegations === 0) return ['no local track record yet (using role defaults)'];
  const success = st.delegations - st.failures;
  const reasons = [`+ ${Math.round((success / st.delegations) * 100)}% delegation success in this repo (${success}/${st.delegations})`];
  if (st.failures) reasons.push(`- ${st.failures} failure${st.failures > 1 ? 's' : ''}`);
  reasons.push(st.quotaHits ? `- ${st.quotaHits} quota hit${st.quotaHits > 1 ? 's' : ''}` : '+ no quota issues');
  return reasons;
}

export function explainRoute(role: Role, ctx: Omit<RouteContext, 'role' | 'repoStats'>, stats: Partial<Record<Agent, AgentStats>>): RouteExplain {
  const priority = (ctx.rolePriority ?? DEFAULT_ROLE_PRIORITY)[role] ?? [...AGENTS];
  const scored = priority
    .map((agent) => ({ agent, score: scoreAgent(agent, { ...ctx, role, repoStats: stats }) }))
    .filter((s) => Number.isFinite(s.score))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  let alternative: RouteExplain['alternative'];
  if (best && second) {
    const total = best.score + second.score;
    alternative = { agent: second.agent, confidence: total > 0 ? Number((second.score / total).toFixed(2)) : 0 };
  }
  return { role, agent: best?.agent ?? null, reasons: best ? routeReasons(stats[best.agent]) : ['no eligible agent'], alternative };
}

export function renderRouteExplain(e: RouteExplain, ui: Painter = PLAIN): string {
  const lines = [e.agent ? `Selected ${ui.tone(e.agent, 'brand')} as ${e.role}.` : `No eligible agent for ${e.role}.`, ui.tone('Why:', 'muted')];
  for (const r of e.reasons) lines.push(`  ${r}`);
  if (e.alternative) lines.push(ui.tone(`Alternative: ${e.alternative.agent}, confidence ${e.alternative.confidence}`, 'muted'));
  return lines.join('\n');
}

export function renderStats(stats: Partial<Record<Agent, AgentStats>>, ui: Painter = PLAIN): string {
  const entries = Object.entries(stats) as [Agent, AgentStats][];
  if (entries.length === 0) return 'No repo-local stats yet. Delegations (`framein ask --run`) accumulate them.';
  const lines = [ui.tone('Repo-local agent stats (from the ledger):', 'muted')];
  for (const [a, st] of entries) lines.push(`  ${ui.tone(a, 'brand')}: ${st.delegations} delegations, ${st.failures} failed, ${st.quotaHits} quota`);
  return lines.join('\n');
}
