import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';
import { writeNativeFiles, planNativeFiles } from './fileWriter.js';
test('writeNativeFiles preserves pre-existing user content and updates the managed block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'framein-fw-'));
    try {
        const userClaude = '# My CLAUDE.md\n\n## Personal notes\n- keep these\n';
        writeFileSync(join(dir, 'CLAUDE.md'), userClaude, 'utf8');
        const s = Store.open(join(dir, 'store.db'));
        s.setConfig('rules', 'rule one');
        writeNativeFiles(dir, s.getState());
        const after = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
        assert.ok(after.includes('## Personal notes'), 'user content preserved');
        assert.ok(after.includes('- keep these'));
        assert.ok(after.includes('rule one'), 'managed block present');
        // changing the store and re-syncing keeps user content and swaps managed content
        s.setConfig('rules', 'rule two');
        const plan = planNativeFiles(dir, s.getState()).find((p) => p.path.endsWith('CLAUDE.md'));
        assert.ok(plan && plan.changed, 'plan reports the managed change');
        writeNativeFiles(dir, s.getState());
        const after2 = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
        assert.ok(after2.includes('## Personal notes'));
        assert.ok(after2.includes('rule two'));
        assert.ok(!after2.includes('rule one'));
        // a no-op sync reports unchanged
        const plan2 = planNativeFiles(dir, s.getState()).find((p) => p.path.endsWith('CLAUDE.md'));
        assert.equal(plan2.changed, false);
        s.close();
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
