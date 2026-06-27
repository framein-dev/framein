#!/usr/bin/env node
// framein — the framein orchestrator CLI (prototype subset).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface, emitKeypressEvents, moveCursor, clearScreenDown } from 'node:readline';
import { basename, dirname, join } from 'node:path';
import { Store } from './store.js';
import { writeNativeFiles, planNativeFiles } from './fileWriter.js';
import { ROLES, AGENTS } from './types.js';
import { isAgent, isRole, selectAgent, DEFAULT_ROLE_PRIORITY } from './roles.js';
import { HANDOFF_START_PROMPT, buildInvocation, resolveAgent, renderInvocation, invocationCommand, interactiveCommand } from './delegate.js';
import { detectQuotaSignal } from './quota.js';
import { trustPlan, parseDuration, DEFAULT_TRUST_TTL_SEC } from './trust.js';
import { emptyContract, amendContract, contractIssues, renderContractFull, buildGuidedContract, GUIDED_CONTRACT_STEPS } from './task.js';
import { gate, renderGate, renderShip, parseTestSummary } from './evidence.js';
import { buildRescue, renderRescue } from './rescue.js';
import { buildCapsule, renderCapsule } from './capsule.js';
import { debateStatus, newDebate, renderDebate } from './disagree.js';
import { buildLeadResponsePrompt, buildReviewerPrompt, challengeFromVerdict, normalizeLeadModelResponse, normalizeReviewerVerdict, renderDecisionBrief, responseFromLeadModel, } from './challenge.js';
import { extractJson } from './ingest.js';
import { assessBlastRadius, renderBlast, riskTransition } from './blast.js';
import { computeRepoStats, explainRoute, renderRouteExplain, renderStats } from './stats.js';
import { listRecipes, getRecipe, renderRecipe, compileRecipe } from './recipe.js';
import { parseDiffDebt, renderDebt } from './debt.js';
import { ownershipBrief } from './brief.js';
import { detectMcpFromDisk, detectSkillsFromDisk, findConflicts, frameinMcpRegistration, FRAMEIN_SKILLS } from './detect.js';
import { applyJsonMcp, applyCodexMcp, resolveFrameinEntry } from './mcpRegister.js';
import { detectThrash } from './anomaly.js';
import { serve } from './mcpServer.js';
import { wrapperFiles, WRAP_VERBS, PROVENANCE } from './wrappers.js';
import { routeShellLine, renderShellHelp, handoffCardRows, lobbyCompleter, LOBBY_PALETTE } from './shell.js';
import { initSelect, reduceSelectKey, renderSelectLines } from './select.js';
import { initPalette, reducePaletteKey, renderPaletteSuggestions, paletteSuggestions } from './palette.js';
import { resolveCapabilities } from './ui/capabilities.js';
import { painter } from './ui/theme.js';
import { renderFrame, renderKeyVals } from './ui/banner.js';
const SNAPSHOT_PATH = 'framein.store.json';
const FRAME_DIR = '.frame';
const DB_PATH = join(FRAME_DIR, 'store.db');
/** A user-facing error: printed to stderr, exits 1, never a stack trace. */
class CliError extends Error {
}
function fail(message) { throw new CliError(message); }
function rel(p) { return p.replace(/^[.][/\\]/, ''); }
function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function openStore() {
    if (!existsSync(DB_PATH))
        fail('No .frame/store.db found. Run `framein init` first.');
    return Store.open(DB_PATH);
}
/** Open the store, run fn, and always close it (even on error). */
function withStore(fn) {
    const store = openStore();
    try {
        return fn(store);
    }
    finally {
        store.close();
    }
}
function withCliWriteLock(store, scope, fn) {
    const holder = `framein-cli:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const deadline = Date.now() + 5000;
    while (!store.acquireLock(holder, { scope, ttlMs: 30_000 })) {
        if (Date.now() >= deadline) {
            throw new CliError(`Write lock '${scope}' is held by '${store.getLockHolder(scope) ?? 'unknown'}'. Retry or run \`framein unlock ${scope}\` if stale.`);
        }
        sleepMs(50);
    }
    try {
        return fn();
    }
    finally {
        store.releaseLock(holder, { scope });
    }
}
function ensureFrameDirIgnored(dir = '.') {
    const path = join(dir, '.gitignore');
    const entry = '.frame/';
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const ignored = existing
        .split(/\r?\n/)
        .map((line) => line.trim())
        .some((line) => line === '.frame/' || line === '.frame');
    if (ignored)
        return false;
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    writeFileSync(path, `${existing}${prefix}${entry}\n`, 'utf8');
    return true;
}
function parseId(raw, usage) {
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n <= 0)
        fail(usage);
    return n;
}
// Seeded project rules. Deliberately OUTCOME-oriented and judgment-based, not hard mandates: framein
// ENFORCES the Validation Gate (tests vs the contract), and only SUGGESTS method. So TDD/deep-modules are
// encouraged-with-judgment, not imposed — different teams differ, and the gate doesn't need a method
// (ADR-0012 / the "editable opinionated defaults" decision). Editable per project via `framein rules set`.
const DEFAULT_RULES = [
    '- Don\'t claim "done" without validation — build/test checks backing the contract must pass. (Test-first/TDD encouraged for non-trivial logic; use judgment on prototypes & throwaways.)',
    '- Prefer deep modules — keep interfaces small relative to the implementation behind them.',
    '- Record significant decisions as ADRs.',
].join('\n');
function cmdInit(opts = {}) {
    mkdirSync(FRAME_DIR, { recursive: true });
    const ignoredFrameDir = ensureFrameDirIgnored('.');
    const store = Store.open(DB_PATH);
    try {
        if (store.getAllConfig()['rules'] === undefined) {
            store.setConfig('rules', DEFAULT_RULES);
        }
        if (Object.keys(store.getRoles()).length === 0) {
            store.setRole('implementer', 'claude');
            store.setRole('reviewer', 'codex');
            store.setRole('explainer', 'gemini');
        }
        if (opts.lead)
            store.setRole('implementer', opts.lead); // first-run wizard's chosen lead, in one step
        writeNativeFiles('.', store.getState());
        // Auto-install host-native wrappers for any agent CLI already on PATH, so /fr:* (Claude/Gemini)
        // and $fr-* (Codex) work immediately. Newly-installed agents get offered when you switch to them.
        const hosts = WRAP_HOSTS.filter(cliInstalled);
        let n = 0;
        for (const h of hosts)
            n += writeWrappers(h);
        if (!opts.quiet) {
            // Top-level `framein init`. The lobby first-run path passes quiet (it prints its own folded line).
            console.log(`Initialized framein in ${FRAME_DIR}/`);
            console.log('Projected synchronized context: CLAUDE.md, AGENTS.md, GEMINI.md');
            if (ignoredFrameDir)
                console.log('Ignored local cache: .frame/ (use `framein export` for the git-canonical snapshot).');
            if (hosts.length)
                console.log(`Installed ${n} host wrapper(s) for ${hosts.join(', ')} — /fr:verify (Claude/Gemini) · $fr-verify (Codex).`);
        }
        return n;
    }
    finally {
        store.close();
    }
}
// On Windows the agent runs wrapper commands through PowerShell, where the bare `framein` resolves to
// `framein.ps1` and the default execution policy BLOCKS it (UnauthorizedAccess) — even if YOU launched
// the agent from Git Bash, because the agent picks its own shell. `framein.cmd` is policy-proof across
// PowerShell/cmd/Git Bash, so we target it in generated wrappers on Windows. (Per-machine artifacts —
// regenerate with `integrations install` on each OS; the bin name isn't portable across platforms.)
const WRAPPER_BIN = process.platform === 'win32' ? 'framein.cmd' : 'framein';
/** Write a host's wrapper files (idempotent). Returns the count. Shared by `init` auto-install,
 *  `integrations install`, and the lobby's offer-on-lead-switch. */
function writeWrappers(host) {
    let n = 0;
    for (const f of wrapperFiles(host, WRAPPER_BIN)) {
        mkdirSync(dirname(f.path), { recursive: true });
        writeFileSync(f.path, f.content);
        n++;
    }
    return n;
}
/** View / set / reset the project rules (the agent-guidance block). Rules are SUGGESTIONS the agent
 *  reads — the Validation Gate is what's enforced — so teams can shape them freely. `set` re-projects so
 *  the change reaches all three native files (editing the projected block directly is overwritten). */
