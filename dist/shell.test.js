import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeShellLine, renderShellHelp, lobbyCompleter, LOBBY_PALETTE } from './shell.js';
const st = () => ({ lead: 'claude' });
test('routeShellLine: blanks / exit / help', () => {
    assert.equal(routeShellLine('', st()).kind, 'noop');
    assert.equal(routeShellLine('   ', st()).kind, 'noop');
    assert.equal(routeShellLine('exit', st()).kind, 'exit');
    assert.equal(routeShellLine('/quit', st()).kind, 'exit');
    assert.equal(routeShellLine('?', st()).kind, 'help');
});
test('routeShellLine: framein verbs reachable with or without a slash', () => {
    assert.deepEqual(routeShellLine('verify', st()), { kind: 'engine', args: ['verify'] });
    assert.deepEqual(routeShellLine('/verify --json', st()), { kind: 'engine', args: ['verify', '--json'] });
    assert.deepEqual(routeShellLine('task show', st()), { kind: 'engine', args: ['task', 'show'] });
});
test('routeShellLine: /lead opens the picker, switches, and validates the agent', () => {
    assert.equal(routeShellLine('/lead', st()).kind, 'pickLead');
    assert.deepEqual(routeShellLine('/lead codex', st()), { kind: 'setLead', agent: 'codex' });
    assert.equal(routeShellLine('/lead banana', st()).kind, 'error');
});
test('routeShellLine: /go and bare agent names launch a native TUI', () => {
    assert.deepEqual(routeShellLine('/go', st()), { kind: 'launchLead', agent: 'claude', prompt: undefined });
    assert.deepEqual(routeShellLine('/go fix it', st()), { kind: 'launchLead', agent: 'claude', prompt: 'fix it' });
    assert.deepEqual(routeShellLine('codex', st()), { kind: 'launchLead', agent: 'codex', prompt: undefined });
    assert.deepEqual(routeShellLine('gemini audit the diff', st()), { kind: 'launchLead', agent: 'gemini', prompt: 'audit the diff' });
});
test('routeShellLine: /trust toggles session permission-bypass', () => {
    assert.deepEqual(routeShellLine('/trust', st()), { kind: 'toggleTrust' });
});
test('routeShellLine: quote-aware tokens — multi-word values survive in the lobby (no literal quotes)', () => {
    assert.deepEqual(routeShellLine('start "add Google login"', st()), { kind: 'engine', args: ['start', 'add Google login'] });
    assert.deepEqual(routeShellLine('task amend nongoal "UI 전체 리디자인"', st()), { kind: 'engine', args: ['task', 'amend', 'nongoal', 'UI 전체 리디자인'] });
    assert.deepEqual(routeShellLine("start 'single quoted goal'", st()), { kind: 'engine', args: ['start', 'single quoted goal'] });
});
test('routeShellLine: no nested lobby (shell alias too); help is grouped and free of internal jargon', () => {
    assert.equal(routeShellLine('lobby', st()).kind, 'error');
    assert.equal(routeShellLine('shell', st()).kind, 'error'); // back-compat alias also blocked from nesting
    const help = renderShellHelp();
    assert.match(help, /lobby/); // self-identifies as the lobby
    assert.match(help, /\binit\b/); // init must be visible (it's the key first action)
    assert.match(help, /\/lead/); // grouped commands present
    assert.match(help, /\/go/);
    assert.doesNotMatch(help, /ADR-\d|node-pty/); // no internal jargon leaks into user help
});
test('LOBBY_PALETTE: covers the key lobby commands, all slash-prefixed, with descriptions', () => {
    const cmds = LOBBY_PALETTE.map((c) => c.cmd);
    for (const c of ['/init', '/verify', '/ship', '/lead', '/go', '/help', '/exit'])
        assert.ok(cmds.includes(c), `palette missing ${c}`);
    assert.ok(LOBBY_PALETTE.every((c) => c.cmd.startsWith('/')), 'every palette entry is slash-prefixed (consistency)');
    assert.ok(LOBBY_PALETTE.every((c) => c.desc.length > 0)); // every entry has a one-liner
});
test('lobbyCompleter: completes verbs, slash commands, and agents after /lead', () => {
    const [verbHits] = lobbyCompleter('ver');
    assert.deepEqual(verbHits, ['verify']); // bare verb
    const [slashHits] = lobbyCompleter('/ri');
    assert.deepEqual(slashHits, ['/risk']); // slash-prefixed verb
    const [leadHits, frag] = lobbyCompleter('/lead co');
    assert.deepEqual(leadHits, ['codex']); // agent name after /lead
    assert.equal(frag, 'co'); // fragment being completed
    const [initHit] = lobbyCompleter('ini');
    assert.deepEqual(initHit, ['init']); // init is completable
    const [allLeads] = lobbyCompleter('/lead ');
    assert.ok(allLeads.includes('claude') && allLeads.includes('gemini')); // empty frag → all agents
});
import { handoffCardRows } from './shell.js';
test('handoffCardRows: full context, and omits empty fields', () => {
    const full = handoffCardRows({ lead: 'codex', goal: 'add OAuth', reviewer: 'gemini', lastGreen: '8f2c1ab (baseline)', blocker: 'auth.test.ts failing' });
    assert.deepEqual(full, [
        ['lead', 'codex'], ['reviewer', 'gemini'], ['task', 'add OAuth'],
        ['last green', '8f2c1ab (baseline)'], ['blocker', 'auth.test.ts failing'],
    ]);
    const bare = handoffCardRows({ lead: 'claude' });
    assert.deepEqual(bare, [['lead', 'claude'], ['task', 'no active contract']]); // empties dropped
});
