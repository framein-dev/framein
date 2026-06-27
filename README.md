<p align="center">
  <img src="docs/assets/framein-readme-header.svg" alt="Framein" width="760">
</p>

<p align="center">
  <strong>One local work frame beneath the coding agents you already use.</strong>
</p>

<p align="center">
  Start with one agent. Challenge with another. Switch when needed. Ship with evidence.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/framein"><img src="https://img.shields.io/npm/v/framein" alt="npm version"></a>
  <img src="https://img.shields.io/badge/tests-249%20passing-brightgreen" alt="249 tests passing">
  <img src="https://img.shields.io/badge/runtime-zero%20deps-blue" alt="zero runtime dependencies">
  <img src="https://img.shields.io/badge/node-%3E%3D22.5-339933" alt="Node 22.5+">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="MIT license">
</p>

<p align="center">
  <a href="https://www.framein.dev">Website</a> |
  <a href="https://www.framein.dev/why">Developer note</a> |
  <a href="docs/MANUAL.md">Manual</a> |
  <a href="docs/INSTALL.md">Install guide</a> |
  <a href="docs/FAQ.md">FAQ</a> |
  <a href="SECURITY.md">Security</a>
</p>

Framein is a local work-state layer beneath the coding agents and harnesses you already use. Keep
using Claude Code, Codex, Gemini, Pi, OpenCode, slash-command frameworks, skill packs, role-based
workflows, or your own setup. Framein keeps the work underneath them stable: a task contract,
decision trail, risk state, validation results, and a compact capsule the next model can read.

```text
start in Claude -> challenge with Codex -> switch when needed -> validate before ship
```

Status: **public pre-release** (`v0.0.5`). Runtime dependencies: **zero**. Required Node:
**22.5.0+**.