function cmdRules(args) {
    const sub = args[0] ?? 'show';
    withStore((store) => {
        if (sub === 'set' || sub === 'reset') {
            let text;
            if (sub === 'reset') {
                text = DEFAULT_RULES;
            }
            else {
                const inline = args.slice(1).filter((a) => a !== '--json').join(' ').trim();
                const piped = !inline && !process.stdin.isTTY ? (() => { try {
                    return readFileSync(0, 'utf8').trim();
                }
                catch {
                    return '';
                } })() : '';
                text = (inline || piped).replace(/\\n/g, '\n'); // allow \n escapes in a one-line arg
                if (!text)
                    fail('Usage: framein rules set "<text>"   (use \\n for line breaks, or pipe the text on stdin)');
            }
            store.setConfig('rules', text);
            writeNativeFiles('.', store.getState());
            console.log(`Project rules ${sub === 'reset' ? 'reset to defaults' : 'updated'}; re-projected to CLAUDE.md, AGENTS.md, GEMINI.md.`);
            return;
        }
        if (sub !== 'show')
            fail("Unknown 'rules' subcommand. Use: show | set <text> | reset");
        const raw = store.getConfig('rules');
        const cur = (typeof raw === 'string' ? raw : '').trim();
        if (wantsJson(args)) {
            emitJson('rules', { rules: cur });
            return;
        }
        console.log(cur || '_No project rules defined._ (set with `framein rules set "<…>"`)');
    });
}
// Terminal capabilities / painter for the current process (style guide §12/§13.2). Recomputed per
// call (cheap); color is auto-off for pipes/CI/--json, so automation output stays plain.
function cliCaps() {
    const out = process.stdout;
    return resolveCapabilities({
        isTTY: Boolean(process.stdout.isTTY),
        columns: out.columns,
        colorDepth: process.stdout.isTTY && typeof out.getColorDepth === 'function' ? out.getColorDepth() : 1,
        platform: process.platform,
        env: process.env,
        flags: process.argv,
    });
}
function cliUi() { return painter(cliCaps()); }
// `--json`: stable machine output for wrappers/automation (ADR-0010). schemaVersion + command.
function wantsJson(args) { return args.includes('--json'); }
function emitJson(command, payload) {
    console.log(JSON.stringify({ schemaVersion: 1, command, ...payload }));
}
function cmdStatus(args = []) {
    withStore((store) => {
        const roles = store.getRoles();
        if (wantsJson(args)) {
            emitJson('status', {
                store: DB_PATH,
                lock: store.getLockHolder() ?? null,
                roles,
                decisions: store.listAdrs().length,
                goal: store.getTaskContract()?.goal ?? null,
            });
            return;
        }
        // Single-string console.log (not multi-arg) so Node never inspect-colors values out of band —
        // color is the painter's job, and this keeps NO_COLOR honored even when FORCE_COLOR is set.
        const ui = cliUi();
        console.log(ui.bold('framein status'));
        console.log(`  store     : ${DB_PATH}`);
        console.log(`  lock      : ${store.getLockHolder() ?? '(free)'}`);
        console.log(`  roles     : ${Object.keys(roles).length ? Object.entries(roles).map(([r, a]) => `${r}→${a}`).join(', ') : '(none)'}`);
        console.log(`  decisions : ${store.listAdrs().length}`);
    });
}
function cmdRole(args) {
    withStore((store) => {
        const sub = args[0];
        if (sub === 'set') {
            const role = args[1];
            const agent = args[2];
            if (!role || !agent)
                fail('Usage: framein role set <role> <agent>');
            if (!isRole(role))
                fail(`Unknown role '${role}'. Valid: ${ROLES.join(', ')}`);
            if (!isAgent(agent))
                fail(`Unknown agent '${agent}'. Valid: ${AGENTS.join(', ')}`);
            store.setRole(role, agent);
            writeNativeFiles('.', store.getState());
            console.log(`Set ${role} -> ${agent} (native files re-synced)`);
        }
        else if (sub === undefined || sub === 'list') {
            const roles = store.getRoles();
            if (Object.keys(roles).length === 0)
                console.log('  (no roles assigned)');
            for (const [r, a] of Object.entries(roles))
                console.log(`  ${r} -> ${a}`);
        }
        else {
            fail(`Unknown 'role' subcommand '${sub}'. Use: set | list`);
        }
    });
}
function cmdAdr(args) {
    withStore((store) => {
        const sub = args[0];
        if (sub === 'add') {
            const title = args.slice(1).join(' ').trim();
            if (!title)
                fail('Usage: framein adr add <title>');
            const adr = store.appendAdr({ title, decision: title });
            writeNativeFiles('.', store.getState());
            console.log(`Recorded ADR-${adr.id}: ${adr.title} (all three files updated)`);
        }
        else if (sub === 'supersede') {
            const oldId = parseId(args[1], 'Usage: framein adr supersede <id> <title>');
            const title = args.slice(2).join(' ').trim();
            if (!title)
                fail('Usage: framein adr supersede <id> <title>');
            if (!store.getAdr(oldId))
                fail(`ADR-${oldId} not found`);
            if (store.isSuperseded(oldId))
                fail(`ADR-${oldId} is already superseded`);
            const adr = store.supersedeAdr(oldId, { title, decision: title });
            writeNativeFiles('.', store.getState());
            console.log(`Recorded ADR-${adr.id} superseding ADR-${oldId} (all three files updated)`);
        }
        else if (sub === 'show') {
            const id = parseId(args[1], 'Usage: framein adr show <id>');
            const adr = store.getAdr(id);
            if (!adr)
                fail(`ADR-${id} not found`);
            const status = store.isSuperseded(adr.id) ? 'superseded' : adr.status;
            console.log(`ADR-${adr.id}: ${adr.title}`);
            console.log(`  status      : ${status}`);
            console.log(`  created     : ${adr.createdAt}`);
            if (adr.supersedes != null)
                console.log(`  supersedes  : ADR-${adr.supersedes}`);
            if (adr.authorAgent)
                console.log(`  author      : ${adr.authorAgent}`);
            if (adr.context)
                console.log(`  context     : ${adr.context}`);
            console.log(`  decision    : ${adr.decision}`);
            if (adr.consequences)
                console.log(`  consequences: ${adr.consequences}`);
        }
        else if (sub === undefined || sub === 'list') {
            const adrs = store.listAdrs();
            if (adrs.length === 0)
                console.log('  (no decisions recorded)');
            for (const a of adrs) {
                const status = store.isSuperseded(a.id) ? 'superseded' : a.status;
                console.log(`  ADR-${a.id} ${a.title} (${status})`);
            }
        }
        else {
            fail(`Unknown 'adr' subcommand '${sub}'. Use: add | supersede | show | list`);
        }
    });
}
function cmdSync(args) {
    withStore((store) => {
        if (args.includes('--dry-run')) {
            for (const p of planNativeFiles('.', store.getState())) {
                console.log(`  ${p.changed ? 'CHANGE   ' : 'unchanged'} ${rel(p.path)}${p.existed ? '' : ' (new)'}`);
            }
            console.log('(dry-run: no files written)');
        }
        else {
            const written = writeNativeFiles('.', store.getState());
            if (written.length === 0)
                console.log('Already in sync (no changes).');
            else
                console.log(`Synced from source of truth: ${written.map(rel).join(', ')}`);
        }
    });
}
function cmdUnlock(args) {
    withStore((store) => {
        const scope = args[0] ?? 'global';
        const prev = store.getLockHolder(scope);
        store.forceUnlock(scope);
        console.log(prev ? `Released write lock on '${scope}' (was held by '${prev}').` : `No active lock on '${scope}'.`);
    });
}
function cmdExport(args) {
    const out = args.find((a) => !a.startsWith('-')) ?? SNAPSHOT_PATH;
    withStore((store) => {
        writeFileSync(out, JSON.stringify(store.exportSnapshot(), null, 2) + '\n', 'utf8');
        console.log(`Exported canonical snapshot to ${out}`);
    });
}
function cmdImport(args) {
    const src = args.find((a) => !a.startsWith('-')) ?? SNAPSHOT_PATH;
    if (!existsSync(src))
        fail(`Snapshot not found: ${src}`);
    let snap;
    try {
        snap = JSON.parse(readFileSync(src, 'utf8'));
    }
    catch {
        return fail(`Not valid JSON: ${src}`);
    }
    mkdirSync(FRAME_DIR, { recursive: true });
    const store = Store.open(DB_PATH);
    try {
        store.importSnapshot(snap);
        writeNativeFiles('.', store.getState());
        console.log(`Imported ${src} -> ${DB_PATH} (native files re-synced)`);
    }
    catch (e) {
        fail(`Import failed: ${e.message}`);
    }
    finally {
        store.close();
    }
}
const VALUE_FLAGS = new Set(['--ttl']); // flags that consume the following token as their value
function cmdAsk(args) {
    const flags = [];
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (VALUE_FLAGS.has(a)) {
            flags.push(a);
            i++;
            continue;
        } // skip the value so it can't leak into the prompt
        if (a.startsWith('--')) {
            flags.push(a);
            continue;
        }
        positional.push(a);
    }
    const role = positional[0];
    if (!role || !isRole(role))
        fail(`Usage: framein ask <role> [prompt] [--show|--run]   (role: ${ROLES.join('|')})`);
    let prompt = positional.slice(1).join(' ').trim();
    const interactive = flags.includes('--interactive');
    if (!prompt && !interactive && !process.stdin.isTTY) {
        try {
            prompt = readFileSync(0, 'utf8').trim();
        }
        catch { /* no stdin */ }
    }
    if (!prompt && !interactive)
        fail('No prompt. Pipe it on stdin or pass it after the role.');
    const useTrust = flags.includes('--trust');
    withStore((store) => {
        const agent = resolveAgent(store.getRoles(), role);
        if (interactive) { // zero-dep human-in-the-loop attach: hand the agent's own TUI the terminal
            const cmd = interactiveCommand(agent);
            if (flags.includes('--show')) {
                console.log(`would attach to ${agent} interactively: ${cmd} (stdio:inherit)`);
                return;
            }
            console.log(`Attaching to ${agent} interactively — framein context is synced; you drive it. Exit the agent to return.`);
            store.appendLedger('attach', `${role}:${agent}`);
            const res = spawnSync(cmd, { stdio: 'inherit', shell: true });
            if (res.error)
                fail(`Failed to launch ${agent}: ${res.error.message}`);
            return;
        }
        let trustFlags;
        if (useTrust) { // F-TRUST: opt-in, time-boxed permission bypass wired into the spawn
            const ttlRaw = (() => { const i = args.indexOf('--ttl'); return i !== -1 ? args[i + 1] : undefined; })();
            const plan = trustPlan(agent, { ttlSec: ttlRaw ? parseDuration(ttlRaw) ?? undefined : undefined });
            trustFlags = plan.flags;
            console.log(`⚠ TRUST ON for ${agent} (time-box ~${Math.round(plan.ttlSec / 60)}m): adds ${plan.flags.join(' ')}`);
            for (const w of plan.warnings)
                console.log(`  ⚠ ${w}`);
        }
        const inv = buildInvocation(agent, prompt, { trustFlags });
        if (flags.includes('--show')) { // safe preview: resolve + build, no spawn, no ledger write
            console.log(`would run (${role} → ${agent}): ${renderInvocation(inv)}`);
            return;
        }
        store.appendLedger('ask', role, prompt.slice(0, 200));
        store.appendLedger('turn', role);
        if (useTrust)
            store.appendLedger('trust', agent, trustFlags?.join(' ') ?? '');
        if (flags.includes('--run')) {
            runDelegated(store, role, agent, inv);
            return;
        }
        console.log(`Queued ask for role '${role}' → ${agent} (recorded in the ledger).`);
        console.log(`  Preview: framein ask ${role} <prompt> --show · live run: --run (spawns the ${agent} CLI headless).`);
        const signals = detectThrash(store.listLedger());
        if (signals.length) {
            console.log('  ⚠ audit signals:');
            for (const s of signals)
                console.log(`    - ${s.message}`);
        }
    });
}
/**
 * Live headless delegation (B-2): spawn the agent's non-interactive CLI, stream its output, record
 * the outcome + quota signal (failover hint) + a result snippet (ingest). Verified live against
 * real claude (`claude -p`) and codex (`codex exec`); the automated suite covers resolve/build
 * (`--show`) and the store recording, not the spawn itself (it needs the real CLI + tokens).
 */
