// Thin typed facade over the experimental built-in node:sqlite.
// Declaring our own minimal surface decouples us from @types/node version drift.
// @ts-ignore - node:sqlite is experimental; type defs may be absent.
import { DatabaseSync } from 'node:sqlite';
export function openDb(path) {
    return new DatabaseSync(path);
}
