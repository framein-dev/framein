import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapManaged, upsertManagedBlock, extractManagedBlock, MANAGED_BEGIN, MANAGED_END } from './managedBlock.js';
const CORE = '## Project Rules\nbe careful';
const CORE2 = '## Project Rules\nTDD always';
test('fresh file: null existing -> title heading + managed block', () => {
    const out = upsertManagedBlock(null, 'CLAUDE.md', wrapManaged(CORE));
    assert.match(out, /^# CLAUDE\.md\n/);
    assert.ok(out.includes(MANAGED_BEGIN) && out.includes(MANAGED_END));
    assert.ok(out.includes(CORE));
});
test('existing user content WITHOUT markers is preserved (append, never clobber)', () => {
    const user = '# My own CLAUDE.md\n\n## House rules\n- ship small\n';
    const out = upsertManagedBlock(user, 'CLAUDE.md', wrapManaged(CORE));
    assert.ok(out.startsWith(user.trimEnd()), 'user text kept at top');
    assert.ok(out.includes('## House rules'));
    assert.ok(out.includes(CORE), 'managed block appended');
});
test('re-projection replaces only the managed region; outside text untouched', () => {
    const before = '# Mine\n\nintro paragraph\n';
    const after = '\n\n## Footer\nmy footer\n';
    const v1 = before + wrapManaged(CORE) + after;
    const v2 = upsertManagedBlock(v1, 'CLAUDE.md', wrapManaged(CORE2));
    // outside text byte-preserved
    assert.ok(v2.startsWith(before));
    assert.ok(v2.endsWith(after));
    // managed content swapped
    assert.ok(v2.includes('TDD always'));
    assert.ok(!v2.includes('be careful'));
    // exactly one managed region
    assert.equal(v2.indexOf(MANAGED_BEGIN), v2.lastIndexOf(MANAGED_BEGIN));
});
test('idempotent: upserting the same core twice yields identical output', () => {
    const once = upsertManagedBlock(null, 'CLAUDE.md', wrapManaged(CORE));
    const twice = upsertManagedBlock(once, 'CLAUDE.md', wrapManaged(CORE));
    assert.equal(twice, once);
});
test('the managed block is identical regardless of the file title (sync guarantee)', () => {
    const c = upsertManagedBlock(null, 'CLAUDE.md', wrapManaged(CORE));
    const a = upsertManagedBlock(null, 'AGENTS.md', wrapManaged(CORE));
    assert.notEqual(c, a); // titles differ
    assert.equal(extractManagedBlock(c), extractManagedBlock(a)); // managed region identical
});
function countBlocks(s) {
    return (s.split(MANAGED_BEGIN).length - 1);
}
test('codex P1: dangling begin marker does not eat user content; stable after cleanup', () => {
    const existing = `# X\n${MANAGED_BEGIN}\nuser notes\n`; // begin with no end
    const once = upsertManagedBlock(existing, 'CLAUDE.md', wrapManaged(CORE));
    assert.ok(once.includes('user notes'), 'user content preserved');
    assert.equal(countBlocks(once), 1, 'exactly one managed block');
    const twice = upsertManagedBlock(once, 'CLAUDE.md', wrapManaged(CORE));
    assert.equal(twice, once, 'idempotent once cleaned');
});
test('codex P1: reversed markers do not accumulate duplicate blocks', () => {
    const reversed = `${MANAGED_END}\ntext\n${MANAGED_BEGIN}\n`;
    const r1 = upsertManagedBlock(reversed, 'CLAUDE.md', wrapManaged(CORE));
    const r2 = upsertManagedBlock(r1, 'CLAUDE.md', wrapManaged(CORE));
    assert.equal(countBlocks(r1), 1);
    assert.equal(countBlocks(r2), 1);
    assert.ok(r1.includes('text'));
});
test('codex P2: duplicate managed blocks collapse to one', () => {
    const dup = `${wrapManaged('old1')}\nuser\n${wrapManaged('old2')}\n`;
    const out = upsertManagedBlock(dup, 'CLAUDE.md', wrapManaged(CORE));
    assert.equal(countBlocks(out), 1);
    assert.ok(out.includes('user'), 'non-managed text kept');
    assert.ok(!out.includes('old1') && !out.includes('old2'), 'stale managed content gone');
});
test('codex P1: a marker string inside the core data cannot break the block (defanged)', () => {
    const evilCore = `## Rules\n${MANAGED_END}\nmore`; // END marker on its own line in core
    const once = upsertManagedBlock(null, 'CLAUDE.md', wrapManaged(evilCore));
    const twice = upsertManagedBlock(once, 'CLAUDE.md', wrapManaged(evilCore));
    assert.equal(countBlocks(once), 1);
    assert.equal(twice, once, 'idempotent despite embedded marker text');
});
