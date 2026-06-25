import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./cli.js', import.meta.url));

// Force plain output so assertions are color-independent regardless of the runner's env (a dev shell
// may export FORCE_COLOR; NO_COLOR wins in resolveCapabilities). Real color is covered by ui unit tests.
const TEST_ENV = { ...process.env, NO_COLOR: '1' };

/** Run the CLI; returns { code, stdout, stderr }. Never throws on non-zero exit. */
function run(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  return runWithEnv(cwd, args, TEST_ENV);
}

function runWithEnv(cwd: string, args: string[], env: NodeJS.ProcessEnv): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function runAsync(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { cwd, env: TEST_ENV });
    let stdout = '';
    let stderr = '';
    p.stdout.setEncoding('utf8'); p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.setEncoding('utf8'); p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Like run(), but feeds `input` on stdin (used for `mcp serve` and stdin asks). */
function runInput(cwd: string, args: string[], input: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { cwd, input, encoding: 'utf8', env: TEST_ENV });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? '' };
  }
}

function withTmp(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'framein-cli-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('cli init projects the three native files and exits 0', () => {
  withTmp((dir) => {
    const r = run(dir, ['init']);
    assert.equal(r.code, 0);
    for (const f of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']) assert.ok(existsSync(join(dir, f)), `${f} missing`);
  });
});

test('cli init ignores the rebuildable .frame cache', () => {
  withTmp((dir) => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const r = run(dir, ['init']);
    assert.equal(r.code, 0);
    assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^\.frame\/$/m);
    execFileSync('git', ['check-ignore', '-q', '.frame/store.db'], { cwd: dir });
  });
});

test('cli role set rejects an invalid agent (exit 1)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['role', 'set', 'reviewer', 'banana']);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /banana|agent/i);
    // the bad value must not have been written
    const list = run(dir, ['role', 'list']);
    assert.ok(!/banana/.test(list.stdout));
  });
});

test('cli role set errors when the agent argument is missing (no silent list)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['role', 'set', 'lead']);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /usage|agent/i);
  });
});

test('cli role set accepts a valid agent (exit 0)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['role', 'set', 'lead', 'claude']);
    assert.equal(r.code, 0);
  });
});

test('cli adr supersede + show reflects the correction', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.equal(run(dir, ['adr', 'add', 'Use global lock']).code, 0);
    assert.equal(run(dir, ['adr', 'supersede', '1', 'Use scope lock']).code, 0);
    const show1 = run(dir, ['adr', 'show', '1']);
    assert.equal(show1.code, 0);
    assert.match(show1.stdout, /superseded/i);
    const show2 = run(dir, ['adr', 'show', '2']);
    assert.match(show2.stdout, /Use scope lock/);
    // the projected file shows the superseded marker too
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(claude, /superseded/i);
    // double-supersede of the now-superseded ADR-1 is rejected
    assert.equal(run(dir, ['adr', 'supersede', '1', 'again']).code, 1);
  });
});

test('cli rejects unknown commands and subcommands (exit 1)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.equal(run(dir, ['nope']).code, 1);
    assert.equal(run(dir, ['role', 'banana']).code, 1);
    assert.equal(run(dir, ['adr', 'banana']).code, 1);
  });
});

test('cli adr show validates the id argument (exit 1)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.equal(run(dir, ['adr', 'show', 'abc']).code, 1);
    assert.equal(run(dir, ['adr', 'show']).code, 1);
    assert.equal(run(dir, ['adr', 'show', '0']).code, 1);
  });
});

test('cli bare invocation without a TTY prints help and exits 0 (automation-safe)', () => {
  withTmp((dir) => {
    // run() ignores stdin → child sees no TTY → must NOT drop into the interactive lobby (would hang).
    // The interactive bare → shell path is TTY-only and can't be exercised without a pty (ADR-0009).
    const r = run(dir, []);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /framein \(frame\)/);
  });
});

test('contract changes are surfaced loudly + point to git for review (start + amend)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const started = run(dir, ['start', 'add Google login']).stdout;
    assert.match(started, /contract changed/i);   // loud notice (auto-applied, not silent)
    assert.match(started, /git diff/);             // review path → the git-tracked managed block
    const amended = run(dir, ['task', 'amend', 'nongoal', 'redesign the whole UI']).stdout;
    assert.match(amended, /contract changed/i);
  });
});

