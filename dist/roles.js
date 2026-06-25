// Role presets + routing score function (PRD section 5.2).
// Vendor-role mapping is NOT hardcoded: these are defaults the user can override.
import { AGENTS, ROLES } from './types.js';
/** Runtime guard: is `x` one of the three first-class agents? */
export function isAgent(x) {
    return AGENTS.includes(x);
}
/** Runtime guard: is `x` one of the five role presets? */
export function isRole(x) {
    return ROLES.includes(x);
}
export const DEFAULT_ROLE_PRIORITY = {
    lead: ['claude', 'codex'],
    implementer: ['claude', 'codex'],
    reviewer: ['codex', 'claude'],
    explainer: ['gemini', 'claude'],
    researcher: ['gemini', 'claude'],
};
/** Compliance rule (PRD non-goal): consumer Gemini login is not permitted. */
export function isForbiddenAuth(agent, auth) {
    return agent === 'gemini' && auth === 'consumer-login';
}
/** Repo-local routing bonus: reward local success, penalize local quota trouble (F-LOOP-7). */
export function repoBonus(st) {
    if (!st || st.delegations === 0)
        return 0;
    const successRate = (st.delegations - st.failures) / st.delegations; // 0..1
    return successRate * 2 - st.quotaHits * 0.5;
}
export const POLICY_PENALTY = Number.POSITIVE_INFINITY;
// score = roleFit + quotaScore - failurePenalty - costPenalty
// forbidden auth combos => -Infinity (never selected).
export function scoreAgent(agent, ctx) {
    const auth = ctx.authMode[agent];
    if (auth && isForbiddenAuth(agent, auth))
        return -POLICY_PENALTY;
    if (ctx.unavailable?.[agent])
        return -POLICY_PENALTY; // quota-exhausted / down => fail over to another agent
    const priority = (ctx.rolePriority ?? DEFAULT_ROLE_PRIORITY)[ctx.role] ?? [];
    const idx = priority.indexOf(agent);
    const roleFit = idx === -1 ? 0 : priority.length - idx;
    const quota = ctx.remainingQuota?.[agent];
    const quotaScore = quota === undefined ? 1 : quota * 2;
    const failurePenalty = (ctx.recentFailures?.[agent] ?? 0) * 1.5;
    const costPenalty = ctx.costBand?.[agent] ?? 0;
    return roleFit + quotaScore + repoBonus(ctx.repoStats?.[agent]) - failurePenalty - costPenalty;
}
export function selectAgent(candidates, ctx) {
    let best = null;
    let bestScore = -POLICY_PENALTY;
    for (const a of candidates) {
        const s = scoreAgent(a, ctx);
        if (s === -POLICY_PENALTY)
            continue;
        if (best === null || s > bestScore) {
            best = a;
            bestScore = s;
        }
    }
    return best;
}