function runDelegated(store, role, agent, inv) {
    console.log(`Delegating ${role} → ${agent}: ${renderInvocation(inv)}`);
    // shell:true resolves npm .cmd shims (codex/gemini) on Windows; the command is FIXED flags only
    // (no user input — injection-safe), and the prompt is fed via stdin (inv.stdin).
    const res = spawnSync(invocationCommand(inv), { input: inv.stdin, encoding: 'utf8', shell: true });
    if (res.error) {
        store.appendLedger('delegate-fail', `${role}:${agent}`, res.error.message);
        fail(`Failed to launch ${agent}: ${res.error.message}`);
    }
    const stdout = res.stdout ?? '';
    const stderr = res.stderr ?? '';
    if (res.status !== 0 && !stdout.trim() && /not recognized|not found|no such file/i.test(stderr)) {
        store.appendLedger('delegate-fail', `${role}:${agent}`, 'cli-not-found');
        fail(`'${inv.command}' not found — install the ${agent} CLI, or use --show to preview the command.`);
    }
    if (stdout)
        process.stdout.write(stdout);
    if (stderr)
        process.stderr.write(stderr);
    const ok = res.status === 0;
    const sig = detectQuotaSignal(agent, `${stdout}\n${stderr}`);
    if (sig.exhausted) {
        store.appendLedger('quota', agent, sig.kind ?? '');
        const alt = selectAgent(DEFAULT_ROLE_PRIORITY[role], { role, authMode: {}, unavailable: { [agent]: true } });
        const retry = sig.retryAfterSec ? ` (retry ~${sig.retryAfterSec}s)` : '';
        console.error(`⚠ ${agent} looks ${sig.kind}${retry} — consider failover${alt ? ` to ${alt}` : ' (no alternative available)'}.`);
    }
    // Ingest (F-LOOP-4 tie-in): record the result so the capsule + other agents (via read_memory
    // scope 'delegation') see what the delegated agent produced. Only a short snippet is stored —
    // the full output stays on the terminal (commit-forbidden-data caution, PRD §12).
    const snippet = stdout.trim().split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 200);
    store.setMemory('delegation', 'last', { role, agent, ok, snippet, ts: new Date().toISOString() });
    store.appendLedger(ok ? 'delegated' : 'delegate-fail', `${role}:${agent}`);
    if (!ok)
        process.exitCode = res.status ?? 1;
}
function cmdAudit() {
    withStore((store) => {
        const signals = detectThrash(store.listLedger());
        if (signals.length === 0) {
            console.log('No anomaly signals. (audit is blocker-only by default — ADR-0005)');
            return;
        }
        console.log('Audit signals (consider pulling in the reviewer):');
        for (const s of signals)
            console.log(`  - [${s.kind}] ${s.message}`);
    });
}
function cmdLedger(args) {
    withStore((store) => {
        const sub = args[0];
        if (sub === 'add') {
            const kind = args[1];
            if (!kind)
                fail('Usage: framein ledger add <kind> [target] [detail]');
            store.appendLedger(kind, args[2] ?? '', args.slice(3).join(' '));
            console.log(`Ledger += ${kind}${args[2] ? ' ' + args[2] : ''}`);
        }
        else if (sub === undefined || sub === 'list') {
            const entries = store.listLedger(50);
            if (entries.length === 0)
                console.log('  (ledger empty)');
            for (const e of entries)
                console.log(`  ${e.kind}${e.target ? ' ' + e.target : ''}`);
        }
        else {
            fail(`Unknown 'ledger' subcommand '${sub}'. Use: add | list`);
        }
    });
}
async function serveMcp() {
    const store = openStore();
    try {
        await serve(store);
    }
    catch (e) {
        console.error(String(e));
        process.exitCode = 1;
    }
    finally {
        store.close();
    }
}
function cmdMcp(args) {
    if (args[0] === 'serve') {
        void serveMcp();
        return;
    }
    if (args[0] === 'register') {
        const rest = args.slice(1);
        const write = rest.includes('--write');
        const target = rest.find((a) => !a.startsWith('--')) ?? '.mcp.json';
        const isToml = target.endsWith('.toml');
        const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
        // Use the canonical `framein` bin if installed; else `node <this cli.js>` so the agent can
        // actually spawn the server (dev / not-globally-installed). The agent runs this verbatim.
        const probe = spawnSync('framein', ['--version'], { encoding: 'utf8', shell: true });
        const frameOnPath = probe.status === 0 && /framein/i.test((probe.stdout ?? '') + (probe.stderr ?? ''));
        const entry = resolveFrameinEntry(frameOnPath, process.argv[1] ?? 'dist/cli.js');
        const merged = isToml ? applyCodexMcp(existing, 'framein', entry) : applyJsonMcp(existing, 'framein', entry);
        console.log(`# server command: ${entry.command} ${entry.args.join(' ')}  (${frameOnPath ? 'framein on PATH' : 'node fallback — framein not globally installed'})`);
        if (write) {
            writeFileSync(target, merged);
            console.log(`Registered framein in ${target} (${isToml ? 'TOML' : 'JSON'} merge — existing content preserved).`);
            console.log('Verify the live connection: `claude mcp list` and look for framein (codex/gemini have equivalents).');
        }
        else {
            console.log(`# preview — would merge framein into ${target} (${isToml ? 'TOML' : 'JSON'}). Re-run with --write to apply:`);
            console.log(merged);
        }
        return;
    }
    if (args[0] === 'patch') {
        const reg = frameinMcpRegistration();
        console.log("# Register framein's MCP server with each CLI (apply after review — framein won't write these):");
        console.log('\n## Claude — merge into .mcp.json:\n' + reg.claude);
        console.log('\n## Codex — add to ~/.codex/config.toml:\n' + reg.codex);
        console.log('\n## Gemini — merge into settings.json:\n' + reg.gemini);
        console.log('\n# NOTE: `framein mcp serve` speaks the MCP stdio transport (newline-delimited JSON-RPC,');
        console.log('# which IS MCP stdio — not LSP Content-Length framing). Applying these patches and');
        console.log('# verifying the live connection is the orchestration layer (B; ADR-0006/0007).');
        return;
    }
    const servers = detectMcpFromDisk();
    if (servers.length === 0) {
        console.log('No existing MCP servers detected (.mcp.json, ~/.codex/config.toml, settings.json).');
    }
    else {
        for (const s of servers)
            console.log(`  [${s.agent}] ${s.name}${s.command ? ` -> ${s.command}` : ''}`);
        const conflicts = findConflicts(servers);
        if (conflicts.length)
            console.log(`  conflicts (same name across agents): ${conflicts.join(', ')}`);
    }
    console.log('  (detected, not proxied — framein never relays your MCP servers)');
}
function cmdSkills() {
    console.log('Framein skills:');
    for (const s of FRAMEIN_SKILLS)
        console.log(`  [framein] ${s.name} — ${s.description}`);
    const detected = detectSkillsFromDisk();
    if (detected.length) {
        console.log('Detected (reused from your CLIs):');
        for (const s of detected)
            console.log(`  [${s.source}] ${s.name}${s.description ? ` — ${s.description}` : ''}`);
    }
    console.log('  (catalog + recommend only — skills are not cross-executed across agents)');
}
function readVersion() {
    // SEA build bakes the version into a global (no package.json sits next to the executable).
    const baked = globalThis.__FRAMEIN_VERSION__;
    if (baked)
        return `framein ${baked}`;
    try {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        return `framein ${pkg.version ?? '?'}`;
    }
    catch {
        return 'framein (version unknown)';
    }
}
const USAGE = {
    init: 'framein init — initialize .frame/store.db and project native files',
    status: 'framein status — show roles, lock, decision count',
    role: 'framein role set <role> <agent> | framein role list',
    adr: 'framein adr add <title> | supersede <id> <title> | show <id> | list',
    sync: 'framein sync [--dry-run] — re-project native files from the store',
    unlock: 'framein unlock [scope] — release a stale write lock (default: global)',
    mcp: 'framein mcp [patch|register|serve] — detected servers / print patches / apply framein registration / run the server',
    skills: 'framein skills — list framein + detected (reused) skills',
    ask: 'framein ask <role> [prompt] [--show|--run|--interactive] [--trust [--ttl <dur>]] — preview/record/run a headless delegation, or --interactive to drive the agent TUI; --trust adds bypass flags',
    audit: 'framein audit — report anomaly/thrash signals from the ledger (blocker-only)',
    ledger: 'framein ledger add <kind> [target] | framein ledger list',
    export: `framein export [path] — write the git-canonical snapshot (default ${SNAPSHOT_PATH})`,
    import: `framein import [path] — rebuild the store from a snapshot (default ${SNAPSHOT_PATH})`,
    trust: 'framein trust <agent> [--ttl <dur>] — preview the per-agent permission-bypass flags + time-box (does NOT auto-enable)',
    lobby: 'framein lobby — optional interactive switchboard (also opens when you run bare `framein` in a terminal): run verbs inline, /lead <agent> to switch, /go to hand the terminal to the lead native TUI (framein pauses; resumes on exit). Zero-dep; simultaneous overlay needs node-pty (optional, ADR-0010)',
    shell: 'framein shell — alias for `framein lobby`, kept for back-compat (not shown in the command list).',
    integrations: 'framein integrations list | show | install | uninstall <claude|codex|gemini|all> [--write] — generate logic-less /fr:* (Claude/Gemini) + $fr-* (Codex skill) wrappers that call `framein <verb> --json`',
    doctor: 'framein doctor — detect agent CLIs on PATH + count installed wrappers',
    setup: 'framein setup — doctor + a wrapper-install recommendation for detected CLIs',
    task: 'framein task start <goal> | show | amend <goal|preserve|acceptance|protected|nongoal> <value> — the Task Contract (what "done" means)',
    start: 'framein start <goal> — start a Task Contract (alias of `framein task start`)',
    verify: 'framein verify — run build/test validation and check it against the Task Contract (informational)',
    ship: 'framein ship — the enforced Validation Gate: READY/WARNING summary + commit/deploy guidance (exit 1 if hard validation fails)',
    risk: 'framein risk — Blast Radius Guard: assess changed files for sensitive code (auth/payment/migration/secrets/deploy/deps) + required gates',
    route: 'framein route explain [role] — show which agent would take a role in THIS repo and why (repo-local routing)',
    stats: 'framein stats — repo-local agent performance derived from the ledger',
    recipe: 'framein recipe list | show <name> | compile <name> <agent> — vendor-neutral task protocols compiled to each CLI',
    rescue: 'framein rescue [--run] — if the ledger shows a repair loop, surface signals + 3 options (never auto-acts); --run asks the reviewer to diagnose (read-only)',
    checkpoint: 'framein checkpoint [label] — record the current git commit as a known-good (green) state',
    rewind: 'framein rewind [--force] — preview (or with --force, execute) git reset to the last checkpoint',
    pause: 'framein pause — save an auto-generated Task Capsule (resume state) from the store + git',
    resume: 'framein resume — print the saved capsule (or rebuild one) to continue without a manual handoff',
    capsule: 'framein capsule show — render the current Task Capsule',
    challenge: 'framein challenge "<proposal>" [--run] | --block "<claim>" [--require "<change>"] | --accept | --show — bounded reviewer debate; --run asks for a reviewer verdict, one lead response, and a decision brief',
    decide: 'framein decide accept|reject [text] — the lead resolves the open debate',
    debt: 'framein debt — Vibe Debt Delta: what THIS change added (deps/TODOs/lines), not the whole codebase',
    explain: 'framein explain [--run] — Ownership Brief skeleton (changed/test/rollback filled); --run has the explainer agent complete the narrative',
};
// --- Validation Gate helpers (F-LOOP-2): run the project's own build/test and collect results ---
function pkgHasScript(name) {
    try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
        return typeof pkg.scripts?.[name] === 'string';
    }
    catch {
        return false;
    }
}
function runShell(command) {
    // commands are fixed strings (no user input); shell:true resolves npm.cmd/git on Windows.
    const res = spawnSync(command, { encoding: 'utf8', shell: true });
    if (res.error)
        return { exitCode: -1, output: res.error.message };
    return { exitCode: res.status ?? -1, output: (res.stdout ?? '') + (res.stderr ?? '') };
}
function gitDiff() {
    const res = spawnSync('git', ['diff', 'HEAD'], { encoding: 'utf8' });
    return res.status === 0 ? (res.stdout ?? '') : '';
}
function gitChangedFiles() {
    const isRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
    if (isRepo.status !== 0)
        return [];
    const hasHead = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).status === 0;
    const commands = hasHead
        ? [['diff', '--name-only', 'HEAD', '--'], ['ls-files', '--others', '--exclude-standard']]
        : [['ls-files', '--cached', '--others', '--exclude-standard']];
    const files = new Set();
    for (const args of commands) {
        const res = spawnSync('git', args, { encoding: 'utf8' });
        if (res.status !== 0)
            continue;
        for (const line of (res.stdout ?? '').split('\n')) {
            const file = line.trim();
            if (file)
                files.add(file.replace(/\\/g, '/'));
        }
    }
    return [...files].sort();
}
function collectEvidence() {
    const bundle = {};
    if (pkgHasScript('build')) {
        const r = runShell('npm run build');
        bundle.build = { command: 'npm run build', exitCode: r.exitCode };
    }
    if (pkgHasScript('test')) {
        const r = runShell('npm test');
        bundle.tests = { command: 'npm test', summary: parseTestSummary(r.output), exitCode: r.exitCode };
    }
    const changed = gitChangedFiles();
    if (changed.length)
        bundle.changedFiles = changed;
    return bundle;
}
function cmdVerify(args = []) {
    withStore((store) => {
        withCliWriteLock(store, 'evidence', () => {
            const bundle = collectEvidence();
            store.setMemory('evidence', 'last', bundle); // recorded so `ship`/capsule can reuse it
            const result = gate(store.getTaskContract(), bundle);
            if (wantsJson(args)) {
                emitJson('verify', { ready: result.ready, status: result.ready ? 'ready' : 'not_ready', checks: result.checks, warnings: result.warnings });
                return;
            }
            console.log(renderGate(result, cliUi()));
        });
    });
}
function cmdShip(args = []) {
    withStore((store) => {
        withCliWriteLock(store, 'evidence', () => {
            const bundle = collectEvidence();
            store.setMemory('evidence', 'last', bundle);
            const result = gate(store.getTaskContract(), bundle);
            // Blast Radius Guard (F-LOOP-6): raise the gate when the change touches sensitive code.
            const blast = assessBlastRadius(bundle.changedFiles ?? []);
            if (wantsJson(args)) {
                emitJson('ship', {
                    ready: result.ready, status: result.ready ? 'ready' : 'not_ready',
                    checks: result.checks, warnings: result.warnings,
                    safeToCommit: result.ready, safeToDeploy: result.ready ? 'requires_human' : false,
                    risk: blast.level, requiredGates: blast.requiredGates,
                });
                store.setMemory('risk', 'last', blast.level);
                if (!result.ready)
                    process.exitCode = 1;
                return;
            }
            console.log(renderShip(result, cliUi()));
            if (blast.level !== 'low') {
                console.log('\n' + renderBlast(blast, cliUi()));
                const t = riskTransition(store.getMemory('risk', 'last'), blast.level);
                if (t)
                    console.log(t);
            }
            store.setMemory('risk', 'last', blast.level);
            if (!result.ready)
                process.exitCode = 1; // ship is the enforced gate; verify is informational
        });
    });
}
// --- Repo-local Routing (F-LOOP-7): route by this repo's results, and explain the choice ---
function cmdRoute(args) {
    if (args[0] !== 'explain')
        fail('Usage: framein route explain [role]');
    const roleArg = args.slice(1).find((a) => !a.startsWith('--'));
    if (roleArg && !isRole(roleArg))
        fail(`Unknown role '${roleArg}'. Valid: ${ROLES.join(', ')}`);
    const role = roleArg ?? 'reviewer';
    withStore((store) => {
        const e = explainRoute(role, { authMode: {} }, computeRepoStats(store.listLedger()));
        if (wantsJson(args)) {
            emitJson('route', { role: e.role, agent: e.agent, reasons: e.reasons, alternative: e.alternative ?? null });
            return;
        }
        console.log(renderRouteExplain(e, cliUi()));
    });
}
function cmdStats(args = []) {
    withStore((store) => {
        const stats = computeRepoStats(store.listLedger());
        if (wantsJson(args)) {
            emitJson('stats', { stats });
            return;
        }
        console.log(renderStats(stats, cliUi()));
    });
}
// --- Vibe Debt Delta + Ownership Brief (F-LOOP-9/10) ---
function cmdDebt(args = []) {
    const d = parseDiffDebt(gitDiff());
    if (wantsJson(args)) {
        emitJson('debt', { addedLines: d.addedLines, removedLines: d.removedLines, addedDeps: d.addedDeps, todos: d.todos });
        return;
    }
    console.log(renderDebt(d, cliUi()));
}
function cmdExplain(args = []) {
    withStore((store) => {
        const cp = store.getMemory('checkpoint', 'last');
        const brief = {
            goal: store.getTaskContract()?.goal,
            changedFiles: gitChangedFiles(),
            testCommand: pkgHasScript('test') ? 'npm test' : undefined,
            lastGreen: cp?.sha,
        };
        const skeleton = ownershipBrief(brief);
        if (!args.includes('--run')) {
            if (wantsJson(args)) {
                emitJson('explain', { ...brief, skeleton });
                return;
            }
            console.log(skeleton);
            console.log('\n(the narrative sections are the explainer role’s live job — run `framein explain --run`)');
            return;
        }
        const explainer = store.getRole('explainer') ?? 'gemini'; // live: explainer fills the narrative
        console.log(`Asking ${explainer} to complete the ownership brief…\n`);
        const r = spawnAgentText(explainer, `You are the explainer. Complete the sections marked "(for the explainer role to fill)" in this ownership brief, based on the repository. Return the full completed brief.\n\n${skeleton}`);
        if (wantsJson(args)) {
            emitJson('explain', { ...brief, agent: explainer, ok: r.ok, text: r.text || skeleton });
            return;
        }
        console.log(r.text || skeleton);
        if (r.ok && r.text)
            store.setMemory('brief', 'last', { agent: explainer, ts: new Date().toISOString() });
    });
}
// --- Frame Recipe (F-LOOP-8): vendor-neutral protocols, compiled to each CLI (static, no store) ---
function cmdRecipe(args) {
    const sub = args[0] ?? 'list';
    if (sub === 'list') {
        console.log('Recipes (vendor-neutral task protocols, compiled to each CLI — not cross-executed):');
        for (const r of listRecipes())
            console.log(`  ${r.name} — trigger: ${r.trigger}, ${r.steps.length} steps`);
        return;
    }
    if (sub === 'show') {
        const r = getRecipe(args[1] ?? '');
        if (!r)
            fail(`Unknown recipe '${args[1] ?? ''}'. Try: framein recipe list`);
        console.log(renderRecipe(r, cliUi()));
        return;
    }
    if (sub === 'compile') {
        const r = getRecipe(args[1] ?? '');
        if (!r)
            fail(`Unknown recipe '${args[1] ?? ''}'. Try: framein recipe list`);
        const agent = args[2];
        if (!agent || !isAgent(agent))
            fail(`Usage: framein recipe compile <name> <${AGENTS.join('|')}>`);
        console.log(compileRecipe(r, agent));
        return;
    }
    fail(`Unknown 'recipe' subcommand '${sub}'. Use: list | show <name> | compile <name> <agent>`);
}
function cmdRisk(args = []) {
    withStore((store) => {
        const a = assessBlastRadius(gitChangedFiles());
        const prev = store.getMemory('risk', 'last');
        store.setMemory('risk', 'last', a.level);
        if (wantsJson(args)) {
            emitJson('risk', { level: a.level, hits: a.hits, requiredGates: a.requiredGates });
            return;
        }
        console.log(renderBlast(a, cliUi()));
        const t = riskTransition(prev, a.level);
        if (t)
            console.log(t);
    });
}
// --- Rescue Mode + checkpoints (F-LOOP-3) ---
function gitHead() {
    const res = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    return res.status === 0 && res.stdout ? res.stdout.trim() : null;
}
/** Spawn an agent headlessly and return its free-text output (rescue diagnosis, ownership brief).
 *  Same shell+stdin model as runDelegated (prompt off argv). Needs the real CLI + its trust flag
 *  for any tool use; plain text generation works without it. */
