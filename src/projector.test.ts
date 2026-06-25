import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from './store.js';
import { projectAll, buildCoreBlock } from './projector.js';

const NAMES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'] as const;

test('all three native files embed an identical canonical core block', () => {
  const s = Store.open();
  s.setConfig('rules', 'TDD always');
  s.setRole('implementer', 'claude');
  s.appendAdr({ title: 'Use MCP', decision: 'local MCP server' });
  const state = s.getState();
  const core = buildCoreBlock(state);
  const files = projectAll(state);
  for (const name of NAMES) assert.ok(files[name].includes(core), `${name} missing canonical core`);
  s.close();
});

test('the task contract is projected into the core block as standing intent (F-LOOP-1)', () => {
  const s = Store.open();
  s.setTaskContract({ goal: 'add Google login', mustPreserve: ['email login'], acceptance: ['tests pass'], protected: [], nonGoals: ['UI redesign'] });
  const core = buildCoreBlock(s.getState());
  assert.match(core, /## Task Contract/);
  assert.match(core, /add Google login/);
  assert.match(core, /tests pass/);
  // absent contract => placeholder, never a crash
  assert.match(buildCoreBlock(Store.open().getState()), /No active task contract/);
  s.close();
});

test('the core block tells the agent how to drive framein (Phase 1, ADR-0012)', () => {
  const core = buildCoreBlock(Store.open().getState());
  assert.match(core, /Working with framein/);   // an operating-guide section the agent reads
  assert.match(core, /framein start/);           // capture the contract at task start
  assert.match(core, /framein verify/);          // validation gate before "done"
  assert.match(core, /Validation Gate/);
  assert.match(core, /framein\.cmd/);            // Windows PowerShell fallback for agent shells
  assert.match(core, /definition of done/i);     // honor the contract as the done-criteria
});

test('the guide tells the agent to pull the capsule at session start (continuity follows a switch)', () => {
  const core = buildCoreBlock(Store.open().getState());
  assert.match(core, /framein capsule/);                       // the new model pulls the state snapshot...
  assert.match(core, /left off|resume|session start|pick(ing)? up/i); // ...on entry / after a model switch
});

test('a store change propagates to all three files in lockstep (handoff-free)', () => {
  const s = Store.open();
  s.setRole('implementer', 'claude');
  let files = projectAll(s.getState());
  for (const name of NAMES) assert.ok(!files[name].includes('ADR-1'));

  // an agent records a decision — no manual handoff document is produced
  s.appendAdr({ title: 'Adopt worktree isolation', decision: 'isolate each task' });

  files = projectAll(s.getState());
  for (const name of NAMES) {
    assert.ok(files[name].includes('ADR-1'), `${name} did not receive the decision`);
    assert.ok(files[name].includes('Adopt worktree isolation'));
  }
  s.close();
});
