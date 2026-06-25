// Repo-local Routing (F-LOOP-7, ADR-0008): route by THIS repo's actual results, not generic model
// reputation, and — crucially — EXPLAIN the choice rather than auto-deciding silently (trust comes
// from "why", not magic). Pure: derive per-agent stats from the ledger, then score + explain via
// roles.scoreAgent. Accumulating richer signals (first-try pass rate, human reverts) comes later.
import { AGENTS } from './types.js';
import { scoreAgent, DEFAULT_ROLE_PRIORITY } from './roles.js';
import { PLAIN } from './ui/theme.js';
const isAgentName = (s) => AGENTS.includes(s);
/** The trailing token of a ledger target is the agent: "reviewer:codex" -> codex, "codex" -> codex. */
function agentOf(target) {
    const tail = target.split(':').pop() ?? '';
    return isAgentName(tail) ? tail : undefined;
}
export function computeRepoStats(ledger) {
    const stats = {};
    const ensure = (a) => (stats[a] ??= { delegations: 0, failures: 0, quotaHits: 0 });
    for (const e of ledger) {
        const a = agentOf(e.target);
        if (!a)
            continue;
        if (e.kind === 'delegated')
            ensure(a).delegations++;
        else if (e.kind === 'delegate-fail') {
            const s = ensure(a);
            s.delegations++;
            s.failures++;
        }
        else if (e.kind === 'quota')
            ensure(a).quotaHits++;
    }
    return stats;
}
function routeReasons(st) {
    if (!st || st.delegations === 0)
        return ['no local track record yet (using role defaults)'];
    const success = st.delegations - st.failures;
    const reasons = [`+ ${Math.round((success / st.delegations) * 100)}% delegation success in this repo (${success}/${st.delegations})`];
    if (st.failures)
        reasons.push(`- ${st.failures} failure${st.failures > 1 ? 's' : ''}`);
    reasons.push(st.quotaHits ? `- ${st.quotaHits} quota hit${st.quotaHits > 1 ? 's' : ''}` : '+ no quota issues');
    return reasons;
}
export function explainRoute(role, ctx, stats) {
    const priority = (ctx.rolePriority ?? DEFAULT_ROLE_PRIORITY)[role] ?? [...AGENTS];
    const scored = priority
        .map((agent) => ({ agent, score: scoreAgent(agent, { ...ctx, role, repoStats: stats }) }))
        .filter((s) => Number.isFinite(s.score))
        .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1];
    let alternative;
    if (best && second) {
        const total = best.score + second.score;
        alternative = { agent: second.agent, confidence: total > 0 ? Number((second.score / total).toFixed(2)) : 0 };
    }
    return { role, agent: best?.agent ?? null, reasons: best ? routeReasons(stats[best.agent]) : ['no eligible agent'], alternative };
}
export function renderRouteExplain(e, ui = PLAIN) {
    const lines = [e.agent ? `Selected ${ui.tone(e.agent, 'brand')} as ${e.role}.` : `No eligible agent for ${e.role}.`, ui.tone('Why:', 'muted')];
    for (const r of e.reasons)
        lines.push(`  ${r}`);
    if (e.alternative)
        lines.push(ui.tone(`Alternative: ${e.alternative.agent}, confidence ${e.alternative.confidence}`, 'muted'));
    return lines.join('\n');
}
export function renderStats(stats, ui = PLAIN) {
    const entries = Object.entries(stats);
    if (entries.length === 0)
        return 'No repo-local stats yet. Delegations (`framein ask --run`) accumulate them.';
    const lines = [ui.tone('Repo-local agent stats (from the ledger):', 'muted')];
    for (const [a, st] of entries)
        lines.push(`  ${ui.tone(a, 'brand')}: ${st.delegations} delegations, ${st.failures} failed, ${st.quotaHits} quota`);
    return lines.join('\n');
}