function spawnAgentText(agent, prompt) {
    const inv = buildInvocation(agent, prompt);
    const res = spawnSync(invocationCommand(inv), { input: inv.stdin, encoding: 'utf8', shell: true });
    return { ok: res.status === 0 && !res.error, text: (res.stdout ?? '').trim() || (res.stderr ?? '').trim() };
}
function cmdRescue(args = []) {
    withStore((store) => {
        const signals = detectThrash(store.listLedger());
        const cp = store.getMemory('checkpoint', 'last');
        const reviewer = store.getRole('reviewer');
        const report = buildRescue(signals, { lastGreen: cp, reviewer });
        if (wantsJson(args)) {
            emitJson('rescue', { triggered: report.triggered, signals: report.signals, lastGreen: report.lastGreen ?? null, options: report.options });
            return;
        }
        console.log(renderRescue(report, cliUi()));
        if (args.includes('--run') && report.triggered) { // option A, live: reviewer diagnoses (no edits)
            const rev = reviewer ?? 'codex';
            const ctx = signals.map((s) => `- ${s.message}`).join('\n');
            console.log(`\nAsking ${rev} to diagnose (read-only)…`);
            const r = spawnAgentText(rev, `You are the reviewer diagnosing a repair loop. Do NOT edit code. Signals:\n${ctx}\n\nGive a short likely root cause and the single next action. Be terse.`);
            console.log(r.text || '(no diagnosis returned)');
            if (r.ok && r.text)
                store.setMemory('rescue', 'last', { agent: rev, diagnosis: r.text.slice(0, 500), ts: new Date().toISOString() });
        }
    });
}
function cmdCheckpoint(args) {
    const label = args.filter((a) => !a.startsWith('--')).join(' ').trim();
    const sha = gitHead();
    if (!sha)
        fail('Not a git repo (or no commits). `framein checkpoint` records the current commit as a known-good state.');
    withStore((store) => {
        store.setMemory('checkpoint', 'last', { sha, label });
        store.appendLedger('checkpoint', sha.slice(0, 7), label);
        console.log(`Checkpoint recorded: ${sha.slice(0, 7)}${label ? ` (${label})` : ''}. Return here with \`framein rewind\`.`);
    });
}
function cmdRewind(args) {
    const force = args.includes('--force');
    withStore((store) => {
        const cp = store.getMemory('checkpoint', 'last');
        if (!cp)
            fail('No checkpoint recorded. Run `framein checkpoint` at a known-good state first.');
        if (!force) {
            console.log(`would rewind to ${cp.sha.slice(0, 7)}${cp.label ? ` (${cp.label})` : ''}:`);
            console.log(`  git reset --hard ${cp.sha}`);
            console.log('  ⚠ destructive — discards uncommitted changes. Re-run with --force to execute.');
            return;
        }
        const res = spawnSync('git', ['reset', '--hard', cp.sha], { encoding: 'utf8' });
        if (res.status !== 0)
            fail(`git reset failed: ${(res.stderr ?? '').trim()}`);
        store.appendLedger('rewind', cp.sha.slice(0, 7), cp.label ?? '');
        console.log(`Rewound to ${cp.sha.slice(0, 7)}.`);
    });
}
// --- Task Capsule (F-LOOP-4): assemble a resume capsule from what the store + git already hold ---
function gitBranch() {
    const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
    return res.status === 0 && res.stdout ? res.stdout.trim() : undefined;
}
function gatherCapsule(store) {
    const contract = store.getTaskContract();
    const decisions = store.listAdrs().filter((a) => !store.isSuperseded(a.id)).slice(-5).map((a) => ({ id: a.id, title: a.title }));
    const cp = store.getMemory('checkpoint', 'last');
    const ev = store.getMemory('evidence', 'last');
    const del = store.getMemory('delegation', 'last');
    const handoff = store.getMemory('handoff', 'next');
    const debate = store.getMemory('debate', 'current');
    const openDebate = debate ? debateStatus(debate).state !== 'resolved' : false;
    const changed = gitChangedFiles();
    return buildCapsule({
        goal: contract?.goal,
        contract,
        decisions,
        branch: gitBranch(),
        lastGreen: cp?.sha,
        changedFiles: changed,
        testSummary: ev?.tests?.summary ?? null,
        ledger: store.listLedger(),
        lastDelegation: del ? { agent: del.agent, ok: del.ok } : undefined,
        handoffTarget: handoff && isAgent(handoff) ? handoff : undefined,
        openDebate,
    });
}
function cmdPause() {
    withStore((store) => {
        const c = gatherCapsule(store);
        store.setMemory('capsule', 'last', c);
        console.log('Paused — task capsule saved (resume with `framein resume`):\n');
        console.log(renderCapsule(c, cliUi()));
    });
}
function cmdResume() {
    withStore((store) => {
        const saved = store.getMemory('capsule', 'last');
        const c = saved ?? gatherCapsule(store);
        console.log(saved ? 'Resuming from the saved capsule:\n' : 'No saved capsule — rebuilt fresh from the store:\n');
        console.log(renderCapsule(c, cliUi()));
        console.log('\nRead this + the repo to continue. No manual handoff needed.');
    });
}
function cmdCapsule(args) {
    const sub = args[0] ?? 'show';
    if (sub === 'show') {
        withStore((store) => console.log(renderCapsule(gatherCapsule(store), cliUi())));
        return;
    }
    // `capsule <agent>` arms a handoff: carry the capsule to that model. Exiting the current agent triggers
    // the switch (launchLeadTui consumes it); framein never pushes into a TUI (ADR-0009) — the next lead pulls.
    if (isAgent(sub)) {
        withStore((store) => { store.setMemory('handoff', 'next', sub); store.appendLedger('handoff', sub); });
        console.log(`↪ Handoff to ${sub} armed. Exit this agent (Ctrl-D) — framein switches to ${sub}, which loads the capsule.`);
        return;
    }
    fail(`Unknown 'capsule' target '${sub}'. Use: capsule show  |  capsule <${AGENTS.join('|')}>`);
}
// --- Native command wrappers (ADR-0010/0011): generate/install/remove /fr:* + $fr-* shims ---
const WRAP_HOSTS = ['claude', 'codex', 'gemini'];
function resolveHosts(arg) {
    if (!arg || arg === 'all' || arg.startsWith('--'))
        return WRAP_HOSTS;
    if (!WRAP_HOSTS.includes(arg))
        fail(`Unknown host '${arg}'. Use: ${WRAP_HOSTS.join(' | ')} | all`);
    return [arg];
}
function cliInstalled(c) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8', shell: true });
    return r.status === 0 && !r.error;
}
function legacyWrapperPaths(host) {
    if (host !== 'codex')
        return [];
    return WRAP_VERBS.map((v) => `.codex/skills/fr-${v.verb}/SKILL.md`);
}
function cmdIntegrations(args) {
    const sub = args[0] ?? 'list';
    if (sub === 'list') {
        console.log(`framein wrappers — namespace 'fr', verbs: ${WRAP_VERBS.map((v) => v.verb).join(', ')}`);
        for (const h of WRAP_HOSTS) {
            const present = wrapperFiles(h).filter((f) => existsSync(f.path)).length;
            const pattern = h === 'codex'
                ? '.agents/skills/fr-<verb>/SKILL.md'
                : wrapperFiles(h)[0].path.replace(/[^/]+$/, '*');
            console.log(`  ${h.padEnd(7)} ${pattern}  (${present}/${WRAP_VERBS.length} installed)`);
        }
        console.log('Install: framein integrations install <claude|codex|gemini|all> --write');
        return;
    }
    const hosts = resolveHosts(args[1]);
    if (sub === 'show') {
        for (const h of hosts)
            for (const f of wrapperFiles(h, WRAPPER_BIN)) {
                console.log(`# ${f.path}`);
                console.log(f.content);
            }
        return;
    }
    if (sub === 'install') {
        const write = args.includes('--write');
        let n = 0;
        for (const h of hosts)
            for (const f of wrapperFiles(h, WRAPPER_BIN)) {
                if (write) {
                    mkdirSync(dirname(f.path), { recursive: true });
                    writeFileSync(f.path, f.content);
                    console.log(`wrote ${f.path}`);
                }
                else
                    console.log(`would write ${f.path}`);
                n++;
            }
        console.log(write
            ? `Installed ${n} wrapper(s). Try /fr:verify (Claude/Gemini) or $fr-verify (Codex).`
            : `# preview of ${n} file(s) — re-run with --write. Wrappers are logic-less: they call \`framein <verb> --json\`.`);
        return;
    }
    if (sub === 'uninstall') {
        let n = 0;
        for (const h of hosts)
            for (const f of wrapperFiles(h)) {
                if (existsSync(f.path) && readFileSync(f.path, 'utf8').includes(PROVENANCE)) {
                    rmSync(f.path);
                    console.log(`removed ${f.path}`);
                    n++;
                }
            }
        for (const h of hosts)
            for (const p of legacyWrapperPaths(h)) {
                if (existsSync(p) && readFileSync(p, 'utf8').includes(PROVENANCE)) {
                    rmSync(p);
                    console.log(`removed legacy ${p}`);
                    n++;
                }
            }
        console.log(`Removed ${n} framein wrapper(s).`);
        return;
    }
    fail(`Unknown 'integrations' subcommand '${sub}'. Use: list | show | install | uninstall`);
}
function cmdDoctor() {
    console.log('framein doctor — environment check');
    for (const c of WRAP_HOSTS)
        console.log(`  CLI ${c.padEnd(7)} ${cliInstalled(c) ? 'installed' : 'not found'}`);
    for (const h of WRAP_HOSTS) {
        const present = wrapperFiles(h).filter((f) => existsSync(f.path)).length;
        console.log(`  wrappers ${h.padEnd(7)} ${present}/${WRAP_VERBS.length}  (framein integrations install ${h} --write)`);
    }
    console.log('  note: Codex wrappers are repo skills in .agents/skills/fr-<verb>/; invoke them with `$fr-verify`.');
    console.log("  note: bare-name clashes are avoided by the 'fr' namespace (/fr:verify, $fr-verify).");
}
function cmdSetup() {
    cmdDoctor();
    const detected = WRAP_HOSTS.filter(cliInstalled);
    const missing = detected.filter((h) => wrapperFiles(h).some((f) => !existsSync(f.path)));
    console.log('');
    if (detected.length === 0)
        console.log('No agent CLI detected on PATH. Install claude/codex/gemini, then: framein integrations install all --write');
    else if (missing.length === 0)
        console.log('All detected agent wrappers are installed. Use /fr:verify (Claude/Gemini) or $fr-verify (Codex) inside your agent.');
    else
        console.log(`Next: framein integrations install ${missing.join(' ')} --write   (then use /fr:verify in your agent)`);
}
// --- Optional interactive `framein` lobby (ADR-0010, layer 4): zero-dep readline switchboard ---
/** Is the agent's CLI reachable on PATH? Preflight before a /go hand-over (avoids a confusing failure). */
function agentAvailable(agent) {
    const r = spawnSync(interactiveCommand(agent), ['--version'], { encoding: 'utf8', shell: true });
    return r.status === 0 && !r.error;
}
function launchLeadTui(state, agent, interactive, prompt, caps, pause, resume, initialPrompt) {
    const ui = painter(caps);
    state.lead = agent;
    if (prompt)
        console.log(ui.tone(`(note: a prompt isn't seeded into the native TUI — paste it once ${agent} opens)`, 'muted'));
    if (!interactive) {
        console.log(ui.tone(`(skipped launching ${agent}: the lobby needs a TTY to hand over the native UI)`, 'muted'));
        return;
    }
    // Preflight: don't hand the terminal to a CLI that isn't installed (would fail confusingly under inherit).
    if (!agentAvailable(agent)) {
        const install = {
            claude: 'claude.ai/code',
            codex: 'npm i -g @openai/codex',
            gemini: 'npm i -g @google/gemini-cli  (then set GEMINI_API_KEY)',
        };
        console.error(ui.tone(`${agent} not found on PATH. Install its CLI first: ${install[agent]}`, 'danger'));
        console.error(ui.tone(`framein drives the ${agent} CLI — your API key / login lives in that CLI, framein never handles it.`, 'muted'));
        return;
    }
    // Context card + enter event: carry intent INTO the native UI; we surface state, never scrape the TUI (ADR-0009).
    let entered = false;
    let resumeSession = false; // re-entry → resume the agent's own last session (continuity)
    if (existsSync(DB_PATH)) {
        try {
            const store = Store.open(DB_PATH);
            try {
                // Have we handed off to THIS agent here before? Then continue its session instead of starting fresh.
                resumeSession = store.listLedger().some((e) => (e.kind === 'enter' || e.kind === 'return') && e.target === agent);
                const cp = store.getMemory('checkpoint', 'last');
                const rows = handoffCardRows({
                    lead: agent,
                    goal: store.getTaskContract()?.goal,
                    reviewer: store.getRole('reviewer') ?? undefined,
                    lastGreen: cp ? `${cp.sha.slice(0, 7)}${cp.label ? ` (${cp.label})` : ''}` : undefined,
                    blocker: detectThrash(store.listLedger())[0]?.message,
                });
                console.log(renderFrame(`HANDOFF → ${agent}`, ['Intent in · Validation in · Drift out'], { ui, unicode: caps.unicode, columns: caps.columns }));
                console.log(renderKeyVals(rows, ui));
                store.appendLedger('enter', agent);
                entered = true;
            }
            finally {
                store.close();
            }
        }
        catch { /* no/unreadable store — just hand over */ }
    }
    const trusted = !!state.trustUntil && state.trustUntil > Date.now();
    const trustFlags = trusted ? trustPlan(agent).flags : [];
    if (initialPrompt)
        console.log(ui.tone(`  handoff prompt seeded; ${agent} should pull the capsule first.`, 'muted'));
    console.log(ui.tone(`→ handing the terminal to ${agent} — framein is paused.`, 'brand'));
    if (resumeSession)
        console.log(ui.tone(`  ↻ resuming your previous ${agent} session (continuity).`, 'muted'));
    if (trusted)
        console.log(ui.tone(`  ⚠ trust ON — ${agent} runs WITHOUT approval prompts (${trustFlags.join(' ')}).`, 'danger'));
    console.log(ui.tone(`  to come back to the lobby, exit ${agent} (Ctrl-D). ('/go' is a lobby command — it won't return you.)`, 'muted'));
    pause();
    // trustFlags are placed per-agent by interactiveCommand (codex needs them BEFORE its `resume` subcommand).
    const res = spawnSync(interactiveCommand(agent, resumeSession, trustFlags, initialPrompt), { stdio: 'inherit', shell: true });
    resume();
    if (res.error)
        console.error(ui.tone(`Could not launch ${agent}: ${res.error.message}`, 'danger'));
    // Return event + recap + auto-handoff: if the agent armed `capsule <next>` before exiting, switch to it.
    let nextLead;
    if (entered && existsSync(DB_PATH)) {
        try {
            const s = Store.open(DB_PATH);
            try {
                s.appendLedger('return', agent);
                const pend = s.getMemory('handoff', 'next');
                if (pend) {
                    s.deleteMemory('handoff', 'next');
                    if (isAgent(pend) && pend !== agent)
                        nextLead = pend;
                } // one-shot
            }
            finally {
                s.close();
            }
        }
        catch { /* ignore */ }
    }
    console.log(ui.tone(`← back in the framein lobby (lead: ${state.lead}). \`verify\` to re-check · \`status\` for state.`, 'muted'));
    if (nextLead) {
        console.log(ui.tone(`↪ handoff: switching to ${nextLead} (carrying the capsule)…`, 'brand'));
        state.lead = nextLead;
        launchLeadTui(state, nextLead, interactive, undefined, caps, pause, resume, HANDOFF_START_PROMPT); // chain; the new lead pulls the capsule
    }
}
/** The live status block shown on shell entry (style guide §8.1/§18): who leads, the contract, sync. */
function shellStatusRows(state) {
    const branch = gitBranch();
    const rows = [['project', `${basename(process.cwd())}${branch ? ` · ${branch}` : ''}`], ['lead', state.lead]];
    if (existsSync(DB_PATH)) {
        try {
            const store = Store.open(DB_PATH);
            try {
                const rev = store.getRole('reviewer');
                if (rev)
                    rows.push(['reviewer', rev]);
                rows.push(['task', store.getTaskContract()?.goal ?? 'no active contract']);
            }
            finally {
                store.close();
            }
        }
        catch { /* show what we have */ }
    }
    else {
        rows.push(['task', 'run `init` to start']);
    }
    return rows;
}
/** The lobby's starting lead = the store's `implementer` role (if set), else the routing default.
 *  Without this the fr(<lead>)› prompt and the status row would show a hardcoded 'claude' (ADR-E fix). */
