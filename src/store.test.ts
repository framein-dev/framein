import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';

test('config: set/get round-trips JSON values', () => {
  const s = Store.open();
  s.setConfig('rules', 'be careful');
  assert.equal(s.getConfig('rules'), 'be careful');
  s.setConfig('obj', { a: 1 });
  assert.deepEqual(s.getConfig('obj'), { a: 1 });
  s.close();
});

test('roles: assign, read, and reassign', () => {
  const s = Store.open();
  s.setRole('implementer', 'claude');
  s.setRole('reviewer', 'codex');
  assert.equal(s.getRole('implementer'), 'claude');
  assert.deepEqual(s.getRoles(), { implementer: 'claude', reviewer: 'codex' });
  s.setRole('implementer', 'codex');
  assert.equal(s.getRole('implementer'), 'codex');
  s.close();
});

test('ADR is append-only: ids increment, no mutation API, rows immutable', () => {
  const s = Store.open();
  const a1 = s.appendAdr({ title: 'Use SQLite', decision: 'node:sqlite' });
  const a2 = s.appendAdr({ title: 'Use MCP', decision: 'local MCP server' });
  assert.equal(a1.id, 1);
  assert.equal(a2.id, 2);
  assert.equal(s.listAdrs().length, 2);
  // append-only by design: these methods must not exist
  assert.equal((s as unknown as Record<string, unknown>).updateAdr, undefined);
  assert.equal((s as unknown as Record<string, unknown>).deleteAdr, undefined);
  assert.equal(s.getAdr(1)?.title, 'Use SQLite');
  s.close();
});

test('ADR supersede: append-only correction (no row mutation)', () => {
  const s = Store.open();
  const a1 = s.appendAdr({ title: 'Use global write lock', decision: 'one writer' });
  const a2 = s.supersedeAdr(a1.id, { title: 'Use scope write lock', decision: 'per-scope', context: 'parallelism' });
  // new ADR references the one it replaces
  assert.equal(a2.supersedes, a1.id);
  assert.equal(a2.id, a1.id + 1);
  // derived state: a1 is superseded, a2 is not
  assert.equal(s.isSuperseded(a1.id), true);
  assert.equal(s.isSuperseded(a2.id), false);
  // append-only honored: the old row's content is untouched, and no mutation API exists
  assert.equal(s.getAdr(a1.id)?.title, 'Use global write lock');
  assert.equal((s as unknown as Record<string, unknown>).updateAdr, undefined);
  assert.equal((s as unknown as Record<string, unknown>).deleteAdr, undefined);
  // both rows persist
  assert.equal(s.listAdrs().length, 2);
  // superseding a non-existent ADR is an error
  assert.throws(() => s.supersedeAdr(999, { title: 'x', decision: 'x' }), /ADR-999/);
  s.close();
});

test('ADR supersede guards: no invalid refs, no double-supersede (codex)', () => {
  const s = Store.open();
  const a1 = s.appendAdr({ title: 'A', decision: 'A' });
  // appendAdr cannot reference a non-existent or self id
  assert.throws(() => s.appendAdr({ title: 'bad', decision: 'bad', supersedes: 999 }), /ADR-999/);
  assert.throws(() => s.appendAdr({ title: 'self', decision: 'self', supersedes: a1.id + 1 }), /not found/);
  // first supersede ok
  s.supersedeAdr(a1.id, { title: 'B', decision: 'B' });
  // superseding the already-superseded a1 again is rejected (force a chain off the head)
  assert.throws(() => s.supersedeAdr(a1.id, { title: 'C', decision: 'C' }), /already superseded/);
  s.close();
});

test('memory: scopes are isolated; delete works', () => {
  const s = Store.open();
  s.setMemory('project', 'k', 1);
  s.setMemory('agent:claude', 'k', 2);
  assert.equal(s.getMemory('project', 'k'), 1);
  assert.equal(s.getMemory('agent:claude', 'k'), 2);
  assert.deepEqual(s.listMemory('project'), { k: 1 });
  s.deleteMemory('project', 'k');
  assert.equal(s.getMemory('project', 'k'), undefined);
  s.close();
});

test('write lock: single holder, reentrant for same holder', () => {
  const s = Store.open();
  assert.equal(s.getLockHolder(), null);
  assert.equal(s.acquireLock('claude'), true);
  assert.equal(s.getLockHolder(), 'claude');
  assert.equal(s.acquireLock('codex'), false); // blocked
  assert.equal(s.acquireLock('claude'), true);  // reentrant
  assert.equal(s.releaseLock('codex'), false);   // not the holder
  assert.equal(s.releaseLock('claude'), true);
  assert.equal(s.getLockHolder(), null);
  s.close();
});

