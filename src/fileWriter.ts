import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectState } from './types.js';
import { renderManagedBlock } from './projector.js';
import { upsertManagedBlock } from './managedBlock.js';

const NATIVE_FILES: ReadonlyArray<readonly [string, string]> = [
  ['CLAUDE.md', 'CLAUDE.md'],
  ['AGENTS.md', 'AGENTS.md'],
  ['GEMINI.md', 'GEMINI.md'],
];

export interface FilePlan {
  path: string;
  content: string;
  existed: boolean;
  changed: boolean;
}

/** Compute what each native file WOULD become (managed-block upsert), without writing. */
export function planNativeFiles(dir: string, state: ProjectState): FilePlan[] {
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
export function writeNativeFiles(dir: string, state: ProjectState): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const p of planNativeFiles(dir, state)) {
    if (p.changed) { writeFileSync(p.path, p.content, 'utf8'); written.push(p.path); }
  }
  return written;
}