function initialLead() {
    if (existsSync(DB_PATH)) {
        try {
            const store = Store.open(DB_PATH);
            try {
                const impl = store.getRole('implementer');
                if (impl && isAgent(impl))
                    return impl;
            }
            finally {
                store.close();
            }
        }
        catch { /* unreadable store — fall through */ }
    }
    return 'claude';
}
/** Generic zero-dep arrow-key picker: a raw-mode keypress loop driving the pure select.ts reducer.
 *  TTY only (callers guard). Restores raw mode + cursor on EVERY exit path — including an unexpected
 *  process exit (the `exit` safety hook) — so the terminal is never left dirty. Returns the chosen
 *  value, or null if cancelled (Esc / Ctrl-C). One primitive powers /lead and the first-run wizard. */
function promptSelect(header, items, caps, startIndex = 0, clearOnExit = false) {
    const ui = painter(caps);
    let state = startIndex > 0 ? { ...initSelect(items), index: startIndex } : initSelect(items);
    const out = process.stdout;
    const marker = caps.unicode ? '›' : '>';
    let drawn = 0;
    const draw = (first) => {
        const lines = renderSelectLines(header, state, marker);
        if (!first) {
            moveCursor(out, 0, -drawn);
            clearScreenDown(out);
        }
        out.write(lines.map((l, i) => (i === 0 ? ui.tone(l, 'muted') : l)).join('\n') + '\n');
        drawn = lines.length;
    };
    return new Promise((resolve) => {
        const restore = () => { try {
            if (process.stdin.isTTY)
                process.stdin.setRawMode(false);
            out.write('\x1b[?25h');
        }
        catch { /* best effort */ } };
        emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY)
            process.stdin.setRawMode(true);
        process.stdin.resume();
        out.write('\x1b[?25l'); // hide cursor (ANSI)
        process.once('exit', restore); // safety net: never leave raw mode / a hidden cursor behind
        draw(true);
        const cleanup = (result) => {
            process.stdin.off('keypress', onKey);
            process.removeListener('exit', restore);
            if (clearOnExit && drawn) {
                moveCursor(out, 0, -drawn);
                clearScreenDown(out);
            } // erase the menu
            restore();
            resolve(result);
        };
        const onKey = (_str, key) => {
            const step = reduceSelectKey(state, key);
            if (step.kind === 'cancel')
                return cleanup(null);
            if (step.kind === 'accept')
                return cleanup(step.value);
            state = step.state;
            draw(false);
        };
        process.stdin.on('keypress', onKey);
    });
}
/** Interactive inline `/` command palette + line editor for the lobby (TTY only; the non-TTY path uses
 *  readline). Renders the prompt and the line you're typing; the moment the line starts with `/`, a
 *  filterable suggestion list appears BELOW it (palette.ts). ⏎ runs exactly what you typed — it never
 *  force-picks the top item; ↑/↓ opt into a suggestion and then ⏎ runs that one; Esc clears the line.
 *  Raw mode is entered only while editing and always restored before returning, so /go's child process
 *  inherits a clean cooked terminal and inter-command output is normal. Returns the line to run, or
 *  {exit} on Ctrl-D / double Ctrl-C. One keypress loop; the decision logic is the pure reducer. */