test('bare `start` without a TTY errors with usage (guided start never hangs automation)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['start']); // no goal, no TTY → must fall back to usage, not the interactive wizard
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /usage|goal/i);
  });
});

test('capsule <agent> arms a handoff (carry the capsule to another model); show + bad target still behave', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const armed = run(dir, ['capsule', 'codex']);
    assert.equal(armed.code, 0);
    assert.match(armed.stdout, /codex/);
    assert.match(armed.stdout, /handoff|switch|exit/i);   // tells you exiting triggers the switch
    const show = run(dir, ['capsule', 'show']);
    assert.match(show.stdout, /task:/); // snapshot still renders
    assert.match(show.stdout, /handoff: codex \(armed\)/); // armed target is part of the capsule
    assert.equal(run(dir, ['capsule', 'banana']).code, 1);       // invalid agent target → error
  });
});

test('cli --version prints the package version', () => {
  withTmp((dir) => {
    const r = run(dir, ['--version']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /framein \d+\.\d+\.\d+/);
  });
});

test('cli <cmd> --help prints command usage', () => {
  withTmp((dir) => {
    const r = run(dir, ['adr', '--help']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /supersede/);
  });
});

test('cli export then import rebuilds the store from the git-canonical snapshot', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    run(dir, ['adr', 'add', 'Decision X']);
    run(dir, ['role', 'set', 'lead', 'claude']);
    assert.equal(run(dir, ['export']).code, 0);
    assert.ok(existsSync(join(dir, 'framein.store.json')), 'snapshot written');
    // drop the db cache; keep only the committed snapshot
    rmSync(join(dir, '.frame'), { recursive: true, force: true });
    assert.equal(run(dir, ['import']).code, 0);
    assert.match(run(dir, ['adr', 'list']).stdout, /Decision X/);
    assert.match(run(dir, ['role', 'list']).stdout, /lead -> claude/);
  });
});

test('cli mcp patch prints framein registration for all three CLIs', () => {
  withTmp((dir) => {
    const r = run(dir, ['mcp', 'patch']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /mcpServers/);
    assert.match(r.stdout, /\[mcp_servers\.framein\]/);
  });
});

test('cli mcp and skills run and exit 0', () => {
  withTmp((dir) => {
    assert.equal(run(dir, ['mcp']).code, 0);
    const sk = run(dir, ['skills']);
    assert.equal(sk.code, 0);
    assert.match(sk.stdout, /adr-flow/);
  });
});

test('cli ask records to the ledger (live delegation deferred)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.equal(run(dir, ['ask', 'reviewer', 'please review the diff']).code, 0);
    assert.match(run(dir, ['ledger', 'list']).stdout, /ask reviewer/);
    // an invalid role is rejected
    assert.equal(run(dir, ['ask', 'boss', 'hi']).code, 1);
  });
});

test('cli task: start projects a contract into all files, amend appends, show prints it', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.equal(run(dir, ['start', 'add Google login']).code, 0); // front-stage alias of `task start`
    assert.match(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), /add Google login/); // standing intent in managed block
    run(dir, ['task', 'amend', 'acceptance', 'existing email login works']);
    const show = run(dir, ['task', 'show']);
    assert.match(show.stdout, /add Google login/);
    assert.match(show.stdout, /existing email login works/);
    assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /existing email login works/); // amend re-projects
    assert.equal(run(dir, ['task', 'amend', 'bogus', 'x']).code, 1); // invalid field rejected
  });
});