Links:
- English: [Website](https://www.framein.dev) · [Developer note](https://www.framein.dev/why) · [Manual](docs/MANUAL.md) · [Install guide](docs/INSTALL.md) · [FAQ](docs/FAQ.md) · [Security](SECURITY.md)
- Korean: [웹사이트](https://www.framein.dev/ko) · [개발자 노트](https://www.framein.dev/ko/why) · [매뉴얼](docs/MANUAL.ko.md) · [설치 가이드](docs/INSTALL.ko.md)

## Why Framein?

Good PRDs, plans, ADRs, and skill packs help any model do better work. That is useful, and Framein is
designed to coexist with it.

The pain Framein targets starts when the work has to survive beyond one model or one clean session:

- Your lead model gets stuck and repeats the same approach.
- You want a different model to challenge the plan, diff, or risk.
- You need to switch lead model because of quota, model fit, or a dead end.
- The agent says the task is done before build and tests ran.
- The next session gets a chat summary instead of the actual contract, validation state, failed attempts, and decisions.

Framein does not replace the coding agent or pretend to be a full multi-agent cockpit. It keeps one
local work frame under the agents you already use.

## Quick Start

npm is the supported cross-platform install path today:

```bash
npm install -g framein
framein --version
```

Standalone executables are planned as an additional convenience path, mainly for users who do not
want to install Node/npm or who want to avoid Windows npm shim and PowerShell execution-policy
friction. They are not required to use Framein today. See
[Install notes](docs/INSTALL.md#6-standalone-executables).

If you want to test a local checkout instead:

```bash
git clone https://github.com/framein-dev/framein.git
cd framein
npm install
npm run build
npm install -g .
```

Initialize a project:

```bash
cd your-project
framein init
framein integrations install all --write
```

Run the work loop:

```bash
framein start "add Google OAuth, keep email login"
framein verify

# When another model should review or continue:
framein challenge "review the OAuth callback plan" --run
framein capsule codex

framein ship
```

Use `challenge` when another model should review a claim or plan. In a live run, the reviewer returns
a structured verdict, the lead gets one bounded response, and Framein prints a decision brief for the
user to accept or reject. Use `capsule <agent>` when a different model should continue from the same
local facts. After the current CLI exits, Framein launches the next agent with a short handoff prompt;
the new agent still pulls facts with `framein capsule`. `verify` is a rehearsal; `ship` is the
enforced gate and exits non-zero when hard validation fails.

## What You See

```text
$ framein start "add Google OAuth, keep email login"
task contract
  goal      add Google OAuth, keep email login
  preserve  existing email login

$ framein challenge "OAuth callback stores state in session" --run
reviewer  codex
verdict   challenge
required  add nonce/state validation
lead      accepts required change
next      framein decide accept "add nonce/state validation"

$ framein capsule gemini
next lead prepared from facts:
contract · diff · tests · decisions
exit the current agent; gemini opens and pulls the capsule first

$ framein ship
build ok · tests passed
risk high: auth/ touched
status ready with human gate
```

The important part is not the text UI. It is that every command writes to the same local work frame,
so terminal commands, native agent wrappers, MCP tools, and the next model all read the same facts.

## Core Commands

| Need | Command | What it does |
|---|---|---|
| Define done | `framein start "<goal>"` | Creates a Task Contract: goal, acceptance, protected areas, non-goals |
| Edit the contract | `framein task show` / `framein task amend ...` | Reviews or updates the definition of done |
| Get second opinion | `framein challenge "<proposal>" --run` | Asks a different reviewer role for a structured verdict, one lead response, and a decision brief |
| Switch model/session | `framein capsule [agent]` | Prepares the next lead from contract, diff, validation, ADRs, and ledger |
| Run validation | `framein verify` | Runs configured build/test checks and records the result |
| Check risk | `framein risk` | Flags sensitive blast radius from changed files |
| Decide ship readiness | `framein ship` | Enforced validation and risk gate for commit/deploy readiness |
| Recover from loops | `framein rescue` | Detects repeated failures or thrash and offers options |
| Save a green point | `framein checkpoint <label>` | Records the current commit as last known good |

Full reference: [`docs/MANUAL.md`](docs/MANUAL.md).

## Native Agent Surface

Framein installs logic-less wrappers into the tools agents already understand:

| Host | Surface | Example |
|---|---|---|
| Claude / Gemini | slash commands | `/fr:verify`, `/fr:ship`, `/fr:risk` |
| Codex | project skills | `$fr-verify`, `$fr-ship`, `$fr-capsule` |
| Terminal / CI | CLI + JSON | `framein ship --json` |
| MCP-capable clients | local stdio MCP server | `framein mcp serve` |

The generated agent commands expose the same agent-facing verbs across hosts:

| Intent | Claude / Gemini | Codex skill |
|---|---|---|
| Start or reset the task contract | `/fr:start` | `$fr-start` |
| Run build/test validation | `/fr:verify` | `$fr-verify` |
| Check commit/deploy readiness | `/fr:ship` | `$fr-ship` |
| Detect a repair loop | `/fr:rescue` | `$fr-rescue` |
| Read current Framein state | `/fr:status` | `$fr-status` |
| Ask an independent model to review | `/fr:challenge` | `$fr-challenge` |
| Check changed-file risk | `/fr:risk` | `$fr-risk` |
| Show or amend the task contract | `/fr:task` | `$fr-task` |
| Prepare a model switch | `/fr:capsule` | `$fr-capsule` |
| Resolve a reviewer debate | `/fr:decide` | `$fr-decide` |

The wrappers do not contain product logic. They call the same local `framein` engine, so a command
invoked from an agent, a terminal, or CI reads and writes the same contract, validation results, risk, and ledger.
Agent-native `challenge` wrappers add `--run --by <host>` internally, so users call `/fr:challenge`
or `$fr-challenge` without manually typing those flags. Codex repo skills are generated under
`.agents/skills/fr-<verb>/SKILL.md`.

Windows note: generated wrappers use `framein.cmd` to avoid PowerShell execution-policy failures from
the npm `.ps1` shim inside agent shells.

## How It Works

```text
framein.store.json (git-friendly snapshot) <-> .frame/store.db (local cache)
        |
        v
Task Contract · ADRs · memory · write locks · ledger · validation results
        |
        v
managed block projection
        |
        +--> CLAUDE.md
        +--> AGENTS.md
        +--> GEMINI.md
```

Important behavior:

- `framein init` creates `.frame/store.db`, projects managed blocks, and ensures `.frame/` is ignored.
- `framein export` writes `framein.store.json` when you want a git-canonical text snapshot.
- Managed blocks are byte-identical across native context files.
- User-authored text outside managed markers is preserved.
- ADRs are append-only; corrections use superseding records.
- Write locks are atomic conditional upserts with TTL.
- Runtime dependencies stay at zero.

## Trust Boundary

Framein is local-first:

- No provider credentials are collected.
- No remote credential relay or subscription pooling.
- Claude, Codex, and Gemini keep their official CLI authentication.
- Existing MCP servers and skills are detected/recommended, not proxied or cross-executed.
- No terminal I/O (TTY) screen-scraping.
- `framein trust` previews permission-bypass flags; it does not silently enable them.
- Destructive recovery uses explicit flags, for example `framein rewind --force`.
- Deployment remains a human gate.

## Current Status

Solid in the current pre-release:

- Store, import/export, managed-block projection
- Task Contract, Verification Gate, Risk Gate, Rescue, Capsule, Challenge/Decide
- Logic-less `/fr:*` and `$fr-*` wrappers
- MCP stdio server and registration helpers
- Headless delegation to real CLIs where available
- Windows author environment live-verified
- `249` automated tests passing as of 2026-06-28

Still being validated:

- signed standalone executable release hardening for Windows and macOS
- multi-developer workflows
- interactive lobby paths such as `/lead`, `/go`, and inline command palette

## Development

```bash
npm install
npm run build
npm test
```

Tests compile first and run from `dist/` through Node's built-in test runner.

Useful focused commands:

```bash
node --no-warnings --test dist/store.test.js
node --no-warnings --test --test-name-pattern="supersede" dist/**/*.test.js
node --no-warnings dist/cli.js <cmd>
```

Node **22.5.0+** is required because Framein uses built-in `node:sqlite`.

## Documentation

- Manual: [`docs/MANUAL.md`](docs/MANUAL.md)
- FAQ: [`docs/FAQ.md`](docs/FAQ.md)
- Korean manual backup: [`docs/MANUAL.ko.md`](docs/MANUAL.ko.md)
- Install troubleshooting: [`docs/INSTALL.md`](docs/INSTALL.md) / [`docs/INSTALL.ko.md`](docs/INSTALL.ko.md)
- Website: [framein.dev](https://www.framein.dev)

## License

MIT. Framein by [Frameout](https://frameout.co.kr).

Please keep the copyright and license notice when redistributing substantial
portions of Framein. See [`NOTICE`](NOTICE) for suggested attribution and brand
usage notes.
