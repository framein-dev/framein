import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';

// Real multi-process test: K processes each do N lock-protected increments of a shared
// counter in one .frame/store.db. With a correct atomic lock the total is exactly K*N;
// a read-then-write race would lose updates and land below it.
test('write lock serializes increments across real processes (no lost updates)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framein-mp-'));
  try {
    const dbPath = join(dir, 'store.db');
    Store.open(dbPath).close(); // create schema up front

    const storeUrl = new URL('./store.js', import.meta.url).href;
    const worker = `
import { Store } from ${JSON.stringify(storeUrl)};
const [dbPath, nStr] = process.argv.slice(2);
const N = Number(nStr);
const s = Store.open(dbPath);
const holder = 'w' + process.pid;
const sab = new Int32Array(new SharedArrayBuffer(4));
for (let i = 0; i < N; i++) {
  for (;;) {
    try {
      s.withWriteLock(holder, () => {
        const c = s.getConfig('counter') || 0;
        s.setConfig('counter', c + 1);
      });
      break;
    } catch {
      Atomics.wait(sab, 0, 0, 1); // 1ms backoff on contention
    }
  }
}
s.close();
`;
    const workerPath = join(dir, 'worker.mjs');
    writeFileSync(workerPath, worker, 'utf8');

    const K = 4;
    const N = 20;
    await Promise.all(
      Array.from({ length: K }, () => new Promise<void>((resolve, reject) => {
        const cp = spawn(process.execPath, ['--no-warnings', workerPath, dbPath, String(N)], { stdio: 'ignore' });
        cp.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))));
        cp.on('error', reject);
      })),
    );

    const s = Store.open(dbPath);
    assert.equal(s.getConfig('counter'), K * N);
    s.close();
  } finally {
    // maxRetries: on Windows a just-exited child can briefly hold the dir (EPERM); retry the rm
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
