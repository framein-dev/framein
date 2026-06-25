// Thin typed facade over the experimental built-in node:sqlite.
// Declaring our own minimal surface decouples us from @types/node version drift.

// @ts-ignore - node:sqlite is experimental; type defs may be absent.
import { DatabaseSync } from 'node:sqlite';

export interface RunResult { changes: number; lastInsertRowid: number | bigint; }
export interface Stmt {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
export interface DB {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  close(): void;
}

export function openDb(path: string): DB {
  return new DatabaseSync(path) as unknown as DB;
}
