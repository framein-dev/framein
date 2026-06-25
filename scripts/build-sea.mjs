#!/usr/bin/env node
// Build a Single Executable Application (SEA): framein.exe (Windows) / framein (macOS/Linux).
//
// WHY: on Windows, npm's `framein.ps1` shim is blocked by the default PowerShell execution policy — even
// from Git Bash, because the agent that runs `framein` picks its own shell (often PowerShell). A real
// .exe removes the shim entirely, so `framein` just runs with no policy change and no user action. See
// ADR-0014 documents the executable distribution rationale.
//
// INVARIANTS: runtime deps stay ZERO — esbuild + postject are BUILD-only (devDependencies). Node 22.15+
// runs node:sqlite WITHOUT --experimental-sqlite (it only warns), so the SEA needs no flag or re-exec;
// the esbuild banner silences that single warning in-process. Artifacts go to build/sea/ (gitignored).
//
// SCOPE: this is a PoC. The exe is UNSIGNED → Windows SmartScreen / macOS Gatekeeper will warn. Code
// signing (Authenticode / Apple notarization) is required before real distribution.

import { build } from 'esbuild';
import { inject } from 'postject';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'build/sea';
const isWin = process.platform === 'win32';
const exeName = isWin ? 'framein.exe' : 'framein';
const exePath = join(OUT, exeName);
const bundlePath = join(OUT, 'framein.cjs');
const cfgPath = join(OUT, 'sea-config.json');
const blobPath = join(OUT, 'framein.blob');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'; // Node's standard SEA sentinel fuse

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

// Banner runs before any bundled module. Under SEA, process.argv is [exe, exe, ...args] — the exe path
// appears twice, which already matches the [node, script, ...args] shape cli.ts's argv.slice(2) expects,
// so NO argv fixup is needed. We only: (1) bake the version (no package.json sits next to the exe), and
// (2) swallow the single node:sqlite ExperimentalWarning before any module loads node:sqlite.
const banner = [
  `globalThis.__FRAMEIN_VERSION__=${JSON.stringify(version)};`,
  'const __e=process.emitWarning;process.emitWarning=function(w,...a){try{const s=typeof w==="string"?w:(w&&w.message)||"";if(/SQLite is an experimental feature/i.test(s))return;}catch(_){}return __e.call(process,w,...a);};',
].join('');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log(`1/4 bundling dist/cli.js → ${bundlePath} (esbuild · CJS)…`);
await build({
  entryPoints: ['dist/cli.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: bundlePath,
  banner: { js: banner },
  logLevel: 'warning',
});

console.log('2/4 generating the SEA blob…');
writeFileSync(cfgPath, JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true }, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', cfgPath], { stdio: 'inherit' });

const isMac = process.platform === 'darwin';

console.log(`3/4 copying the Node runtime → ${exeName}…`);
copyFileSync(process.execPath, exePath);
// macOS Mach-O: the copied node is signed; postject must inject into an UNSIGNED binary, so strip first.
if (isMac) { try { execFileSync('codesign', ['--remove-signature', exePath]); } catch (e) { console.warn('  (codesign --remove-signature skipped:', e.message + ')'); } }

console.log('4/4 injecting the blob (postject)…');
await inject(exePath, 'NODE_SEA_BLOB', readFileSync(blobPath), {
  sentinelFuse: FUSE,
  ...(isMac ? { machoSegmentName: 'NODE_SEA' } : {}),
});
// macOS: ad-hoc sign so the UNSIGNED PoC runs locally. CI replaces this with Developer ID + notarization.
if (isMac) { try { execFileSync('codesign', ['--sign', '-', exePath]); } catch (e) { console.warn('  (ad-hoc codesign skipped:', e.message + ')'); } }

const mb = (statSync(exePath).size / 1024 / 1024).toFixed(1);
console.log(`\n✓ built ${exePath}  (${mb} MB · framein ${version} · unsigned PoC)`);