test('cli task amend serializes concurrent writers without losing criteria', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framein-cli-'));
  try {
    run(dir, ['init']);
    run(dir, ['start', 'build a concurrent contract']);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      runAsync(dir, ['task', 'amend', 'acceptance', `criterion ${i}`]),
    ));
    for (const r of results) assert.equal(r.code, 0, r.stderr + r.stdout);
    const show = run(dir, ['task', 'show']);
    for (let i = 0; i < 6; i++) assert.match(show.stdout, new RegExp(`criterion ${i}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli debt and explain summarize the change at hand', () => {
  withTmp((dir) => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir });
    run(dir, ['init']);
    run(dir, ['start', 'add login']);
    writeFileSync(join(dir, 'x.ts'), '// TODO: later\nconst a = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir }); // stage so `git diff HEAD` sees it
    const d = run(dir, ['debt']);
    assert.equal(d.code, 0);
    assert.match(d.stdout, /Debt delta/);
    assert.match(d.stdout, /TODO/);
    const e = run(dir, ['explain']);
    assert.match(e.stdout, /Ownership brief: add login/);
    assert.match(e.stdout, /What will likely break next/);
    const ej = JSON.parse(run(dir, ['explain', '--json']).stdout);
    assert.equal(ej.command, 'explain');
    assert.equal(ej.goal, 'add login');
    assert.match(ej.skeleton, /Ownership brief: add login/);
    assert.ok(ej.changedFiles.includes('x.ts'));
  });
});

test('cli recipe list/show/compile projects a protocol per agent (no store needed)', () => {
  withTmp((dir) => {
    assert.match(run(dir, ['recipe', 'list']).stdout, /feature/);
    assert.match(run(dir, ['recipe', 'show', 'bugfix']).stdout, /reproduce/);
    const c = run(dir, ['recipe', 'compile', 'feature', 'claude']);
    assert.equal(c.code, 0);
    assert.match(c.stdout, /claude/i);
    assert.match(c.stdout, /define_contract/);
    assert.equal(run(dir, ['recipe', 'compile', 'feature', 'bogus']).code, 1); // invalid agent
  });
});

test('cli stats and route explain report repo-local routing from the ledger', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.match(run(dir, ['stats']).stdout, /No repo-local stats/i);
    run(dir, ['ledger', 'add', 'delegated', 'reviewer:codex']);
    run(dir, ['ledger', 'add', 'delegated', 'reviewer:codex']);
    assert.match(run(dir, ['stats']).stdout, /codex: 2 delegations/);
    const r = run(dir, ['route', 'explain', 'reviewer']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Selected codex as reviewer/);
    assert.match(r.stdout, /success/i);
  });
});

test('cli challenge/decide drives the debate to resolved', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    run(dir, ['challenge', 'use a transaction']);
    run(dir, ['challenge', '--block', 'race remains', '--require', 'add unique index']);
    const r = run(dir, ['decide', 'accept', 'added unique index']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Resolved \(lead-accepted\)/);
  });
});

test('cli challenge attributes wrapper-originated proposals to the calling model', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['challenge', 'ship the tag index', '--by', 'codex']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /proposal \(codex\): ship the tag index/);
  });
});

test('cli challenge escalates to the human after 2 rounds without agreement', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    run(dir, ['challenge', 'approach A']);
    run(dir, ['challenge', '--block', 'c1', '--require', 'do B']);
    run(dir, ['decide', 'reject', 'keep A']);
    run(dir, ['challenge', '--block', 'c2', '--require', 'really do B']);
    const r = run(dir, ['challenge', '--show']);
    assert.match(r.stdout, /Escalate to human/);
    assert.match(r.stdout, /A: keep A/);
    assert.match(r.stdout, /B: really do B/);
  });
});

test('cli pause saves a capsule and capsule show rebuilds it from the store', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    run(dir, ['start', 'add Google login']);
    run(dir, ['adr', 'add', 'keep session cookie']);
    run(dir, ['ledger', 'add', 'edit', 'auth.ts']);
    const pause = run(dir, ['pause']);
    assert.equal(pause.code, 0);
    assert.match(pause.stdout, /capsule saved/i);
    assert.match(pause.stdout, /task: add Google login/);
    assert.match(pause.stdout, /ADR-1: keep session cookie/);
    const show = run(dir, ['capsule', 'show']);
    assert.match(show.stdout, /add Google login/);
    assert.match(show.stdout, /edit auth\.ts/); // recent activity from the ledger
    assert.match(run(dir, ['resume']).stdout, /No manual handoff needed/);
  });
});

test('cli risk flags sensitive changed files as HIGH with the required gate', () => {
  withTmp((dir) => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir });
    run(dir, ['init']);
    mkdirSync(join(dir, 'src', 'auth'), { recursive: true });
    writeFileSync(join(dir, 'src', 'auth', 'login.ts'), 'export const x = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir }); // stage so it shows in `git diff HEAD`
    const r = run(dir, ['risk']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /HIGH/);
    assert.match(r.stdout, /auth/);
    assert.match(r.stdout, /security review/i);
  });
});

test('cli risk includes untracked sensitive files after a baseline commit', () => {
  withTmp((dir) => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir });
    run(dir, ['init']);
    mkdirSync(join(dir, 'src', 'auth'), { recursive: true });
    writeFileSync(join(dir, 'src', 'auth', 'login.ts'), 'export const x = 1;\n');
    const j = JSON.parse(run(dir, ['risk', '--json']).stdout.trim());
    assert.equal(j.level, 'high');
    assert.deepEqual(j.hits.map((h: { file: string }) => h.file), ['src/auth/login.ts']);
  });
});

test('cli risk includes files before the first commit', () => {
  withTmp((dir) => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    run(dir, ['init']);
    mkdirSync(join(dir, 'src', 'auth'), { recursive: true });
    writeFileSync(join(dir, 'src', 'auth', 'login.ts'), 'export const x = 1;\n');
    const j = JSON.parse(run(dir, ['risk', '--json']).stdout.trim());
    assert.equal(j.level, 'high');
    assert.ok(j.hits.some((h: { file: string }) => h.file === 'src/auth/login.ts'));
  });
});

test('cli rescue surfaces a repair loop with options and the no-auto-action guarantee', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.match(run(dir, ['rescue']).stdout, /No repair loop/i); // clean ledger
    for (let i = 0; i < 3; i++) run(dir, ['ledger', 'add', 'edit', 'x.ts']);
    const r = run(dir, ['rescue']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /repair loop/i);
    assert.match(r.stdout, /x\.ts/);
    assert.match(r.stdout, /No action taken automatically/);
  });
});

test('cli checkpoint records the commit and rewind previews the reset (no --force)', () => {
  withTmp((dir) => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir });
    run(dir, ['init']);
    assert.equal(run(dir, ['rewind']).code, 1); // nothing recorded yet
    assert.match(run(dir, ['checkpoint', 'green1']).stdout, /Checkpoint recorded/);
    const rw = run(dir, ['rewind']); // preview only
    assert.equal(rw.code, 0);
    assert.match(rw.stdout, /would rewind/);
    assert.match(rw.stdout, /git reset --hard/);
  });
});

test('cli status --json emits machine-readable state (ADR-0010)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['status', '--json']);
    assert.equal(r.code, 0);
    const j = JSON.parse(r.stdout.trim());
    assert.equal(j.schemaVersion, 1);
    assert.equal(j.command, 'status');
    assert.equal(j.roles.implementer, 'claude');
    assert.equal(typeof j.decisions, 'number');
  });
});

test('cli verify --json returns the gate as structured JSON', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 't', scripts: { test: "node -e \"console.log('pass 2'); console.log('fail 0')\"" } }));
    const r = run(dir, ['verify', '--json']);
    const j = JSON.parse(r.stdout.trim());
    assert.equal(j.command, 'verify');
    assert.equal(j.ready, true);
    assert.ok(Array.isArray(j.checks) && j.checks.some((c: { label: string }) => c.label === 'Tests'));
  });
});

test('cli ship --json includes readiness + commit/deploy + risk', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    run(dir, ['start', 'add x']);
    const r = run(dir, ['ship', '--json']); // no build/test here -> not ready
    assert.equal(r.code, 1);
    const j = JSON.parse(r.stdout.trim());
    assert.equal(j.command, 'ship');
    assert.equal(j.ready, false);
    assert.equal(j.safeToCommit, false);
    assert.ok('risk' in j);
  });
});

test('cli --json: task show / route explain / stats are structured', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    run(dir, ['start', 'add login']);
    const t = JSON.parse(run(dir, ['task', 'show', '--json']).stdout.trim());
    assert.equal(t.command, 'task');
    assert.equal(t.contract.goal, 'add login');
    run(dir, ['ledger', 'add', 'delegated', 'reviewer:codex']);
    const ro = JSON.parse(run(dir, ['route', 'explain', 'reviewer', '--json']).stdout.trim());
    assert.equal(ro.command, 'route');
    assert.equal(ro.agent, 'codex');
    const s = JSON.parse(run(dir, ['stats', '--json']).stdout.trim());
    assert.equal(s.command, 'stats');
    assert.equal(s.stats.codex.delegations, 1);
  });
});

test('cli rescue --json reports the repair-loop report', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    for (let i = 0; i < 3; i++) run(dir, ['ledger', 'add', 'edit', 'x.ts']);
    const j = JSON.parse(run(dir, ['rescue', '--json']).stdout.trim());
    assert.equal(j.command, 'rescue');
    assert.equal(j.triggered, true);
    assert.ok(Array.isArray(j.signals) && j.signals.length > 0);
  });
});

test('cli debt --json / risk --json emit structured deltas/levels', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const d = JSON.parse(run(dir, ['debt', '--json']).stdout.trim());
    assert.equal(d.command, 'debt');
    assert.equal(typeof d.addedLines, 'number');
    const r = JSON.parse(run(dir, ['risk', '--json']).stdout.trim());
    assert.equal(r.command, 'risk');
    assert.ok('level' in r);
  });
});

test('cli verify runs the project test script and reports the parsed result', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 't', scripts: { test: "node -e \"console.log('pass 2'); console.log('fail 0')\"" } }));
    const r = run(dir, ['verify']);
    assert.equal(r.code, 0); // verify is informational
    assert.match(r.stdout, /Tests/);
    assert.match(r.stdout, /2 passed/);
  });
});

test('cli store open tolerates concurrent read/validation/export commands', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framein-cli-'));
  try {
    run(dir, ['init']);
    run(dir, ['start', 'parallel validation commands']);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 't',
      scripts: {
        build: "node -e \"console.log('build ok')\"",
        test: "node -e \"console.log('pass 1'); console.log('fail 0')\"",
      },
    }));
    const results = await Promise.all([
      runAsync(dir, ['verify', '--json']),
      runAsync(dir, ['ship', '--json']),
      runAsync(dir, ['export']),
    ]);
    for (const r of results) assert.equal(r.code, 0, r.stderr + r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli ship is the enforced gate: not ready without validation exits 1 with guidance', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    run(dir, ['start', 'add login']); // contract but no build/test scripts here
    const r = run(dir, ['ship']);
    assert.equal(r.code, 1); // nothing actually verified => gate blocks
    assert.match(r.stdout, /NOT READY/);
    assert.match(r.stdout, /Safe to commit: no/);
  });
});

test('cli ask --show --trust previews the permission-bypass flags + warnings (no spawn)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['ask', 'implementer', 'do X', '--show', '--trust', '--ttl', '10m']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /TRUST ON for claude/);
    assert.match(r.stdout, /not a sandbox/i);
    assert.match(r.stdout, /claude -p --dangerously-skip-permissions/); // bypass flag wired into the command
    assert.match(r.stdout, /stdin: "do X"/); // the --ttl value (10m) must NOT leak into the prompt
  });
});

test('cli ask --interactive --show previews the TUI attach (no spawn)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['ask', 'reviewer', '--interactive', '--show']); // no prompt needed for interactive
    assert.equal(r.code, 0);
    assert.match(r.stdout, /would attach to codex interactively/);
    assert.match(r.stdout, /stdio:inherit/);
  });
});

test('cli ask --show previews the headless command without spawning or recording', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const r = run(dir, ['ask', 'reviewer', 'check the diff', '--show']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /reviewer → codex/); // default reviewer agent resolved
    assert.match(r.stdout, /codex exec/);        // fixed headless command (no prompt in argv)
    assert.match(r.stdout, /check the diff/);    // prompt shown as a stdin preview
    // --show is read-only: nothing recorded to the ledger
    assert.doesNotMatch(run(dir, ['ledger', 'list']).stdout, /ask reviewer/);
  });
});

test('cli trust previews per-agent bypass flags with a time-box and limit warning', () => {
  withTmp((dir) => {
    const r = run(dir, ['trust', 'claude', '--ttl', '15m']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /--dangerously-skip-permissions/);
    assert.match(r.stdout, /~15m/);
    assert.match(r.stdout, /not a sandbox/i);
    assert.match(r.stdout, /does NOT auto-enable/);
    assert.equal(run(dir, ['trust', 'bob']).code, 1); // invalid agent rejected
  });
});

test('cli audit surfaces a thrash signal from ledger events', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    assert.match(run(dir, ['audit']).stdout, /No anomaly signals/);
    run(dir, ['ledger', 'add', 'edit', 'x.ts']);
    run(dir, ['ledger', 'add', 'edit', 'x.ts']);
    run(dir, ['ledger', 'add', 'edit', 'x.ts']);
    const a = run(dir, ['audit']);
    assert.equal(a.code, 0);
    assert.match(a.stdout, /repeated-edits/);
  });
});

test('cli mcp serve answers JSON-RPC tools/list and tools/call over stdio', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    // a real MCP client initializes first, then sends the initialized notification (ADR-0007)
    const reqs =
      JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'append_adr', arguments: { title: 'Via MCP' } } }) + '\n';
    const out = runInput(dir, ['mcp', 'serve'], reqs);
    assert.equal(out.code, 0);
    assert.match(out.stdout, /"protocolVersion":"2025-06-18"/); // initialize was negotiated
    assert.match(out.stdout, /"tools"/);
    assert.match(out.stdout, /"id":1/); // tools/list reply came back
    // the ADR really landed in the store
    assert.match(run(dir, ['adr', 'list']).stdout, /Via MCP/);
  });
});

test('cli mcp register previews by default and writes (idempotently) with --write', () => {
  withTmp((dir) => {
    const json = join(dir, '.mcp.json');
    // preview only — must not create the file
    const preview = run(dir, ['mcp', 'register', '.mcp.json']);
    assert.equal(preview.code, 0);
    assert.match(preview.stdout, /preview/);
    assert.ok(!existsSync(json), 'preview must not write the file');
    // --write applies the merge
    assert.equal(run(dir, ['mcp', 'register', '.mcp.json', '--write']).code, 0);
    const after = JSON.parse(readFileSync(json, 'utf8'));
    const fr = after.mcpServers.framein;
    assert.equal(fr.args.slice(-2).join(' '), 'mcp serve');          // always ends with `mcp serve`
    assert.ok(fr.command === 'framein' || fr.command === 'node');    // framein on PATH, else node fallback
    if (fr.command === 'node') assert.match(fr.args[0], /cli\.js$/); // node fallback points at this cli
    // idempotent: a second --write leaves identical content
    const first = readFileSync(json, 'utf8');
    run(dir, ['mcp', 'register', '.mcp.json', '--write']);
    assert.equal(readFileSync(json, 'utf8'), first);
    // TOML target gets a table, not JSON
    run(dir, ['mcp', 'register', 'codex.toml', '--write']);
    assert.match(readFileSync(join(dir, 'codex.toml'), 'utf8'), /\[mcp_servers\.framein\]/);
  });
});

test('cli integrations install/uninstall writes namespaced wrappers idempotently', () => {
  withTmp((dir) => {
    const expectedBin = process.platform === 'win32' ? 'framein.cmd' : 'framein';
    const f = join(dir, '.claude', 'commands', 'fr', 'verify.md');
    const preview = run(dir, ['integrations', 'install', 'claude']);
    assert.match(preview.stdout, /would write .*verify\.md/);
    assert.ok(!existsSync(f), 'preview must not write');

    run(dir, ['integrations', 'install', 'claude', '--write']);
    assert.ok(existsSync(f), 'install --write creates the wrapper');
    assert.match(readFileSync(f, 'utf8'), new RegExp(`${expectedBin.replace('.', '\\.')} verify --json`)); // logic-less shim

    // a hand-authored, non-framein command in the same namespace must survive uninstall
    const mine = join(dir, '.claude', 'commands', 'fr', 'mine.md');
    writeFileSync(mine, 'my own command\n');
    run(dir, ['integrations', 'uninstall', 'claude']);
    assert.ok(!existsSync(f), 'uninstall removes our generated file');
    assert.ok(existsSync(mine), 'uninstall leaves files without our provenance marker');
  });
});

test('cli doctor reports CLI detection and wrapper presence', () => {
  withTmp((dir) => {
    const r = run(dir, ['doctor']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /framein doctor/);
    assert.match(r.stdout, /CLI claude/);
    assert.match(r.stdout, /wrappers claude\s+0\/\d/);
  });
});

test('cli setup does not recommend reinstalling wrappers that are already installed', () => {
  withTmp((dir) => {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const fake = process.platform === 'win32' ? join(bin, 'claude.cmd') : join(bin, 'claude');
    writeFileSync(fake, process.platform === 'win32' ? '@echo off\necho claude 1.0\n' : '#!/bin/sh\necho claude 1.0\n');
    if (process.platform !== 'win32') chmodSync(fake, 0o755);
    const env = { ...TEST_ENV, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` };
    assert.equal(runWithEnv(dir, ['init'], env).code, 0);
    const setup = runWithEnv(dir, ['setup'], env);
    assert.equal(setup.code, 0);
    assert.match(setup.stdout, /All detected agent wrappers are installed/);
    assert.doesNotMatch(setup.stdout, /Next: framein integrations install claude/);
  });
});