function readLobbyLine(state, caps) {
    const ui = painter(caps);
    const out = process.stdout;
    const arrow = caps.unicode ? '›' : '>';
    const marker = caps.unicode ? '›' : '>';
    const cols = caps.columns && caps.columns > 20 ? caps.columns : 80;
    const promptPlain = `fr(${state.lead})${arrow} `;
    const promptColored = `${ui.tone('fr', 'brand')}(${state.lead})${arrow} `;
    let ps = initPalette('');
    let below = 0; // lines drawn under the input line (suggestions + optional note)
    let note = ''; // transient hint (e.g. Ctrl-C armed), cleared on the next keystroke
    let sigintArmed = false;
    return new Promise((resolve) => {
        const restore = () => { try {
            if (process.stdin.isTTY)
                process.stdin.setRawMode(false);
        }
        catch { /* best effort */ } };
        const fit = (s) => (s.length > cols - 1 ? `${s.slice(0, cols - 2)}…` : s);
        // What the INPUT LINE shows. Filtering still keys off ps.buf (what you typed), but once you arrow
        // into the list the line mirrors the highlighted command — so the prompt shows what you're picking.
        const shownLine = () => {
            if (!ps.navigated)
                return ps.buf;
            const sugg = paletteSuggestions(ps.buf, LOBBY_PALETTE);
            return sugg.length ? sugg[Math.min(ps.index, sugg.length - 1)].cmd : ps.buf;
        };
        const draw = (first) => {
            if (!first) {
                out.write('\r');
                clearScreenDown(out);
            } // cursor is at end of input → col0 + wipe down
            const shown = shownLine();
            out.write(promptColored + shown); // input line; cursor now at its end
            const plain = renderPaletteSuggestions(ps, LOBBY_PALETTE, marker).map(fit);
            const idx = Math.min(ps.index, Math.max(0, plain.length - 1));
            const lines = plain.map((ln, i) => ui.tone(ln, i === idx ? 'brand' : 'muted'));
            if (note)
                lines.push(ui.tone(fit(note), 'muted'));
            for (const ln of lines)
                out.write(`\n${ln}`);
            below = lines.length;
            if (below > 0) {
                moveCursor(out, 0, -below);
                out.write('\r');
                moveCursor(out, promptPlain.length + shown.length, 0);
            }
        };
        const finish = (result) => {
            out.write('\r');
            clearScreenDown(out); // erase the live menu
            out.write(`${promptColored}${result.kind === 'line' ? result.line : shownLine()}\n`); // echo the actual command run
            process.stdin.off('keypress', onKey);
            process.removeListener('exit', restore);
            restore();
            process.stdin.pause();
            resolve(result);
        };
        const onKey = (_str, key) => {
            const step = reducePaletteKey(ps, key, LOBBY_PALETTE);
            if (step.kind === 'submit')
                return finish({ kind: 'line', line: step.line });
            if (step.kind === 'exit')
                return finish({ kind: 'exit' });
            if (step.kind === 'sigint') {
                if (ps.buf) {
                    ps = initPalette('');
                    note = '';
                    sigintArmed = false;
                    return draw(false);
                } // first Ctrl-C clears the line
                if (sigintArmed)
                    return finish({ kind: 'exit' });
                sigintArmed = true;
                note = "press Ctrl-C again (or /exit) to leave the lobby";
                return draw(false);
            }
            ps = step.state;
            note = '';
            sigintArmed = false;
            draw(false);
        };
        emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY)
            process.stdin.setRawMode(true);
        process.stdin.resume();
        process.once('exit', restore);
        process.stdin.on('keypress', onKey);
        draw(true);
    });
}
/** /lead picker: lead agents with install/current hints, starting on the current lead. */
function promptLeadSelect(current, caps) {
    const items = AGENTS.map((a) => ({
        value: a, label: a,
        hint: a === current ? 'current' : (agentAvailable(a) ? 'installed' : 'not on PATH'),
    }));
    const ci = Math.max(0, items.findIndex((i) => i.value === current));
    return promptSelect('pick a lead   ↑↓ move · type to filter · enter select · esc cancel', items, caps, ci);
}
/** First-run mini-wizard (G): shown once, interactively, when there's no project here yet. Detects which
 *  agent CLIs are installed and lets the user pick a default lead (Esc to skip). Returns the chosen lead,
 *  or null to skip; the caller runs `init` + sets the implementer role. */
async function firstRunWizard(caps) {
    const ui = painter(caps);
    // No separate banner — the wizard flows straight into the one lobby banner (single-stage entry).
    const installed = AGENTS.filter((a) => agentAvailable(a));
    if (installed.length === 0) {
        console.log(ui.tone('First run — no agent CLI found on PATH (claude / codex / gemini).', 'muted'));
        console.log(ui.tone('You can still `init` now and add an agent later: claude → claude.ai/code · codex → npm i -g @openai/codex · gemini → npm i -g @google/gemini-cli', 'muted'));
        return null;
    }
    const items = installed.map((a) => ({ value: a, label: a, hint: 'installed' }));
    // Instruction lives in the header (not a separate console.log) and clearOnExit=true erases the whole
    // picker after you choose — so first run stays ONE screen: banner → (pick flashes) → lobby.
    return await promptSelect('First run — pick your lead agent   ↑↓ · enter · esc to skip', items, caps, 0, true);
}
/** True when the cwd already has files (an existing project being introduced to framein), vs a fresh,
 *  empty folder. Drives whether first-run init asks before touching files. `.frame` is framein's own. */
function projectHasFiles() {
    try {
        return readdirSync('.').some((f) => f !== '.frame');
    }
    catch {
        return false;
    }
}
/** First run inside an EXISTING project: show exactly what init will touch and confirm before writing.
 *  The key reassurance (the user's concern): framein never deletes or overwrites your files — it only
 *  adds/updates a marked `framein` block and preserves everything else. Returns true to proceed. TTY only. */
async function confirmInitInExistingProject(caps) {
    const ui = painter(caps);
    console.log(ui.tone('This folder already has files — here’s exactly what setting up framein will do.', 'muted'));
    console.log(ui.tone('It does NOT delete or overwrite anything: it only adds a marked `framein` block', 'brand'));
    console.log(ui.tone('and leaves the rest of each file untouched (every change shows up in `git diff`).', 'brand'));
    for (const n of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']) {
        const what = existsSync(n)
            ? 'exists → appends a managed block at the end; your content is preserved'
            : 'will be created (new file)';
        console.log(`  • ${ui.tone(n.padEnd(10), 'muted')} ${ui.tone(what, 'muted')}`);
    }
    console.log(`  • ${ui.tone('.frame/'.padEnd(10), 'muted')} ${ui.tone('local store (rebuildable cache — add to .gitignore)', 'muted')}`);
    const ans = await promptSelect('Set up framein in this project?', [
        { value: 'yes', label: 'yes', hint: 'add the framein block(s) — nothing else is touched' },
        { value: 'no', label: 'no', hint: 'skip — run `init` yourself later' },
    ], caps, 0, true);
    return ans === 'yes';
}
/** Lobby: after switching to an agent that's installed but has no wrappers yet, offer to install them.
 *  Raw-mode confirm — the caller must have the readline interface closed (true in the /lead picker path). */
async function offerWrappers(agent, caps) {
    if (!cliInstalled(agent))
        return; // CLI not installed → nothing to wrap
    if (wrapperFiles(agent).every((f) => existsSync(f.path)))
        return; // already installed
    const ui = painter(caps);
    const ans = await promptSelect(`Install ${agent} commands (${agent === 'codex' ? '$fr-*' : '/fr:*'})?`, [{ value: 'yes', label: 'yes', hint: 'install now' }, { value: 'no', label: 'no', hint: 'later' }], caps, 0, true);
    if (ans === 'yes')
        console.log(ui.tone(`installed ${writeWrappers(agent)} ${agent} wrapper(s)`, 'brand'));
}
/** Apply the path-independent lobby actions (everything EXCEPT exit / pickLead / launchLead, which need
 *  the caller's I/O context). Returns true if handled. Shared by the interactive (inline-palette) loop
 *  and the non-TTY readline path so the two never drift. */
