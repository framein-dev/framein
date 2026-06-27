import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapperFiles, genClaudeCommand, genGeminiCommand, genCodexSkill, WRAP_VERBS, PROVENANCE } from './wrappers.js';

const verb = (v: string) => WRAP_VERBS.find((w) => w.verb === v)!;

test('wrapperFiles: namespaced paths + logic-less (calls <bin> <verb> --json) + provenance', () => {
  const cl = wrapperFiles('claude');
  const verify = cl.find((f) => f.path === '.claude/commands/fr/verify.md')!;
  assert.ok(verify, 'claude verify lands under fr/ namespace');
  assert.match(verify.content, /framein verify --json/); // logic-less: defers to the engine
  assert.match(verify.content, /allowed-tools: Bash\(framein:\*\)/);
  assert.ok(verify.content.includes(PROVENANCE)); // uninstall can find our own files

  const gm = wrapperFiles('gemini').find((f) => f.path === '.gemini/commands/fr/verify.toml')!;
  assert.match(gm.content, /!\{framein verify --json \{\{args\}\}\}/); // Gemini shell-injection form
  assert.ok(gm.content.includes(PROVENANCE));

  const cx = wrapperFiles('codex').find((f) => f.path === '.agents/skills/fr-verify/SKILL.md')!;
  assert.ok(cx, 'codex verify is a SKILL.md skill (invoked as $fr-verify)');
  assert.match(cx.content, /framein verify --json/);
  assert.match(cx.content, /^name: fr-verify$/m); // skill name → $fr-verify
  assert.ok(cx.content.includes(PROVENANCE));
});

test('risk is wrapped → /fr:risk (Claude) · $fr-risk (Codex) — Blast Radius reachable from agents', () => {
  const cl = wrapperFiles('claude').find((f) => f.path === '.claude/commands/fr/risk.md');
  assert.ok(cl, 'claude /fr:risk wrapper exists');
  assert.match(cl!.content, /framein risk --json/); // risk emits structured output the agent ingests
  const cx = wrapperFiles('codex').find((f) => f.path === '.agents/skills/fr-risk/SKILL.md');
  assert.ok(cx, 'codex $fr-risk skill exists');
});

test('task is wrapped and forwards arguments (Task Contract from agents: /fr:task show · $fr-task amend …)', () => {
  const cl = wrapperFiles('claude').find((f) => f.path === '.claude/commands/fr/task.md');
  assert.ok(cl, 'claude /fr:task wrapper exists');
  assert.match(cl!.content, /framein task \$ARGUMENTS/); // subcommand (show/amend …) passed via args
  assert.doesNotMatch(cl!.content, /--json/);            // task takes a subcommand → no leading --json
  const cx = wrapperFiles('codex').find((f) => f.path === '.agents/skills/fr-task/SKILL.md');
  assert.ok(cx, 'codex $fr-task skill exists');
  assert.match(cx!.content, /\$ARGUMENTS/);              // the skill forwards the user's arguments too
});

test('capsule and decide are wrapped (Task Capsule · Independent Challenge resolution from agents)', () => {
  for (const v of ['capsule', 'decide']) {
    assert.ok(wrapperFiles('claude').some((f) => f.path === `.claude/commands/fr/${v}.md`), `/fr:${v} exists`);
    assert.ok(wrapperFiles('codex').some((f) => f.path === `.agents/skills/fr-${v}/SKILL.md`), `$fr-${v} exists`);
  }
});

test('challenge wrapper is independent: --run + --by <host> so a DIFFERENT model reviews', () => {
  // Each host names itself via --by so framein picks a reviewer != the calling model (no self-review).
  assert.match(genClaudeCommand(verb('challenge')).content, /framein challenge --run --by claude/);
  assert.match(genCodexSkill(verb('challenge')).content, /framein challenge --run --by codex/);
  assert.match(genGeminiCommand(verb('challenge')).content, /framein challenge --run --by gemini/);
  // other verbs do NOT carry --run/--by
  assert.doesNotMatch(genClaudeCommand(verb('verify')).content, /--by/);
});

test('non-json verbs (start) omit --json; every host covers all WRAP_VERBS', () => {
  assert.match(genClaudeCommand(verb('start')).content, /!framein start \$ARGUMENTS/);
  assert.doesNotMatch(genClaudeCommand(verb('start')).content, /--json/);
  for (const host of ['claude', 'codex', 'gemini'] as const) {
    assert.equal(wrapperFiles(host).length, WRAP_VERBS.length);
  }
});

test('generators honor a custom bin name (fr / frame aliases)', () => {
  assert.match(genClaudeCommand(verb('ship'), 'fr').content, /fr ship --json/);
  assert.match(genGeminiCommand(verb('ship'), 'fr').content, /fr ship --json/);
  assert.match(genCodexSkill(verb('ship'), 'fr').content, /fr ship --json/);
});