test('cli lobby runs framein verbs inline (batch mode) and exits on EOF', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const out = runInput(dir, ['lobby'], 'status\n/lead codex\n/help\nexit\n').stdout;
    assert.match(out, /lead → codex/);  // /lead switches the lead (unicode arrow in a pipe)
    assert.match(out, /Lobby-only/);    // /help prints the grouped command list
    assert.match(out, /bye/);           // close handler ran (no hang)
  });
});

test('cli lobby: launching a lead TUI is skipped without a TTY (no hang)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const out = runInput(dir, ['lobby'], '/go\nexit\n').stdout;
    assert.match(out, /skipped launching claude/);
  });
});

test('cli lobby: bare /lead without a TTY prints the current lead (no picker hang)', () => {
  withTmp((dir) => {
    run(dir, ['init']); // sets implementer=claude → lobby lead reflects it
    const out = runInput(dir, ['lobby'], '/lead\nexit\n').stdout;
    assert.match(out, /lead: claude/); // non-TTY fallback path, never opens the raw-mode picker
    assert.match(out, /bye/);
  });
});

test('cli lobby: EOF (Ctrl-D) leaves gracefully with a bye, no explicit exit needed (F)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const out = runInput(dir, ['lobby'], 'status\n').stdout; // input ends without `exit` → EOF
    assert.match(out, /bye/);
  });
});