function applyLobbyCommon(action, state, caps, interactive) {
    const ui = painter(caps);
    switch (action.kind) {
        case 'noop': return true;
        case 'help':
            console.log(renderShellHelp());
            return true;
        case 'setLead':
            state.lead = action.agent;
            console.log(ui.tone(`lead ${ui.sym.next} ${state.lead}`, 'brand'));
            if (interactive && cliInstalled(action.agent) && !wrapperFiles(action.agent).every((f) => existsSync(f.path)))
                console.log(ui.tone(`tip: \`integrations install ${action.agent} --write\` adds its ${action.agent === 'codex' ? '$fr-*' : '/fr:*'} commands`, 'muted'));
            return true;
        case 'toggleTrust': {
            const now = Date.now();
            if (state.trustUntil && state.trustUntil > now) {
                state.trustUntil = undefined;
                console.log(ui.tone('trust OFF — /go runs the lead with normal per-action approval prompts.', 'brand'));
            }
            else {
                state.trustUntil = now + DEFAULT_TRUST_TTL_SEC * 1000;
                console.log(ui.tone(`⚠ trust ON for ${Math.round(DEFAULT_TRUST_TTL_SEC / 60)}m — the next /go launches the lead WITHOUT per-action approval prompts.`, 'danger'));
                console.log(ui.tone('  a worktree is NOT a sandbox: network, credentials, installs are not blocked. /trust again to disarm.', 'muted'));
            }
            return true;
        }
        case 'error':
            console.error(ui.tone(action.message, 'danger'));
            return true;
        case 'engine':
            if (action.args[0] === 'mcp' && action.args[1] === 'serve') {
                console.error('`mcp serve` would consume the lobby stdin — run it as `framein mcp serve` instead.');
                return true;
            }
            try {
                runCommand(action.args);
            }
            catch (e) {
                if (e instanceof CliError) {
                    if (e.message)
                        console.error(e.message);
                }
                else
                    throw e;
            }
            process.exitCode = 0; // a command's failure code shouldn't doom the lobby session
            return true;
        default: return false; // exit / pickLead / launchLead — the caller's I/O context handles these
    }
}
let inLobby = false; // true while the lobby owns stdin → cmdTask skips its own readline (no conflict)
function cmdShell() {
    inLobby = true;
    const interactive = Boolean(process.stdin.isTTY);
    const caps = cliCaps();
    const ui = painter(caps);
    const arrow = caps.unicode ? '›' : '>';
    process.exitCode = 0;
    // Entry is wrapped in an async flow because the first-run wizard, the inline palette editor, and the
    // /lead picker all await raw-mode input. Interactive sessions run the inline-palette lobbyLoop; non-TTY
    // (piped) sessions use the plain readline open() loop. Both end by printing "bye".
    void (async () => {
        let lead = initialLead();
        const firstRun = interactive && !existsSync(DB_PATH);
        // Banner FIRST so the first thing you see is "you're in framein". The first-run picker then opens
        // below it and ERASES itself on choice (clearOnExit), so what remains is a single lobby screen —
        // not a stacked [pick]+[welcome] two-stage view.
        if (interactive) {
            const ver = readVersion().replace(/^framein /, 'v'); // e.g. v0.0.5
            console.log(renderFrame('FRAMEIN', [`Framein by Frameout · ${ver}`, 'Intent in · Validation in · Drift out'], { ui, unicode: caps.unicode, columns: caps.columns }));
            console.log('');
        }
        let setupNote = '';
        if (firstRun) {
            const chosen = await firstRunWizard(caps); // self-clearing picker
            if (chosen) {
                // Empty folder → set up silently. Existing project → show what changes + confirm first (the
                // managed block is additive and non-destructive, but we still ask before touching their files).
                const proceed = projectHasFiles() ? await confirmInitInExistingProject(caps) : true;
                if (proceed) {
                    try {
                        const n = cmdInit({ lead: chosen, quiet: true });
                        lead = chosen;
                        setupNote = ui.tone(`✓ set up · context synced${n ? ` · ${n} wrappers (/fr:* · $fr-*)` : ''}`, 'brand');
                    }
                    catch (e) {
                        if (e instanceof CliError && e.message)
                            console.error(e.message);
                    }
                }
                else {
                    lead = chosen; // chosen in-memory; nothing written
                    setupNote = ui.tone('Skipped setup — nothing was written. Run `init` when you’re ready.', 'muted');
                }
            }
        }
        const state = { lead };
        if (interactive) {
            console.log(ui.tone('Your home base for AI coding — switch the lead agent, run a local check, or hand off with /go.', 'muted'));
            console.log('');
            console.log(renderKeyVals(shellStatusRows(state), ui));
            console.log('');
            if (setupNote)
                console.log(setupNote);
            console.log(ui.tone(existsSync(DB_PATH)
                ? 'Type / to browse commands (filters as you type · ↑↓ to pick · ⏎ runs)  ·  /go · /help · /exit'
                : 'Not set up yet → type /init first.   Then type / to browse commands · /help · /exit', 'muted'));
        }
        // Non-TTY (piped / automation) path: a plain readline loop. The interactive TTY path uses the inline
        // `/` palette editor (readLobbyLine + lobbyLoop) below. Both route through applyLobbyCommon so the
        // command behavior is identical; only the line-reading + exit/picker I/O differs.
        const open = () => {
            let sigintArmed = false;
            const iface = createInterface({ input: process.stdin, output: process.stdout, completer: lobbyCompleter });
            const next = () => { if (interactive) {
                iface.setPrompt(`${ui.tone('fr', 'brand')}(${state.lead})${arrow} `);
                iface.prompt();
            } };
            iface.on('line', (line) => {
                sigintArmed = false;
                const action = routeShellLine(line, state);
                if (applyLobbyCommon(action, state, caps, interactive)) {
                    next();
                    return;
                }
                switch (action.kind) {
                    case 'exit':
                        iface.close();
                        return; // close handler prints bye
                    case 'pickLead':
                        console.log(`lead: ${state.lead}`);
                        break; // non-TTY fallback: never block on a picker
                    case 'launchLead':
                        launchLeadTui(state, action.agent, interactive, action.prompt, caps, () => iface.pause(), () => iface.resume());
                        break;
                }
                next();
            });
            iface.on('SIGINT', () => {
                if (sigintArmed) {
                    iface.close();
                    return;
                }
                sigintArmed = true;
                console.log(ui.tone("press Ctrl-C again (or type 'exit') to leave the lobby", 'muted'));
                next();
            });
            iface.on('close', () => console.log(ui.tone('bye', 'muted')));
            next();
        };
        // Interactive TTY path: read one line via the inline `/` palette editor, route it, repeat.
        const lobbyLoop = async () => {
            for (;;) {
                const r = await readLobbyLine(state, caps);
                if (r.kind === 'exit')
                    break;
                const action = routeShellLine(r.line, state);
                if (applyLobbyCommon(action, state, caps, true))
                    continue;
                if (action.kind === 'exit')
                    break;
                if (action.kind === 'pickLead') {
                    const picked = await promptLeadSelect(state.lead, caps);
                    if (picked && picked !== state.lead) {
                        state.lead = picked;
                        console.log(ui.tone(`lead ${ui.sym.next} ${state.lead}`, 'brand'));
                        await offerWrappers(picked, caps);
                    }
                    else
                        console.log(ui.tone(`lead: ${state.lead}`, 'muted'));
                }
                else if (action.kind === 'launchLead') {
                    launchLeadTui(state, action.agent, true, action.prompt, caps, () => { }, () => { });
                }
            }
            console.log(ui.tone('bye', 'muted'));
        };
        if (interactive)
            await lobbyLoop();
        else
            open();
    })();
}
const CONTRACT_FIELDS = ['goal', 'preserve', 'acceptance', 'protected', 'nongoal'];
/** Loud, git-pointing notice whenever the Task Contract changes. The contract is tracked end-to-end,
 *  so every change — human- OR agent-driven — must be visible and reviewable (auto-applied, never
 *  silent; ADR-0012). git diff of the managed block is the audit + the undo. */
function surfaceContractChange(what) {
    console.log(`⚠ Contract changed (${what}) — tracked end-to-end. Review/undo: git diff -- CLAUDE.md AGENTS.md GEMINI.md`);
}
/** Conversational `framein start` (no goal, terminal only): ask the contract fields one by one, then
 *  set it. Skipped inside the lobby (it owns stdin) and in non-TTY/automation (which need an explicit goal). */
async function runGuidedStart() {
    const ui = painter(cliCaps());
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((res) => rl.question(`${ui.tone('?', 'brand')} ${q}\n  `, res));
    console.log(ui.tone('Guided start — define the contract (the definition of done). Empty goal aborts.', 'muted'));
    const answers = {};
    for (const step of GUIDED_CONTRACT_STEPS) {
        const a = (await ask(step.question)).trim();
        if (step.field === 'goal' && !a) {
            console.log(ui.tone('No goal — aborted.', 'muted'));
            rl.close();
            return;
        }
        if (a)
            answers[step.field] = a;
    }
    rl.close();
    const c = buildGuidedContract(answers);
    withStore((store) => {
        withCliWriteLock(store, 'task', () => {
            store.setTaskContract(c);
            store.appendLedger('task-start', '', c.goal.slice(0, 200));
            writeNativeFiles('.', store.getState());
            console.log(`Task contract started: ${c.goal}`);
            for (const i of contractIssues(c))
                console.log(`  ⚠ ${i}`);
            surfaceContractChange('start');
        });
    });
}
function cmdTask(args) {
    if ((args[0] ?? 'show') === 'start' && !args.slice(1).join(' ').trim() && Boolean(process.stdin.isTTY) && !inLobby) {
        void runGuidedStart();
        return; // conversational contract builder (terminal only)
    }
    withStore((store) => {
        const sub = args[0] ?? 'show';
        if (sub === 'start') {
            const goal = args.slice(1).join(' ').trim();
            if (!goal)
                fail('Usage: framein task start <goal>');
            withCliWriteLock(store, 'task', () => {
                const c = emptyContract(goal);
                store.setTaskContract(c);
                store.appendLedger('task-start', '', goal.slice(0, 200));
                writeNativeFiles('.', store.getState()); // project the contract as standing intent
                console.log(`Task contract started: ${goal}`);
                console.log('  Add criteria: framein task amend acceptance "<...>"  (fields: ' + CONTRACT_FIELDS.join('|') + ')');
                for (const i of contractIssues(c))
                    console.log(`  ⚠ ${i}`);
                surfaceContractChange('start');
            });
        }
        else if (sub === 'amend') {
            const field = args[1];
            const value = args.slice(2).join(' ').trim();
            if (!field || !CONTRACT_FIELDS.includes(field) || !value) {
                fail(`Usage: framein task amend <${CONTRACT_FIELDS.join('|')}> <value>`);
            }
            withCliWriteLock(store, 'task', () => {
                const cur = store.getTaskContract();
                if (!cur)
                    fail('No active task contract. Run `framein task start <goal>` first.');
                store.setTaskContract(amendContract(cur, field, value));
                writeNativeFiles('.', store.getState());
                console.log(`Amended ${field}; contract re-projected to the native files.`);
                surfaceContractChange(`amend ${field}`);
            });
        }
        else if (sub === 'show') {
            const cur = store.getTaskContract();
            if (wantsJson(args)) {
                emitJson('task', { contract: cur ?? null, issues: cur ? contractIssues(cur) : [] });
                return;
            }
            if (!cur) {
                console.log('No active task contract. Run `framein task start <goal>`.');
                return;
            }
            console.log(renderContractFull(cur, cliUi()));
            for (const i of contractIssues(cur))
                console.log(`  ⚠ ${i}`);
        }
        else {
            fail(`Unknown 'task' subcommand '${sub}'. Use: start | show | amend`);
        }
    });
}
// --- Disagreement Protocol (F-LOOP-5): bounded model-vs-model debate, lead keeps control ---
function flagValue(args, flag) {
    const i = args.indexOf(flag);
    if (i === -1)
        return undefined;
    const parts = [];
    for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++)
        parts.push(args[j]);
    return parts.join(' ');
}
function cmdChallenge(args) {
    withStore((store) => {
        const reviewer = store.getRole('reviewer');
        let d = store.getMemory('debate', 'current');
        if (args.includes('--show')) {
            if (!d) {
                console.log('No open debate.');
                return;
            }
            console.log(renderDebate(d, cliUi()));
            return;
        }
        if (args.includes('--accept')) {
            if (!d)
                fail('No open debate to accept.');
            d.entries.push({ kind: 'challenge', challenge: { verdict: 'accept', by: reviewer } });
            store.setMemory('debate', 'current', d);
            store.appendLedger('challenge', 'accept');
            console.log(renderDebate(d, cliUi()));
            return;
        }
        if (args.includes('--block')) {
            if (!d)
                fail('No open debate. Start one: framein challenge "<proposal>".');
            const claim = flagValue(args, '--block') ?? '';
            const requiredChange = flagValue(args, '--require');
            d.entries.push({ kind: 'challenge', challenge: { verdict: 'challenge', claim, requiredChange, by: reviewer } });
            store.setMemory('debate', 'current', d);
            store.appendLedger('challenge', '', claim.slice(0, 80));
            console.log(renderDebate(d, cliUi()));
            return;
        }
        // --by <host>: which model is invoking (the agent wrapper passes its own host) → pick a reviewer ≠ it.
        const byIdx = args.indexOf('--by');
        const by = byIdx !== -1 ? args[byIdx + 1] : undefined;
        // proposal text = positionals, skipping flags and --by's single value.
        const positional = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--by') {
                i++;
                continue;
            }
            if (args[i].startsWith('--'))
                continue;
            positional.push(args[i]);
        }
        const text = positional.join(' ').trim();
        if (!text)
            fail('Usage: framein challenge "<proposal>" [--run] | --block "<claim>" [--require "<change>"] | --accept | --show');
        const proposer = by && isAgent(by) ? by : (store.getRole('lead') ?? store.getRole('implementer'));
        d = newDebate(text, { text, by: proposer });
        store.setMemory('debate', 'current', d);
        console.log(renderDebate(d, cliUi()));
        if (args.includes('--run')) {
            const indep = independentReviewer(store, by);
            if (!indep) {
                console.log(`\n(no independent model available${by ? ` other than ${by}` : ''} — install another agent CLI, set a different \`reviewer\` role, or record manually with --block/--accept.)`);
                return;
            }
            if (by && reviewer === by)
                console.log(`(reviewer role is ${by} = the calling model — using ${indep} instead so the verdict is genuinely independent.)`);
            const facts = gatherChallengeFacts(store, text, d);
            const verdict = runReviewerChallenge(store, d, indep, facts);
            if (!verdict)
                return;
            const lead = proposer && isAgent(proposer) ? proposer : undefined;
            const leadResponse = verdict.verdict === 'challenge' && lead && lead !== indep
                ? runLeadChallengeResponse(store, d, lead, facts, verdict)
                : undefined;
            console.log('\n' + renderDecisionBrief({ proposal: text, reviewer: indep, lead, verdict, leadResponse }));
            return;
        }
        const hint = independentReviewer(store, by);
        if (hint)
            console.log(`\n(get an independent verdict from ${hint} with --run, or record one with --block/--accept)`);
    });
}
function gatherChallengeFacts(store, proposal, debate) {
    const changed = gitChangedFiles();
    return {
        proposal,
        contract: store.getTaskContract(),
        capsule: gatherCapsule(store),
        evidence: store.getMemory('evidence', 'last'),
        risk: assessBlastRadius(changed),
        ledger: store.listLedger(40),
        debate,
    };
}
/** A reviewer that is NOT the calling model (`by`) so an "independent challenge" is actually independent:
 *  the configured reviewer if it differs, else the first OTHER installed agent. undefined if none differ. */
