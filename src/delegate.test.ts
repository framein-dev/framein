import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDOFF_START_PROMPT, buildInvocation, resolveAgent, renderInvocation, invocationCommand, interactiveCommand } from './delegate.js';

test('buildInvocation: fixed flags in args, prompt via stdin (injection-safe)', () => {
  assert.deepEqual(buildInvocation('claude', 'hi'), { command: 'claude', args: ['-p'], stdin: 'hi' });
  assert.deepEqual(buildInvocation('codex', 'hi'), { command: 'codex', args: ['exec', '--skip-git-repo-check'], stdin: 'hi' });
  assert.deepEqual(buildInvocation('gemini', 'hi'), { command: 'gemini', args: ['--prompt=', '--skip-trust'], stdin: 'hi' });
});

test('buildInvocation: trustFlags append to argv (fixed flags, shell-safe)', () => {
  assert.deepEqual(buildInvocation('claude', 'hi', { trustFlags: ['--dangerously-skip-permissions'] }).args, ['-p', '--dangerously-skip-permissions']);
  assert.deepEqual(buildInvocation('codex', 'hi', { trustFlags: ['--full-auto'] }).args, ['exec', '--skip-git-repo-check', '--full-auto']);
});

test('invocationCommand stays fixed even for a hostile prompt (no shell injection)', () => {
  // the command line carries NO user text; a prompt with shell metachars cannot reach the shell
  assert.equal(invocationCommand(buildInvocation('codex', 'rm -rf / ; echo pwn')), 'codex exec --skip-git-repo-check');
  assert.equal(invocationCommand(buildInvocation('claude', '$(whoami)')), 'claude -p');
});

test('interactiveCommand: bare agent command for stdio:inherit attach', () => {
  assert.equal(interactiveCommand('claude'), 'claude');
  assert.equal(interactiveCommand('codex'), 'codex');
  assert.equal(interactiveCommand('gemini'), 'gemini');
});

test('interactiveCommand: resume re-enters each CLI\'s most-recent session in cwd', () => {
  assert.equal(interactiveCommand('claude', true), 'claude --continue');
  assert.equal(interactiveCommand('codex', true), 'codex resume --last');
  assert.equal(interactiveCommand('gemini', true), 'gemini --resume');
});

test('interactiveCommand: trust flags placed where each CLI accepts them (codex BEFORE its subcommand)', () => {
  // codex `resume` is a subcommand → bypass flags must precede it, not trail it.
  assert.equal(interactiveCommand('codex', false, ['--full-auto']), 'codex --full-auto');
  assert.equal(interactiveCommand('codex', true, ['--full-auto']), 'codex --full-auto resume --last');
  // claude/gemini use plain flags → trust flags can follow.
  assert.equal(interactiveCommand('claude', true, ['--dangerously-skip-permissions']), 'claude --continue --dangerously-skip-permissions');
  assert.equal(interactiveCommand('gemini', false, ['--yolo']), 'gemini --yolo');
});

test('interactiveCommand: handoff prompt is seeded only as an initial interactive prompt', () => {
  const quoted = process.platform === 'win32' ? `"${HANDOFF_START_PROMPT}"` : `'${HANDOFF_START_PROMPT}'`;
  assert.equal(interactiveCommand('claude', false, [], HANDOFF_START_PROMPT), `claude ${quoted}`);
  assert.equal(interactiveCommand('codex', true, ['--full-auto'], HANDOFF_START_PROMPT), `codex --full-auto resume --last ${quoted}`);
  assert.equal(interactiveCommand('gemini', false, [], HANDOFF_START_PROMPT), `gemini --prompt-interactive ${quoted}`);
  assert.equal(interactiveCommand('gemini', true, [], HANDOFF_START_PROMPT), `gemini --resume --prompt-interactive ${quoted}`);
});

test('resolveAgent: assigned agent wins, else the role default', () => {
  assert.equal(resolveAgent({ reviewer: 'claude' }, 'reviewer'), 'claude');
  assert.equal(resolveAgent({}, 'reviewer'), 'codex');   // default priority head
  assert.equal(resolveAgent({}, 'explainer'), 'gemini');
});

test('renderInvocation: shows the fixed command + a stdin preview of the prompt', () => {
  const r = renderInvocation(buildInvocation('codex', 'fix the bug'));
  assert.match(r, /codex exec/);
  assert.match(r, /fix the bug/);
  assert.match(renderInvocation(buildInvocation('claude', 'hi')), /claude -p.*hi/);
});
