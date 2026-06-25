#!/usr/bin/env node
// framein installed-bin entry. The node:sqlite ExperimentalWarning (and any other Node warning) is
// printed at module-LOAD time, before any in-process filter can run — the only reliable suppression is
// Node's own `--no-warnings`. So this tiny entry, which imports NOTHING that loads node:sqlite, re-execs
// the CLI once under `--no-warnings`. stdio:'inherit' keeps stdin/stdout/stderr byte-exact (MCP serve
// NDJSON, `ask --interactive` / shell `/go` hand-overs all pass straight through) and the child's exit
// code is propagated. FRAMEIN_NOWARN guards against a re-exec loop; running `node dist/cli.js` directly
// (dev/tests) bypasses this entirely.
//
// EXCEPTION: `mcp serve` is machine-facing — MCP clients read NDJSON on stdout and ignore stderr, so the
// SQLite warning is harmless there. We skip the re-exec for it to avoid adding any startup latency to the
// server an agent just spawned (a slow handshake can make a client cancel the first tool call).
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const isMcpServe = argv[0] === 'mcp' && argv[1] === 'serve';

if (process.env.FRAMEIN_NOWARN === undefined && !isMcpServe && typeof process.argv[1] === 'string') {
  const res = spawnSync(process.execPath, ['--no-warnings', process.argv[1], ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, FRAMEIN_NOWARN: '1' },
  });
  if (res.error) { console.error(res.error.message); process.exit(1); }
  process.exit(res.status ?? 1);
}

await import('./cli.js');
