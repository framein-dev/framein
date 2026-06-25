import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';
import { writeNativeFiles } from './fileWriter.js';
import { selectAgent } from './roles.js';
test('end-to-end: one store drives synced files, compliant routing, durability', () => {
    const dir = mkdtempSync(join(tmpdir(), 'framein-'));
    const dbPath = join(dir, 'store.db');
    const store = Store.open(dbPath);
    store.setConfig('rules', 'be careful; TDD');
    store.setRole('implementer', 'claude');
    store.setRole('reviewer', 'codex');
    store.setRole('explainer', 'gemini');
    // the implementer records a decision under the write lock — no handoff file
    store.withWriteLock('claude', () => {
        store.appendAdr({ title: 'Use node:sqlite', decision: 'zero-dependency store', authorAgent: 'claude' });
    });
    const written = writeNativeFiles(dir, store.getState());
    assert.equal(written.length, 3);
    // reviewer (codex) and explainer (gemini) see the SAME decision the implementer wrote
    const claudeMd = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    const geminiMd = readFileSync(join(dir, 'GEMINI.md'), 'utf8');
    assert.ok(claudeMd.includes('Use node:sqlite'));
    assert.ok(geminiMd.includes('Use node:sqlite'));
    // routing stays compliant: gemini is the explainer but consumer-login is forbidden -> fallback
    const pick = selectAgent(['gemini', 'claude'], { role: 'explainer', authMode: { gemini: 'consumer-login' } });
    assert.equal(pick, 'claude');
    // durability: reopening from disk preserves the source of truth
    store.close();
    const reopened = Store.open(dbPath);
    assert.equal(reopened.listAdrs().length, 1);
    assert.equal(reopened.getRole('implementer'), 'claude');
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
});