test('withWriteLock runs and releases; throws when held by another', () => {
  const s = Store.open();
  assert.equal(s.withWriteLock('claude', () => 42), 42);
  assert.equal(s.getLockHolder(), null);
  s.acquireLock('codex');
  assert.throws(() => s.withWriteLock('claude', () => 1), /write lock held/);
  s.close();
});

test('write lock: scopes are independent; TTL lets a stale lock be taken over', () => {
  const s = Store.open();
  // different scopes never contend
  assert.equal(s.acquireLock('claude', { scope: 'a' }), true);
  assert.equal(s.acquireLock('codex', { scope: 'b' }), true);
  assert.equal(s.acquireLock('codex', { scope: 'a' }), false); // 'a' held by claude
  // an expired lock (ttl 0) reads as free and can be taken over by another holder
  assert.equal(s.acquireLock('claude', { scope: 'c', ttlMs: 0 }), true);
  assert.equal(s.getLockHolder('c'), null);
  assert.equal(s.acquireLock('codex', { scope: 'c', ttlMs: 60_000 }), true);
  assert.equal(s.getLockHolder('c'), 'codex');
  // forceUnlock clears any holder (backs `frame unlock`)
  s.forceUnlock('a');
  assert.equal(s.getLockHolder('a'), null);
  s.close();
});

test('snapshot export/import round-trips config, roles, ADRs (ids+supersedes), memory', () => {
  const s = Store.open();
  s.setConfig('rules', 'r');
  s.setConfig('obj', { a: 1 });
  s.setRole('implementer', 'claude');
  const a1 = s.appendAdr({ title: 'A', decision: 'A' });
  s.supersedeAdr(a1.id, { title: 'B', decision: 'B', context: 'why' });
  s.setMemory('project', 'k', { x: 1 });
  s.setMemory('agent:claude', 'note', 'hello');

  const json = JSON.stringify(s.exportSnapshot());
  const s2 = Store.open();
  s2.importSnapshot(JSON.parse(json));

  assert.deepEqual(s2.getAllConfig(), { rules: 'r', obj: { a: 1 } });
  assert.deepEqual(s2.getRoles(), { implementer: 'claude' });
  assert.equal(s2.listAdrs().length, 2);
  assert.equal(s2.getAdr(2)?.supersedes, 1);
  assert.equal(s2.isSuperseded(1), true);
  assert.equal(s2.getAdr(2)?.context, 'why');
  assert.deepEqual(s2.getMemory('project', 'k'), { x: 1 });
  assert.equal(s2.getMemory('agent:claude', 'note'), 'hello');

  // a snapshot from a different schema version is rejected (migration boundary)
  assert.throws(() => s2.importSnapshot({ ...JSON.parse(json), schemaVersion: 99 }), /schemaVersion/);

  // after import the AUTOINCREMENT counter follows the imported max, not a stale one (codex P2)
  const next = s2.appendAdr({ title: 'C', decision: 'C' });
  assert.equal(next.id, 3);
  s.close();
  s2.close();
});

test('unsafe keys (__proto__ etc.) are rejected at write time (codex P2)', () => {
  const s = Store.open();
  assert.throws(() => s.setMemory('project', '__proto__', { polluted: true }), /unsafe key/);
  assert.throws(() => s.setMemory('__proto__', 'k', 1), /unsafe key/);
  assert.throws(() => s.setConfig('constructor', 1), /unsafe key/);
  // a normal write/read is unaffected and no prototype is polluted
  s.setMemory('project', 'ok', 1);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  s.close();
});

test('withWriteLock rejects a non-positive ttl (would expire mid-section) (codex P2)', () => {
  const s = Store.open();
  assert.throws(() => s.withWriteLock('a', () => 1, { ttlMs: 0 }), /positive ttl/);
  s.close();
});

test('write lock is atomic across two connections to the same db file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'framein-lock-'));
  try {
    const dbPath = join(dir, 'store.db');
    const s1 = Store.open(dbPath);
    const s2 = Store.open(dbPath);
    assert.equal(s1.acquireLock('a'), true);
    assert.equal(s2.acquireLock('b'), false); // s2 sees s1's committed lock
    assert.equal(s2.acquireLock('a'), true);   // reentrant by the same holder name
    assert.equal(s1.releaseLock('a'), true);
    assert.equal(s2.acquireLock('b'), true);   // now free
    s1.close();
    s2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
