// Task Contract (F-LOOP-1, ADR-0008): fix "what to treat as done" so every agent judges against
// the same bar. Pure logic only — the store wiring lives in store.ts and the lead drafting a
// contract from the user's prompt is the deferred live path. The contract is stored as structured
// task state (memory scope 'task') and projected into the managed block as standing intent.
import { PLAIN } from './ui/theme.js';
export function emptyContract(goal = '') {
    return { goal, mustPreserve: [], acceptance: [], protected: [], nonGoals: [] };
}
/** Set the goal, or append to a list field. Returns a new contract (does not mutate input). */
export function amendContract(c, field, value) {
    const next = {
        goal: c.goal,
        mustPreserve: [...c.mustPreserve],
        acceptance: [...c.acceptance],
        protected: [...c.protected],
        nonGoals: [...c.nonGoals],
    };
    switch (field) {
        case 'goal':
            next.goal = value;
            break;
        case 'preserve':
            next.mustPreserve.push(value);
            break;
        case 'acceptance':
            next.acceptance.push(value);
            break;
        case 'protected':
            next.protected.push(value);
            break;
        case 'nongoal':
            next.nonGoals.push(value);
            break;
        default: {
            const _x = field;
            throw new Error(`unknown contract field: ${String(_x)}`);
        }
    }
    return next;
}
export const GUIDED_CONTRACT_STEPS = [
    { field: 'goal', question: 'Goal — what should be true when this is done?' },
    { field: 'acceptance', question: 'Acceptance — how will you verify it? (enter to skip)' },
    { field: 'nongoal', question: 'Non-goal — what is explicitly out of scope? (enter to skip)' },
    { field: 'preserve', question: 'Must preserve — what must keep working? (enter to skip)' },
];
/** Build a contract from guided answers: goal is set (trimmed), blank optional answers are skipped. Pure. */
export function buildGuidedContract(answers) {
    let c = emptyContract((answers.goal ?? '').trim());
    for (const { field } of GUIDED_CONTRACT_STEPS) {
        if (field === 'goal')
            continue;
        const v = (answers[field] ?? '').trim();
        if (v)
            c = amendContract(c, field, v);
    }
    return c;
}
/** Soft warnings (the "ambiguous items" the lead would confirm once). Empty = well-formed. */
export function contractIssues(c) {
    const issues = [];
    if (!c.goal.trim())
        issues.push('no goal set');
    if (c.acceptance.length === 0)
        issues.push('no acceptance criteria — how will "done" be judged?');
    return issues;
}
const inline = (xs) => xs.join('; ');
/** Compact digest for the managed block (always-loaded standing intent). */
export function renderContractDigest(c) {
    if (!c.goal.trim() && c.acceptance.length === 0)
        return '_No active task contract._';
    const lines = [`**Goal:** ${c.goal || '(unset)'}`];
    if (c.acceptance.length)
        lines.push(`- Acceptance: ${inline(c.acceptance)}`);
    if (c.mustPreserve.length)
        lines.push(`- Must preserve: ${inline(c.mustPreserve)}`);
    if (c.protected.length)
        lines.push(`- Protected: ${inline(c.protected)}`);
    if (c.nonGoals.length)
        lines.push(`- Non-goals: ${inline(c.nonGoals)}`);
    return lines.join('\n');
}
/** Full multi-line view for `frame task show`. */
export function renderContractFull(c, ui = PLAIN) {
    const section = (label, xs) => xs.length ? `  ${ui.tone(label, 'muted')}:\n${xs.map((x) => `    - ${x}`).join('\n')}` : `  ${ui.tone(label, 'muted')}: (none)`;
    return [
        `Task goal: ${ui.bold(c.goal || '(unset)')}`,
        section('must preserve', c.mustPreserve),
        section('acceptance', c.acceptance),
        section('protected', c.protected),
        section('non-goals', c.nonGoals),
    ].join('\n');
}
