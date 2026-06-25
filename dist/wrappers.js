// Native command wrappers (ADR-0010/0011). LOGIC-LESS: each wrapper just runs `<bin> <verb> [--json]`
// and presents the result — the single source of truth stays the framein engine (no per-host logic →
// no drift). Pure generators; the CLI (`fr integrations`) writes them. Namespace = `fr` (ADR-0011):
// Claude/Gemini `/fr:<verb>`, Codex `$fr-<verb>` (a SKILL.md skill — Codex's `/prompts` are deprecated).
// Each host's surface syntax differs by design (ADR-0010 rejected forcing one syntax); only the verb +
// `fr` namespace are unified. Files carry PROVENANCE so uninstall only removes our own.
export const WRAP_VERBS = [
    { verb: 'start', json: false, desc: 'Start a Task Contract (what "done" means)' },
    { verb: 'verify', json: true, desc: 'Validation Gate: build/test vs the contract' },
    { verb: 'ship', json: true, desc: 'Ship gate: readiness + commit/deploy guidance' },
    { verb: 'rescue', json: true, desc: 'Detect a repair loop and propose options' },
    { verb: 'status', json: true, desc: 'Show framein state' },
    { verb: 'challenge', json: false, run: true, independent: true, desc: 'Get an INDEPENDENT model\'s verdict on a proposal (a different model reviews)' },
    { verb: 'risk', json: true, desc: 'Blast Radius: risk level + required gates for the change' },
    { verb: 'task', json: false, desc: 'Task Contract: show / amend the definition of done' },
    { verb: 'capsule', json: false, desc: 'Task Capsule: handoff-free continuity snapshot' },
    { verb: 'decide', json: false, desc: 'Resolve an open reviewer debate (accept / reject)' },
];
export const PROVENANCE = 'generated-by: framein (fr integrations) — do not edit; regenerate with `fr integrations install`';
// host = the agent this wrapper runs inside; passed as `--by <host>` for `independent` verbs so framein
// can pick a reviewer that is NOT this agent.
const cmd = (bin, v, host) => `${bin} ${v.verb}${v.json ? ' --json' : ''}${v.run ? ' --run' : ''}${v.independent ? ` --by ${host}` : ''}`;
export function genClaudeCommand(v, bin = 'framein') {
    const content = [
        '---',
        `description: ${v.desc}`,
        `allowed-tools: Bash(${bin}:*)`,
        `# ${PROVENANCE}`,
        '---',
        '',
        `Run \`!${cmd(bin, v, 'claude')} $ARGUMENTS\` and present the result to the user clearly.`,
        '',
    ].join('\n');
    return { path: `.claude/commands/fr/${v.verb}.md`, content };
}
export function genGeminiCommand(v, bin = 'framein') {
    const content = [
        `# ${PROVENANCE}`,
        `description = ${JSON.stringify(v.desc)}`,
        `prompt = ${JSON.stringify(`Run framein and present the result:\n!{${cmd(bin, v, 'gemini')} {{args}}}`)}`,
        '',
    ].join('\n');
    return { path: `.gemini/commands/fr/${v.verb}.toml`, content };
}
/** Codex skill — invoked as `$fr-<verb>` (Codex skills live in .codex/skills/<name>/SKILL.md and are
 *  triggered with `$<name>`; the older `/prompts:` path is deprecated, ADR-0010). */
export function genCodexSkill(v, bin = 'framein') {
    const content = [
        '---',
        `name: fr-${v.verb}`,
        `description: ${JSON.stringify(v.desc)}`,
        `# ${PROVENANCE}`,
        '---',
        '',
        `Run \`${cmd(bin, v, 'codex')} $ARGUMENTS\` and present the result to the user clearly.`,
        '',
    ].join('\n');
    return { path: `.codex/skills/fr-${v.verb}/SKILL.md`, content };
}
export function wrapperFiles(host, bin = 'framein') {
    const gen = host === 'claude' ? genClaudeCommand : host === 'gemini' ? genGeminiCommand : genCodexSkill;
    return WRAP_VERBS.map((v) => gen(v, bin));
}
