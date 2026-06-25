# Framein

**Keep one work frame across Claude, Codex, and Gemini.**

Start with one agent, challenge it with another, switch when needed, and close the work with
validation.

Framein is a local work-state layer for AI coding agents. Keep using Claude, Codex, Gemini,
slash-command frameworks, skill packs, role-based workflows, or your own agent setup. Framein keeps
the work underneath them stable: a task contract, decision trail, risk state, validation results, and
a compact capsule the next model can read.

```text
start in Claude -> challenge with Codex -> switch when needed -> validate before ship
```

Status: **pre-release** (`v0.0.4`). Runtime dependencies: **zero**. Required Node:
**22.5.0+**.

[Website](https://www.framein.dev) · [Manual](docs/MANUAL.md) · [Install notes](docs/INSTALL.md) · [Code signing policy](docs/CODE_SIGNING.md) · [Test scenarios](docs/TEST-SCENARIOS.md) · [Security](SECURITY.md)

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

Public npm is not live yet. Install the latest standalone binary from GitHub Releases:

```powershell
# Windows PowerShell
irm https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.ps1 | iex
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.sh | sh
```

Then verify:

```bash
framein --version
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

Use `challenge` when another model should review a claim or plan. Use `capsule <agent>` when a
different model should continue from the same local facts. `verify` is a rehearsal; `ship` is the
enforced gate and exits non-zero when hard validation fails.

## What You See

```text
$ framein start "add Google OAuth, keep email login"
task contract
  goal      add Google OAuth, keep email login
  preserve  existing email login

$ framein challenge "OAuth callback stores state in session" --run
reviewer  codex
verdict   change required
required  add nonce/state validation

$ framein capsule gemini
next lead prepared from facts:
contract · diff · tests · decisions

$ framein ship
build ok · tests 42/42
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
| Get second opinion | `framein challenge "<proposal>" --run` | Asks a different reviewer role for a bounded objection |
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
- `243` automated tests passing

Still being validated:

- macOS/Linux install and runtime paths
- signed executable release hardening for Windows and macOS
- SignPath Foundation OSS code-signing approval and automated Windows release signing
- multi-developer workflows
- interactive lobby paths such as `/lead`, `/go`, and inline command palette
- public npm release and signed executable distribution

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
- Korean manual backup: [`docs/MANUAL.ko.md`](docs/MANUAL.ko.md)
- Install troubleshooting: [`docs/INSTALL.md`](docs/INSTALL.md) / [`docs/INSTALL.ko.md`](docs/INSTALL.ko.md)
- Code signing policy: [`docs/CODE_SIGNING.md`](docs/CODE_SIGNING.md)
- Test scenarios: [`docs/TEST-SCENARIOS.md`](docs/TEST-SCENARIOS.md)
- ADRs: [`docs/adr/`](docs/adr/)
- Website: [framein.dev](https://www.framein.dev)

## License

MIT. Framein by [Frameout](https://frameout.co.kr).

Please keep the copyright and license notice when redistributing substantial
portions of Framein. See [`NOTICE`](NOTICE) for suggested attribution and brand
usage notes.
