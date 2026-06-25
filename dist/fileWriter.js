import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderManagedBlock } from './projector.js';
import { upsertManagedBlock } from './managedBlock.js';
const NATIVE_FILES = [
    ['CLAUDE.md', 'CLAUDE.md'],
    ['AGENTS.md', 'AGENTS.md'],
    ['GEMINI.md', 'GEMINI.md'],
];
/** Compute what each native file WOULD become (managed-block upsert), without writing. */
export function planNativeFiles(dir, state) {
    const managed = renderManagedBlock(state);
    return NATIVE_FILES.map(([name, title]) => {
        const path = join(dir, name);
        const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
        const content = upsertManagedBlock(existing, title, managed);
        return { path, content, existed: existing != null, changed: existing !== content };
    });
}
/**
 * Upsert the managed block into the three native files, preserving any user content
 * outside the framein markers. Only files whose content actually changes are written
 * (no mtime churn / spurious file-watcher events). Returns the written paths.
 */
export function writeNativeFiles(dir, state) {
    mkdirSync(dir, { recursive: true });
    const written = [];
    for (const p of planNativeFiles(dir, state)) {
        if (p.changed) {
            writeFileSync(p.path, p.content, 'utf8');
            written.push(p.path);
        }
    }
    return written;
}
