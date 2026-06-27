// Native command wrappers (ADR-0010/0011). LOGIC-LESS: each wrapper just runs `<bin> <verb> [--json]`
// and presents the result — the single source of truth stays the framein engine (no per-host logic →
// no drift). Pure generators; the CLI (`fr integrations`) writes them. Namespace = `fr` (ADR-0011):
// Claude/Gemini `/fr:<verb>`, Codex `$fr-<verb>` (a SKILL.md skill under `.agents/skills`).
// Each host's surface syntax differs by design (ADR-0010 rejected forcing one syntax); only the verb +
// `fr` namespace are unified. Files carry PROVENANCE so uninstall only removes our own.
export const WRAP_VERBS = [
    { verb: 'start', json: false, desc: 'When beginning work: start or reset the Task Contract that defines done' },
    { verb: 'verify', json: true, desc: 'Before claiming done: run build/test validation against the contract' },
    { verb: 'ship', json: true, desc: 'Before ship: check readiness, risk, commit, and deploy guidance' },
    { verb: 'rescue', json: true, desc: 'When stuck in a repair loop: detect thrash and show recovery options' },
    { verb: 'status', json: true, desc: 'When reorienting: show current roles, lock, and Framein state' },
    { verb: 'challenge', json: false, run: true, independent: true, desc: 'When stuck or before accepting a risky plan: ask a different model to challenge it' },
    { verb: 'risk', json: true, desc: 'Before editing sensitive areas: inspect blast radius and required gates' },
    { verb: 'task', json: false, desc: 'When scope changes: show or amend the task contract and definition of done' },
    { verb: 'capsule', json: false, desc: 'For handoff, switch, session compaction, or quota: prepare the next lead' },
    { verb: 'decide', json: false, desc: 'After challenge: accept or reject the reviewer objection and record the decision' },
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
/** Codex skill — invoked as `$fr-<verb>` (repo skills live in .agents/skills/<name>/SKILL.md). */
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
    return { path: `.agents/skills/fr-${v.verb}/SKILL.md`, content };
}
export function wrapperFiles(host, bin = 'framein') {
    const gen = host === 'claude' ? genClaudeCommand : host === 'gemini' ? genGeminiCommand : genCodexSkill;
    return WRAP_VERBS.map((v) => gen(v, bin));
}