test('cli lobby: lead reflects the store implementer role, not a hardcoded default (E)', () => {
  withTmp((dir) => {
    run(dir, ['init']);                              // implementer defaults to claude
    run(dir, ['role', 'set', 'implementer', 'codex']); // change it
    const out = runInput(dir, ['lobby'], '/lead\nexit\n').stdout;
    assert.match(out, /lead: codex/);  // initialLead() read the store implementer, not 'claude'
  });
});

test('cli shell stays a hidden alias for lobby (back-compat)', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const out = runInput(dir, ['shell'], '/help\nexit\n').stdout;
    assert.match(out, /Lobby-only/);   // the alias reaches the same lobby
    assert.match(out, /bye/);
  });
});

test('cli rules: default is judgment-based (not a hard TDD mandate); set/show edits the projected rules', () => {
  withTmp((dir) => {
    run(dir, ['init']);
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(claude, /use judgment/i);            // softened default (encourage + judgment)
    assert.doesNotMatch(claude, /Write tests first/);  // no imposed TDD mandate
    assert.match(claude, /framein rules set/);         // editable-defaults signal is visible
    // set → re-projected; show reflects it
    run(dir, ['rules', 'set', 'be pragmatic; no TDD']);
    assert.match(run(dir, ['rules', 'show']).stdout, /be pragmatic; no TDD/);
    assert.match(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), /be pragmatic; no TDD/);
    // reset restores the default
    run(dir, ['rules', 'reset']);
    assert.match(run(dir, ['rules', 'show']).stdout, /use judgment/i);
  });
});