function independentReviewer(store, by) {
    const configured = store.getRole('reviewer');
    if (configured && configured !== by && agentAvailable(configured))
        return configured;
    return AGENTS.find((a) => a !== by && agentAvailable(a));
}
/**
 * Live structured ingest (M25): ask the reviewer for a JSON verdict on the proposal, extract it
 * tolerantly, and record it as a Challenge in the debate. The prompt (fixed instruction + the
 * proposal) goes via stdin — injection-safe. Needs the real reviewer CLI.
 */
function runReviewerChallenge(store, d, reviewer, facts) {
    const inv = buildInvocation(reviewer, buildReviewerPrompt(facts));
    console.log(`\nAsking reviewer ${reviewer} for a structured verdict...`);
    const res = spawnSync(invocationCommand(inv), { input: inv.stdin, encoding: 'utf8', shell: true });
    const parsed = normalizeReviewerVerdict(extractJson(res.stdout ?? ''));
    if (!parsed) {
        console.log(`(reviewer ${reviewer} did not return a parseable verdict; record manually with --block/--accept; raw output:)`);
        if (res.stdout)
            process.stdout.write(res.stdout);
        if (res.stderr)
            process.stderr.write(res.stderr);
        return undefined;
    }
    d.entries.push({ kind: 'challenge', challenge: challengeFromVerdict(parsed, reviewer) });
    store.setMemory('debate', 'current', d);
    store.appendLedger('challenge', reviewer, parsed.verdict);
    console.log(`(reviewer ${reviewer} responded)\n`);
    console.log(renderDebate(d, cliUi()));
    return parsed;
}
function runLeadChallengeResponse(store, d, lead, facts, verdict) {
    if (!agentAvailable(lead)) {
        console.log(`(lead ${lead} is not available for a live response; decide manually.)`);
        return undefined;
    }
    const inv = buildInvocation(lead, buildLeadResponsePrompt(facts, verdict));
    console.log(`\nAsking lead ${lead} for one bounded response...`);
    const res = spawnSync(invocationCommand(inv), { input: inv.stdin, encoding: 'utf8', shell: true });
    const parsed = normalizeLeadModelResponse(extractJson(res.stdout ?? ''));
    if (!parsed) {
        console.log(`(lead ${lead} did not return a parseable response; decide manually; raw output:)`);
        if (res.stdout)
            process.stdout.write(res.stdout);
        if (res.stderr)
            process.stderr.write(res.stderr);
        return undefined;
    }
    d.entries.push({ kind: 'response', response: responseFromLeadModel(parsed, lead) });
    store.setMemory('debate', 'current', d);
    store.appendLedger('challenge-response', lead, parsed.text.slice(0, 80));
    console.log(`(lead ${lead} responded)\n`);
    console.log(renderDebate(d, cliUi()));
    return parsed;
}
function cmdDecide(args) {
    withStore((store) => {
        const d = store.getMemory('debate', 'current');
        if (!d)
            fail('No open debate. Start one with `framein challenge "<proposal>"`.');
        const verb = args[0];
        const text = args.slice(1).join(' ').trim();
        if (verb !== 'accept' && verb !== 'reject')
            fail('Usage: framein decide accept|reject [text]');
        d.entries.push({ kind: 'revision', revision: { text, accepted: verb === 'accept', by: store.getRole('lead') } });
        store.setMemory('debate', 'current', d);
        store.appendLedger('decide', verb, text.slice(0, 80));
        console.log(renderDebate(d, cliUi()));
    });
}
function cmdTrust(args) {
    const agent = args.find((a) => !a.startsWith('--'));
    if (!agent || !isAgent(agent))
        fail(`Usage: framein trust <agent> [--ttl <dur>]   (agent: ${AGENTS.join('|')})`);
    let ttlSec;
    const ttlIdx = args.indexOf('--ttl');
    if (ttlIdx !== -1) {
        const parsed = args[ttlIdx + 1] ? parseDuration(args[ttlIdx + 1]) : null;
        if (parsed === null)
            fail('Usage: framein trust <agent> --ttl <dur>   (e.g. 30m, 1h, 90s)');
        ttlSec = parsed;
    }
    const plan = trustPlan(agent, { ttlSec });
    // preview only — framein does NOT enable bypass for you (F-TRUST: dangerous, explicit, opt-in).
    console.log(`trust preview for ${agent} (time-box ~${Math.round(plan.ttlSec / 60)}m):`);
    console.log(`  would add: ${plan.flags.join(' ')}`);
    for (const w of plan.warnings)
        console.log(`  ⚠ ${w}`);
    console.log('  framein does NOT auto-enable this — pass the flags yourself, scoped + time-boxed, when you launch.');
}
const HELP_ROWS = [
    ['start <goal>', 'start a Task Contract (what "done" means)'],
    ['task show|amend', 'show / amend the Task Contract'],
    ['verify', 'run build/test + check validation vs the contract'],
    ['ship', 'enforced Validation Gate (commit/deploy readiness)'],
    ['risk', 'Blast Radius Guard: sensitive-file risk + gates'],
    ['route explain [role]', 'repo-local routing: which agent + why · also: stats'],
    ['recipe list|show|compile', 'vendor-neutral task protocols, compiled per CLI'],
    ['debt | explain', 'debt delta of this change · ownership brief'],
    ['rescue', 'detect a repair loop + propose options (no auto-action)'],
    ['checkpoint [label]', 'mark the current commit green · also: rewind [--force]'],
    ['pause | resume', 'save / restore a Task Capsule (handoff-free continuity)'],
    ['challenge | decide', 'reviewer verdict + one lead response, then decide'],
    ['init', 'initialize store + project native files'],
    ['rules show|set|reset', 'view / set the project rules the agent follows (editable defaults)'],
    ['status', 'show roles, lock, decision count'],
    ['role set <role> <agent>', 'assign a role (re-syncs files) · also: role list'],
    ['adr add|supersede|show|list', 'record/replace/show/list decisions (append-only)'],
    ['sync [--dry-run]', 're-project native files from the store'],
    ['unlock [scope]', 'release a stale write lock (default: global)'],
    ['export [path] | import [path]', 'write / rebuild the git-canonical snapshot (JSON)'],
    ['mcp [patch|register|serve]', 'detected servers / patches / registration / thin server'],
    ['skills', 'list framein + detected (reused) skills'],
    ['ask <role> [prompt]', 'preview/record/run a headless delegation [--show|--run]'],
    ['audit', 'report thrash/anomaly signals from the ledger'],
    ['ledger add <kind> [t]', 'append a work-event (edit|test-fail|turn|commit…)'],
    ['trust <agent> [--ttl d]', 'preview per-agent permission-bypass flags (no auto-enable)'],
    ['lobby', 'optional interactive switchboard — also bare `framein` (zero-dep; native TUI on /go)'],
    ['setup | doctor', 'detect agent CLIs + recommend/verify wrapper install'],
    ['integrations <sub> [--write]', 'install/remove logic-less /fr:* wrappers (claude|codex|gemini)'],
    ['--version | --help', 'version / this help'],
];
function printHelp() {
    console.log('framein (frame) — keep AI coding aligned with intent, validate done, rescue when lost');
    console.log('CLI: framein  ·  aliases: frame, fr  ·  slash namespace: /fr:*  ·  automation: <verb> --json');
    console.log('Commands:');
    const w = Math.max(...HELP_ROWS.map(([c]) => c.length));
    for (const [c, d] of HELP_ROWS)
        console.log(`  framein ${c.padEnd(w)}  ${d}`);
}
function runCommand(argv) {
    const [cmd, ...rest] = argv;
    {
        // per-command help: `framein <cmd> --help`
        if (cmd && USAGE[cmd] && rest.includes('--help')) {
            console.log(USAGE[cmd]);
            return;
        }
        switch (cmd) {
            case 'init':
                cmdInit();
                break;
            case 'rules':
                cmdRules(rest);
                break;
            case 'status':
                cmdStatus(rest);
                break;
            case 'role':
                cmdRole(rest);
                break;
            case 'adr':
                cmdAdr(rest);
                break;
            case 'sync':
                cmdSync(rest);
                break;
            case 'unlock':
                cmdUnlock(rest);
                break;
            case 'export':
                cmdExport(rest);
                break;
            case 'import':
                cmdImport(rest);
                break;
            case 'mcp':
                cmdMcp(rest);
                break;
            case 'skills':
                cmdSkills();
                break;
            case 'ask':
                cmdAsk(rest);
                break;
            case 'audit':
                cmdAudit();
                break;
            case 'ledger':
                cmdLedger(rest);
                break;
            case 'trust':
                cmdTrust(rest);
                break;
            case 'task':
                cmdTask(rest);
                break;
            case 'start':
                cmdTask(['start', ...rest]);
                break; // front-stage verb: start a Task Contract
            case 'verify':
                cmdVerify(rest);
                break;
            case 'ship':
                cmdShip(rest);
                break;
            case 'risk':
                cmdRisk(rest);
                break;
            case 'route':
                cmdRoute(rest);
                break;
            case 'stats':
                cmdStats(rest);
                break;
            case 'recipe':
                cmdRecipe(rest);
                break;
            case 'debt':
                cmdDebt(rest);
                break;
            case 'explain':
                cmdExplain(rest);
                break;
            case 'rescue':
                cmdRescue(rest);
                break;
            case 'checkpoint':
                cmdCheckpoint(rest);
                break;
            case 'rewind':
                cmdRewind(rest);
                break;
            case 'pause':
                cmdPause();
                break;
            case 'resume':
                cmdResume();
                break;
            case 'capsule':
                cmdCapsule(rest);
                break;
            case 'challenge':
                cmdChallenge(rest);
                break;
            case 'decide':
                cmdDecide(rest);
                break;
            case 'integrations':
                cmdIntegrations(rest);
                break;
            case 'doctor':
                cmdDoctor();
                break;
            case 'setup':
                cmdSetup();
                break;
            case '-v':
            case '--version':
                console.log(readVersion());
                break;
            case undefined:
                // Bare `framein` in a terminal drops straight into the lobby; piped/CI invocation stays
                // automation-safe and prints help (an interactive readline on a non-TTY would hang). The
                // explicit `framein shell` verb keeps working for both. (stdio:'inherit' in bin.ts preserves
                // the real TTY through the no-warnings re-exec, so isTTY is accurate here.)
                if (process.stdin.isTTY) {
                    cmdShell();
                    break;
                }
                printHelp();
                break;
            case '-h':
            case '--help':
                printHelp();
                break;
            case 'lobby':
            case 'shell':
                cmdShell();
                break; // `shell` kept as a hidden back-compat alias
            default:
                printHelp();
                throw new CliError(`Unknown command '${cmd}'.`);
        }
    }
}
function main() {
    try {
        runCommand(process.argv.slice(2));
    }
    catch (e) {
        if (e instanceof CliError) {
            if (e.message)
                console.error(e.message);
            process.exit(1);
        }
        throw e;
    }
}
main();
