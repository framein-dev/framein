// Headless delegation (ADR-0007 B-2). The PRIMARY way framein pulls another role into a session:
// drive each CLI's non-interactive print mode over child_process pipes — NO PTY. This sidesteps the
// Windows ConPTY/node-pty risk and keeps zero runtime deps. Human-in-the-loop attach uses Node's
// built-in `stdio:'inherit'` (interactiveCommand below) — a programmatic PTY (node-pty) is
// deliberately not used (ADR-0009). These builders are pure; the spawn lives in cli.ts and is
// live-verified against real claude/codex/gemini.
import { DEFAULT_ROLE_PRIORITY } from './roles.js';
export const HANDOFF_START_PROMPT = 'Framein handoff: run `framein capsule` first, restate the current task contract briefly, then continue from the local facts. Do not ask the user to re-explain context.';
/**
 * Non-interactive one-shot invocation for each agent (prompt via stdin, response on stdout).
 * `opts.trustFlags` (from trustPlan, F-TRUST) are FIXED per-agent permission-bypass flags appended
 * to argv — still no user input there, so it stays shell-safe under shell:true.
 */
export function buildInvocation(agent, prompt, opts = {}) {
    const trust = opts.trustFlags ?? [];
    switch (agent) {
        case 'claude': return { command: 'claude', args: ['-p', ...trust], stdin: prompt };
        case 'codex': return { command: 'codex', args: ['exec', '--skip-git-repo-check', ...trust], stdin: prompt }; // exec refuses untrusted/non-git dirs otherwise
        // gemini -p takes the prompt as a value and APPENDS stdin; `--prompt=` (empty) + stdin keeps the
        // prompt off argv (shell-safe), `--skip-trust` is required for headless untrusted dirs. Verified.
        case 'gemini': return { command: 'gemini', args: ['--prompt=', '--skip-trust', ...trust], stdin: prompt };
        default: {
            const _exhaustive = agent;
            throw new Error(`unknown agent: ${String(_exhaustive)}`);
        }
    }
}
/** Which agent runs a role: the explicit assignment, else the role's default-priority head. */
export function resolveAgent(roles, role) {
    return roles[role] ?? DEFAULT_ROLE_PRIORITY[role][0];
}
/** The fixed shell command (flags only, no user input) that runDelegated runs with shell:true. */
export function invocationCommand(inv) {
    return [inv.command, ...inv.args].join(' ');
}
/**
 * The bare interactive command for an agent — launched with stdio:'inherit' so the human drives the
 * agent's own TUI directly, inside the already-synced frame (ADR-0007 B-2 interactive path, zero-dep).
 * A true programmatic PTY (read/inject/resize the agent's terminal) would need node-pty — a native
 * runtime dependency that breaks framein's zero-dep invariant (ADR-0003) — and framein observes via
 * the store/ledger, not by screen-scraping a TTY, so it is deliberately NOT used.
 */
// `resume` re-enters the agent's MOST RECENT session in this cwd (handoff continuity, F-CAPSULE/ADR-0009):
// claude `--continue`, codex `resume --last`, gemini `--resume`. framein decides re-entry from its own
// ledger (a prior enter/return for this agent) — it never scrapes the printed session id (ADR-0009).
function shellQuote(arg) {
    if (process.platform === 'win32')
        return `"${arg.replace(/"/g, '\\"')}"`;
    return `'${arg.replace(/'/g, `'\\''`)}'`;
}
export function interactiveCommand(agent, resume = false, trustFlags = [], initialPrompt) {
    // F-TRUST placement: codex `resume` is a SUBCOMMAND, so top-level bypass flags must come BEFORE it
    // (`codex --full-auto resume --last`); appending after the subcommand makes codex reject them. claude
    // `--continue` and gemini `--resume` are plain flags, so trust flags can follow.
    const t = trustFlags.length ? ` ${trustFlags.join(' ')}` : '';
    const p = initialPrompt ? ` ${shellQuote(initialPrompt)}` : '';
    switch (agent) {
        case 'claude': return `claude${resume ? ' --continue' : ''}${t}${p}`;
        case 'codex': return `codex${t}${resume ? ' resume --last' : ''}${p}`;
        case 'gemini': return `gemini${resume ? ' --resume' : ''}${t}${initialPrompt ? ` --prompt-interactive${p}` : ''}`;
        default: {
            const _exhaustive = agent;
            throw new Error(`unknown agent: ${String(_exhaustive)}`);
        }
    }
}
/** Human-readable preview for `--show`: the fixed command + a peek at the stdin prompt. */
export function renderInvocation(inv) {
    const peek = inv.stdin.length > 60 ? inv.stdin.slice(0, 60) + '…' : inv.stdin;
    return `${invocationCommand(inv)}  ⟵ stdin: ${JSON.stringify(peek)}`;
}
