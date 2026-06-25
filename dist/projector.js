// Projects the single source of truth into the three native context files.
// The canonical CORE BLOCK is byte-identical across all three => guaranteed sync.
import { buildAdrDigest } from './adr.js';
import { renderContractDigest } from './task.js';
import { wrapManaged, upsertManagedBlock } from './managedBlock.js';
export function buildCoreBlock(state) {
    const rulesVal = state.config['rules'];
    const rules = typeof rulesVal === 'string' && rulesVal.trim() ? rulesVal.trim() : '_No project rules defined._';
    const roleEntries = Object.entries(state.roles);
    const roleLines = roleEntries.length === 0
        ? '_No roles assigned._'
        : roleEntries.map(([r, a]) => `- **${r}** → ${a}`).join('\n');
    const contract = state.taskContract ? renderContractDigest(state.taskContract) : '_No active task contract._';
    // Operating guide for the AGENT (ADR-0012): framein is driven from inside your normal flow, not by the
    // human typing long commands. Run any verb with the shell (`framein <verb>`) or the host slash command.
    const guide = [
        'This project is kept aligned by **framein** (intent → validation → continuity). Drive it from your',
        'normal flow — run a verb with the shell (`framein <verb>`) or the host command (`/fr:<verb>`, Codex',
        '`$fr-<verb>`). Automation-facing verbs expose `--json`; use the generated wrapper syntax when available.',
        'On Windows PowerShell, use `framein.cmd <verb>` if the npm `.ps1` shim is blocked; generated wrappers already do this.',
        '',
        '- **At session start (and after any model switch)** — run `framein capsule` first to load where the',
        '  project left off (last-green commit, recent changes, open blocker, decisions). This is how context',
        '  follows you across models — don\'t ask the user to re-explain.',
        '- **Task start** — fix what "done" means before coding: `framein start "<goal>"`, then',
        '  `framein task amend acceptance|nongoal|protected "<…>"`. Changes auto-apply and show up in `git diff` —',
        '  keep them honest; the human reviews. Don\'t silently drift the contract.',
        '- **Before you claim done** — run the Validation Gate: `framein verify`. Never report "done" without it.',
        '- **Ship** — `framein ship` for commit/deploy readiness.',
        '- **Risky change** (auth · payments · migrations · deploy · secrets) — `framein risk`, then satisfy the required gates.',
        '- **Stuck in a repeat-fix loop** — `framein rescue` (it proposes options; it never auto-acts).',
        '- **Want a second opinion** — `framein challenge "<proposal>" --run` gets an INDEPENDENT model\'s verdict',
        '  (a *different* model reviews — don\'t write the critique yourself; you keep the lead and `decide`).',
        '- **Hand work to another model** — `framein capsule <agent>`, then exit; framein switches to that model,',
        '  which loads the capsule on arrival. The context follows the handoff automatically.',
        '',
        'The **Task Contract** below is the definition of done — honor it. The human stays the final gate.',
    ].join('\n');
    return [
        '## Working with framein', guide, '',
        '## Task Contract', contract, '',
        '## Project Rules', rules, '',
        '_Project defaults — change them with `framein rules set "<…>"` (edits typed directly here are overwritten on sync). They guide the agent; the Validation Gate is what\'s enforced._', '',
        '## Agent Roles', roleLines, '',
        '## Architecture Decisions (digest)', buildAdrDigest(state.adrs),
    ].join('\n');
}
/** The managed block (markers + canonical core), byte-identical across all three files. */
export function renderManagedBlock(state) {
    return wrapManaged(buildCoreBlock(state));
}
/** A from-scratch native file (heading + managed block); used when no file exists yet. */
function projectFresh(title, state) {
    return upsertManagedBlock(null, title, renderManagedBlock(state));
}
export function projectClaudeMd(state) { return projectFresh('CLAUDE.md', state); }
export function projectAgentsMd(state) { return projectFresh('AGENTS.md', state); }
export function projectGeminiMd(state) { return projectFresh('GEMINI.md', state); }
export function projectAll(state) {
    return {
        'CLAUDE.md': projectClaudeMd(state),
        'AGENTS.md': projectAgentsMd(state),
        'GEMINI.md': projectGeminiMd(state),
    };
}
