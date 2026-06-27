# Framein User Manual

> **Binary:** `framein` with short aliases `fr` and `frame`. Inside agents, Framein appears as
> namespaced commands (`/fr:verify` for Claude/Gemini, `$fr-verify` for Codex skills) or as MCP
> tools. You do not need to learn a new prompt window. Automation-facing commands also support
> `--json` where the command has a stable structured output.

> **Default usage = agent-driven workflow.** `framein init` projects operating guidance
> into native context files. In normal use, the agent can create the task contract near the start of
> work, call another model for a bounded challenge, prepare a model switch when needed, and run
> validation before it calls the task done. Long-form `framein <verb>` commands are the fallback and
> scripting path. Contract changes remain visible through `git diff`, so control stays with the user.
> Running `framein start` with no arguments opens the guided contract flow.

> **Framein keeps one local work frame across Claude, Codex, Gemini, and AI coding agents.**
>
> It is not a multi-AI launcher and not a stateless prompt pack. Keep using native CLIs, slash-command
> frameworks, skill packs, role workflows, or your own agent setup. Framein adds the missing work
> frame underneath: a task contract, decision trail, bounded challenge loop, model-switch capsule,
> deterministic build/test validation, and blast-radius checks.

This is the default English manual. The Korean original is preserved at
[`docs/MANUAL.ko.md`](./MANUAL.ko.md).

This document is written so a first-time user can move from concept to a working loop:
concepts, install, quick start, product-loop verbs, detailed behavior, safety boundaries, current
status, troubleshooting, and developer notes. Example outputs are representative of real CLI output.

---

## Table of Contents

1. [The Problem Framein Solves](#1-the-problem-framein-solves)
2. [Design Philosophy](#2-design-philosophy)
3. [Mental Model: One Work Frame + Product Loop](#3-mental-model-one-work-frame--product-loop)
4. [Install and Prerequisites](#4-install-and-prerequisites)
5. [Quick Start: One Product Loop](#5-quick-start-one-product-loop)
6. [Core Product Verbs](#6-core-product-verbs)
7. [Feature Details](#7-feature-details)
8. [Real Agent Integration](#8-real-agent-integration)
9. [Engine Commands](#9-engine-commands)
10. [Safety: Trust, Blast Radius, and Boundaries](#10-safety-trust-blast-radius-and-boundaries)
11. [Generated Files and Folder Structure](#11-generated-files-and-folder-structure)
12. [Current Status](#12-current-status)
13. [FAQ](#13-faq)
14. [Troubleshooting](#14-troubleshooting)
15. [Developer Notes: Build, Test, and Structure](#15-developer-notes-build-test-and-structure)

---

## 1. The Problem Framein Solves

The real problem in AI-assisted coding is not that models cannot write code. They can write code
quickly and often well. Good PRDs, plans, ADRs, and skills help any model do better work. The
problem is keeping one task intact when the work moves across models, sessions, and validation gates:

1. **Intent drift:** the work slowly moves away from the original request. "Add Google login while
   keeping email login" turns into replacing the authentication stack.
2. **Stalled lead model:** one model repeats the same plan or failure mode and needs another view.
3. **Model switch reset:** quota, model fit, or a dead end forces a switch, and the next model needs
   the real task state, not a chat summary.
4. **Unverified done:** the agent reports success before build, tests, and acceptance criteria were
   checked.
5. **Repair loops:** the same test fails for the same reason while the agent keeps patching symptoms.
6. **Context fragmentation:** Claude reads `CLAUDE.md`, Codex reads `AGENTS.md`, and Gemini reads
   `GEMINI.md`. Updating one file lets the others drift.

Framein handles these gaps with one repo-local work frame: task contract, decision trail, challenge
loop, model-switch capsule, validation gate, and native agent surface. Existing agent frameworks
already handle skills, hooks, personas, and memory. Framein does not rebuild them. It focuses on what
a single agent CLI usually does not own: keeping the work frame stable while agents change, reviewers
object, risk rises, and validation closes the task.

`/fr:*` and `$fr-*` expose that layer directly inside the agent surface you already use.

> Honest switch wording: not "automatic model-team consensus", but **"one local work frame the next
> lead can read."** You do not have to restate the task from scratch; Framein prepares the next model
> from local facts.

---

## 2. Design Philosophy

These principles define the public behavior Framein tries to preserve.

| Principle | Meaning |
|---|---|
| **Control layer, not executor** | Framein does not drive or scrape the terminal. It observes through the shared store and ledger. |
| **In-place by default** | Keep typing into the native CLI. Other roles are called into the current workflow rather than forcing a new prompt surface. |
| **No relay** | Framein does not collect subscription credentials or route requests through a central account. Each CLI keeps its own official auth. |
| **Audit cadence** | Do not review every turn. Call another model at gates or anomaly points only. |
| **Fresh on read** | Sharing is pull-based. The promise is "latest facts are always readable", not automatic push. |
| **Append-only decisions** | Decisions are not updated or deleted. Corrections use `supersede`. |
| **Zero runtime dependencies** | Runtime code uses Node built-ins only, including `node:sqlite`. |
| **Reuse first** | Existing MCP servers and skills are detected, recommended, or registered. They are not proxied or reimplemented. |

---

## 3. Mental Model: One Work Frame + Product Loop

**1. Store, then projection.**

Rules, roles, ADRs, scoped memory, and the Task Contract live in one `.frame` store. From there,
Framein projects a byte-identical managed block into each native context file. User-authored text
outside the markers is preserved.

Data flows one way:

```text
.frame/store.db (local cache) <-> framein.store.json (git-canonical snapshot)
        |
        v
store -> projector.renderManagedBlock()
        |
        v
CLAUDE.md / AGENTS.md / GEMINI.md
(only the framein:begin ... framein:end managed block is rewritten)
```

**2. Product loop: start -> challenge -> switch -> validate.**

This is the main path:

```text
framein start
  Fix intent as a Task Contract.

Lead agent works normally.
  Framein records changes, checks, failures, and decisions in the ledger.

framein challenge
  Ask a different model for a bounded objection when another view is useful.
  The reviewer returns claims; the lead decides.

framein capsule <agent>
  Prepare a model switch from local facts.

framein rescue
  If the work gets stuck, detect the repair loop and offer options.
  No automatic destructive action.

framein verify / framein ship
  Close the work with build/test checks, risk gates, and human approval where needed.
```

**3. Roles are called in, not switched away.**

Framein is useful with a single agent because it reduces drift and synchronizes rules, ADRs, and
memory. When another role is needed, `framein ask` or the product-loop verbs call that role into the
same repo-local store and ledger.

---

## 4. Install and Prerequisites

### 4.1 Requirements

- **Node.js 22.5.0 or newer.** Framein uses the built-in experimental `node:sqlite` module.
  Check with `node --version`.
- **Zero runtime dependencies.** `npm install` installs development tooling only, such as
  `typescript` and `@types/node`.
- For real agent integration, install the relevant native CLIs: `claude`, `codex`, or `gemini`, plus
  each provider's normal credentials or API key.

### 4.2 Install

Install from npm:

```bash
npm install -g framein
framein --version
```

This npm path works on Windows, macOS, Linux, and WSL with Node.js 22.5+. Standalone executables are
planned as an additional convenience path that bundles Node with Framein, mainly to avoid separate
Node/npm setup and Windows npm shim friction. They are not required to use Framein today.

For local checkout testing:

```bash
git clone https://github.com/framein-dev/framein.git
cd framein
npm install
npm run build
npm install -g .
```

### 4.3 Build from source

```bash
npm install      # development tooling only
npm run build    # tsc -> dist/
npm test         # build, then run all tests from dist/
```

### 4.4 Running locally

```bash
node dist/cli.js <command>          # direct after build
npm run framein -- <command>        # npm script; arguments go after --
npm link && framein <command>       # global shim: framein, fr, and frame
```

This manual uses `framein <command>`. `fr <command>` and `frame <command>` call the same CLI.
If you have not linked or globally installed the package, read `framein` as `node dist/cli.js`.

---

## 5. Quick Start: One Product Loop

In a real project folder, preferably a git repository:

```bash
# 0) Initialize store, native context projection, and default roles.
framein init

# 1) Fix intent as a Task Contract.
framein start "add Google login while preserving existing email login"
framein task amend acceptance "existing users can still log in with email"
framein task amend nongoal "full UI redesign"
# The contract is projected into CLAUDE.md, AGENTS.md, and GEMINI.md.
# Every supported agent sees the same definition of done.

# 2) Mark a known-good point.
framein checkpoint baseline
# Checkpoint recorded: f7acccf (baseline). Return here with `framein rewind`.

# 3) When another model should review the plan or diff, ask for a bounded challenge.
framein challenge "review the OAuth callback plan" --run
# reviewer: codex
# verdict: change required
# required: add nonce/state validation

# 4) When a different model should continue, prepare a model switch from local facts.
framein capsule codex
# next lead prepared from contract, diff, validation, ADRs, and ledger

# 5) Validate readiness.
framein ship
# NOT READY
# Tests: 143 passed, 0 failed
# 1 acceptance criterion needs verification (reviewer/human)
# Safe to commit: yes
# Safe to deploy: requires human confirmation

# 6) If you get stuck, diagnose the loop without automatic destructive action.
framein rescue

# 7) If you need to stop, save a Task Capsule.
framein pause
# Later: framein resume
```

That loop is the product:

```text
fix intent with start
challenge with another model when useful
prepare a lead switch with capsule
close with verify/ship
```

---

## 6. Core Product Verbs

These are the verbs users should remember first. Engine and administrative commands are listed in
[section 9](#9-engine-commands).

| Verb | Value | Core behavior |
|---|---|---|
| `framein start <goal>` | Fix intent as a Task Contract | Alias of `task start`; add acceptance and non-goals with `framein task amend`. |
| `framein ask <role> [prompt]` | Call in another role | Supports `--show`, `--run`, `--interactive`, and `--trust`. |
| `framein challenge "<proposal>"` | Ask for bounded disagreement | A different model reviews the proposal; unresolved debate escalates after two rounds. |
| `framein capsule [agent]` | Prepare a model switch | Builds a compact view of contract, diff, validation, ADRs, and ledger for the next lead. |
| `framein verify` | Rehearse validation | Runs build/test checks and compares the result with the contract. |
| `framein rescue` | Detect and recover from repair loops | Suggests options. It does not automatically act. |
| `framein ship` | Enforce the final gate | Exits non-zero when hard validation fails. Reviewer/human acceptance items remain warnings and keep deploy as a human gate. |

---

## 7. Feature Details

### 7.1 Task Contract: What Counts as Done (`start`, `task`)

Memory shares what the project knows. The Task Contract shares what counts as done for the current
task.

```bash
framein start "<goal>"                       # same as framein task start
framein task show                            # print the full contract and missing fields
framein task amend <field> "<value>"         # field: goal|preserve|acceptance|protected|nongoal
```

- The contract is stored as structured task state in `.frame`. It is mutable and separate from ADRs.
- The managed block always projects it into `## Task Contract`, so Claude, Codex, and Gemini see the
  same criteria.
- MCP clients can also read it through `read_memory(scope:"task", key:"contract")`.
- Ideally the lead agent drafts the contract from the user's request and asks only about risky or
  ambiguous points.

### 7.2 Validation Gate: Done Means Checked (`verify`, `ship`)

Framein turns "done" from a natural-language claim into validation results.

```bash
framein verify     # run build/test checks, compare with acceptance criteria; rehearsal path
framein ship       # enforced gate: readiness, commit/deploy guidance, non-zero on failure
```

- Hard checks are **build** and **tests**. Both must pass for a ready state; failed hard checks make
  `ship` exit non-zero.
- Acceptance criteria and unresolved items are surfaced as warnings unless they are directly
  machine-checkable. Framein does not pretend a human or reviewer judgment happened; those warnings
  can still allow `Safe to commit: yes` while keeping deploy at human confirmation.
- `framein verify` runs the project's real `npm run build` and `npm test` when available, then parses
  the result.
- `framein ship` adds the Blast Radius result when changed files touch sensitive areas.

Older internal names may refer to this as the "Evidence Gate". Public-facing copy now uses
"Validation Gate" to make the developer intent clearer.

### 7.3 Rescue Mode: Stop Repair Loops (`rescue`, `checkpoint`, `rewind`)

Framein elevates anomaly detection into a user-facing recovery mode. It detects repeated edits,
repeated test failures, and no-progress loops.

```bash
framein checkpoint [label]   # record the current git commit as the last known green point
framein rescue               # show signals, last-green point, and options; no automatic action
framein rescue --run         # ask a reviewer for read-only diagnosis
framein rewind [--force]     # preview reset to last checkpoint; --force performs it
```

- `rescue` never acts automatically. A human chooses diagnose, rewind, or continue.
- `rewind` is destructive, so the default is a preview. It runs `git reset --hard` only with
  `--force`.

### 7.4 Task Capsule: Continuity Across Sessions and Models (`pause`, `resume`, `capsule`)

Instead of passing a chat transcript around, Framein builds structured context from the contract,
ADRs, git state, validation results, and ledger events.

```bash
framein pause          # save a capsule: goal, branch, last-green, decisions, changed files, blocker, recent events
framein resume         # print the saved capsule, or synthesize one if missing
framein capsule show   # render a fresh capsule
framein capsule codex  # prepare a lead-model switch; capsule show includes the target
```

- The `blocker` field is derived from repeated-failure signals in the ledger.
- A capsule is designed for model/session switches, not just human summaries.

### 7.5 Disagreement Protocol: Bound Model Debate (`challenge`, `decide`)

Framein limits model disagreement to a small protocol: proposal, objection, resolution. The reviewer
does not edit the code. It returns claims, reasons, and requirements. The lead keeps control.

```bash
framein challenge "<proposal>"                         # start a debate from the lead proposal
framein challenge "<proposal>" --run                   # ask an independent reviewer model
framein challenge --block "<claim>" --require "<need>" # record reviewer objection manually
framein challenge --accept                             # reviewer accepts; debate resolved
framein decide accept|reject ["<reason or revision>"]  # lead resolves
framein challenge --show                               # print current debate state
```

- After two unresolved rounds, Framein escalates to exactly two human choices: the lead position or
  the reviewer requirement.
- Generated wrappers add `--by <host>` for `challenge`, so the calling agent does not review itself.

### 7.6 Blast Radius Guard: Raise the Gate Only When Risk Changes (`risk`)

Framein inspects changed files and raises required gates when sensitive areas are touched:

- HIGH: auth, payments, migrations, secrets, deploy paths
- MEDIUM: dependencies and configuration
- LOW: ordinary files

```bash
framein risk
# git changed files -> risk level + required gates
```

`framein ship` automatically includes this result when it detects sensitive changes.

### 7.7 Repo-local Routing: Choose by This Repository's Record (`route`, `stats`)

Framein does not claim a universal model leaderboard. It learns from this repository's ledger and
explains why a role would route to a particular agent.

```bash
framein stats                  # agent record from this repo: delegation, failures, quota
framein route explain [role]   # which agent would be used, and why

# Selected codex as reviewer.
# Why: +100% delegation success in this repo (3/3), no quota issues
# Alternative: claude, confidence 0.29
```

The explanation matters more than automatic selection.

### 7.8 Framein Recipe: Vendor-neutral Protocols (`recipe`)

Framein does not try to run a Claude skill inside Codex or a Codex skill inside Gemini. Instead, it
defines vendor-neutral work protocols and compiles them to each host's native mechanism.

```bash
framein recipe list
framein recipe show <name>
framein recipe compile <name> <agent>
```

Built-in recipe names currently include `feature`, `bugfix`, and `ship`.

### 7.9 Vibe Debt Delta and Ownership Brief (`debt`, `explain`)

```bash
framein debt
# Show only debt introduced by this change: new deps, TODOs, line delta, etc.

framein explain
# Build an ownership brief skeleton: change, tests, rollback.

framein explain --run
# Ask the explainer agent to complete the narrative sections.
```

These commands are meant to summarize the change at hand, not produce a generic warning dump.

---

## 8. Real Agent Integration

> Live-verified against real CLIs: claude 2.1.156, codex 0.141, gemini 0.47.

### 8.1 Headless Delegation: `framein ask`

`ask` is the main path for calling another role into the current workflow. The target agent runs as a
headless subprocess. Framein does not use a programmatic PTY to drive an interactive TUI.

```bash
framein ask reviewer "review this change" --show
# Preview the command. No spawn, no ledger write.

framein ask reviewer "review this change" --run
# Run it and ingest the result into ledger/capsule state.

framein ask reviewer --interactive
# Hand the terminal to the agent TUI through stdio:inherit.

framein ask implementer "..." --run --trust --ttl 30m
# Attach provider-specific permission-bypass flags for the delegated run.
```

Implementation details verified in live runs:

- Prompts go through stdin. argv carries fixed flags only, which avoids shell-injection issues.
- Windows npm `.cmd` shims are handled with `shell:true`.
- Agent call shapes:
  - Claude: `claude -p`
  - Codex: `codex exec --skip-git-repo-check`
  - Gemini: `gemini --prompt= --skip-trust`
- Delegation output is scanned for quota/overload signals. If an agent is exhausted, Framein can
  suggest failover to another agent.

### 8.2 MCP Server: Let Agents Read Framein State as Tools

Framein provides a small MCP stdio server. Each CLI launches its own `framein mcp serve` subprocess
as a client-side tool server. All clients share the same `.frame/store.db`, protected by WAL and
atomic locks.

```bash
framein mcp
# List detected existing MCP servers. This is detection, not proxying.

framein mcp register [path] --write
# Register Framein's MCP server into the detected config.

framein mcp serve
# Run the MCP stdio server. It speaks NDJSON JSON-RPC, not Content-Length framing.
```

Exposed tools include:

```text
append_adr
list_adr
get_adr
read_memory
write_memory
list_memory
get_role
get_roles
acquire_lock
release_lock
```

Each tool has an `inputSchema`, so real MCP clients can recognize it.

Verified behavior: `claude mcp list` reports Framein connected, and Claude, Codex, and Gemini have
all called the `list_adr` tool and read from the local store.

### 8.3 Tool Calls Require Trust

All three CLIs require their own approval-bypass mode for unattended MCP tool calls:

- Claude: `--dangerously-skip-permissions`
- Codex: `--full-auto`
- Gemini: `--yolo`

That is what `framein trust` previews and what `framein ask ... --trust` applies for the delegated
run. The integration is explicit and time-boxed; Framein does not silently enable these flags.

### 8.4 Command Surfaces: CLI, JSON, Native Wrappers, and Shell

The same engine is exposed through four surfaces:

1. Shell: `framein <verb>`
2. MCP tools
3. Native agent wrappers: `/fr:*` for Claude/Gemini, `$fr-*` for Codex skills
4. Optional `framein shell`

The key invariant is one source of truth. Wrappers contain no product logic. They only call the local
Framein engine, so behavior does not drift by host.

#### Structured automation output

Automation-facing verbs expose stable JSON:

```bash
framein verify --json
framein ship --json
framein status --json
framein risk --json
framein rescue --json
framein task show --json
framein route explain --json
framein stats --json
```

`ship --json` keeps non-zero exit behavior when the gate fails.

#### Native wrapper installation

```bash
framein integrations list
framein integrations show claude
framein integrations install all          # preview writes
framein integrations install all --write  # apply writes
framein integrations uninstall claude     # removes only Framein-provenance files
```

| Host | Generated files | Invocation |
|---|---|---|
| Claude | `.claude/commands/fr/<verb>.md` | `/fr:verify` with `allowed-tools: Bash(framein:*)` |
| Gemini | `.gemini/commands/fr/<verb>.toml` | `/fr:verify` with `!{framein verify --json}` |
| Codex | `.codex/skills/fr-<verb>/SKILL.md` | `$fr-verify`; Codex `/prompts` is deprecated |

Generated agent-facing verbs:

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

Notes:

- Most wrappers call `framein <verb> --json` when the verb has stable JSON output.
- `start`, `challenge`, `task`, `capsule`, and `decide` forward arguments in their natural CLI form.
- `challenge` wrappers add `--run --by <host>` so Framein selects an independent reviewer rather
  than asking the calling agent to review itself.
- Windows wrappers call `framein.cmd` to avoid PowerShell execution-policy failures from npm's
  `.ps1` shim. Regenerate old wrappers with `framein integrations install all --write`.
- `install` previews unless you pass `--write`. `uninstall` is intentionally an apply command, but it
  removes only files carrying Framein's provenance marker; hand-written files in the same folder stay.
- Store-backed commands need project write access. If an agent runs in a read-only sandbox, commands
  such as `verify`, `ship`, and `capsule` may fail because SQLite cannot open `.frame/store.db` and
  its WAL files.
- Run state-changing commands such as `task amend`, `role set`, `checkpoint`, `pause`, and `import`
  sequentially. Framein uses write locks for store integrity, but human-readable output from parallel
  commands can still reflect the order in which those commands reached the store.

#### Doctor and setup

```bash
framein doctor
# Detect claude/codex/gemini on PATH and count installed wrappers.

framein setup
# Run doctor and suggest wrapper installation for detected CLIs.
```

### 8.5 Optional Switchboard: `framein shell`

`framein shell` is an optional zero-dependency interactive switchboard. It runs Framein verbs inline
and can hand the terminal to a native agent TUI through `stdio:inherit`. It uses Node's built-in
readline, not `node-pty`.

```text
$ framein shell
+-- FRAMEIN ------------------------------+
| Intent in | Validation in | Drift out    |
+-----------------------------------------+

  project    framein | main
  lead       claude
  reviewer   codex
  task       no active contract

fr(claude)> verify --json
fr(claude)> /lead codex
fr(codex)>  /go
fr(codex)>  codex fix this bug
fr(codex)>  /help
fr(codex)>  exit
```

- `/go` and bare agent names hand control to the native Claude/Codex/Gemini TUI. Framein pauses and
  returns when the agent process exits.
- Running the Framein UI and a live TUI at the same time would require `node-pty`, which is a native
  runtime dependency. Framein deliberately keeps that out of the bundled product.
- Color is enabled only in interactive terminals. Pipes, CI, and `--json` are plain by default.
  `--plain`, `--no-color`, and `NO_COLOR` disable styling.
- Legacy consoles that cannot render Unicode boxes fall back to ASCII symbols.
- If stdin is not a TTY, shell mode behaves safely as batch input and does not attach to native TUIs.

---

## 9. Engine Commands

These commands are more advanced, but they support the product loop.

| Command | Description |
|---|---|
| `framein init` | Create the store, default rules/roles, and native file projections. Idempotent. |
| `framein rules show\|set\|reset` | View, replace, or reset the editable project rules projected into native context files. |
| `framein status` | Summarize roles, locks, and ADR counts. |
| `framein role set <role> <agent>` / `role list` | Assign or read roles. Agent and role values are validated. |
| `framein adr add <title>` / `supersede <id> <title>` / `show <id>` / `list` | Append-only decision log. Corrections use supersede. |
| `framein sync [--dry-run]` | Re-project store state into native files. `--dry-run` previews changes. |
| `framein export [path]` / `import [path]` | Move between the git-canonical text snapshot and the SQLite cache. |
| `framein unlock [scope]` | Force-release a stale write lock. |
| `framein ledger add <kind> [target]` / `ledger list` | Record task events used by anomaly detection. |
| `framein audit` | Report ledger thrash signals. |
| `framein skills` | Show Framein's own skill catalog plus detected local skills. No cross-execution. |
| `framein integrations` / `doctor` / `setup` / `shell` | Native wrappers, CLI checks, and optional switchboard. |
| `framein --version` / `--help` / `<cmd> --help` | CLI hygiene. |

Memory is currently used through MCP tools (`read_memory` and `write_memory`). There is no dedicated
memory CLI verb yet.

---

## 10. Safety: Trust, Blast Radius, and Boundaries

### `framein trust <agent> [--ttl <duration>]`

`trust` is intentionally safety-first. It previews the permission-bypass flags for an agent and does
not silently apply them.

```bash
framein trust codex --ttl 20m
# trust preview for codex (time-box ~20m):
#   would add: --full-auto
#   warning: codex will run without per-action permission prompts
#   warning: a worktree is not a sandbox: network, credentials, and npm install are not blocked
```

- `framein ask ... --run --trust` applies the bypass flags to that delegated spawn only and records
  it in the ledger.
- A worktree isolates files, not the process. It is not a security sandbox.

### Blast Radius and Sensitive Data

- If changed files touch sensitive areas, `ship` raises the gate.
- ADRs, memory, and task contracts can accidentally capture secrets, tokens, or private internal
  paths. Be careful before committing `framein.store.json`.

### Trust Boundary

Framein is local-first:

- No provider credentials are collected.
- No remote credential relay or subscription pooling.
- Claude, Codex, and Gemini keep their official authentication flows.
- Existing MCP servers and skills are detected or registered, not proxied.
- Framein does not screen-scrape terminal I/O (TTY).
- Deployment remains a human gate.

---

## 11. Generated Files and Folder Structure

```text
your-project/
|-- .frame/
|   `-- store.db        # rebuildable local cache; SQLite; gitignored
|-- framein.store.json  # git-canonical snapshot created by framein export
|-- CLAUDE.md           # projected native context for Claude
|-- AGENTS.md           # projected native context for Codex
`-- GEMINI.md           # projected native context for Gemini
```

Only the managed block between Framein markers is rewritten. The block body is byte-identical across
the three files. User text outside the markers is preserved.

Example managed block:

```markdown
<!-- framein:begin -->
## Task Contract
**Goal:** add Google login while preserving existing email login
- Acceptance: existing users can still log in with email
- Non-goals: full UI redesign

## Project Rules
- Write tests first (TDD).

## Agent Roles
- **implementer** -> claude

## Architecture Decisions (digest)
- [ADR-1] ... (accepted)
<!-- framein:end -->
```

Important notes:

- `framein.store.json` is the shareable text snapshot. `.frame/store.db` is a rebuildable cache.
- Teams can commit `framein.store.json` and reconstruct local state with `framein import`.
- When dogfooding this repository, do not run `framein init` or `framein sync` at the repo root. It
  would inject a managed block into hand-authored context files. Use separate test folders.

---

## 12. Current Status

Solid in the current pre-release:

- Core store, projection, managed-block upsert, multi-process write locks, text snapshot import/export,
  role routing, and append-only ADRs.
- MCP and skill detection/registration, plus a spec-compliant MCP stdio server with initialize
  negotiation, ping, input schemas, and in-band tool errors.
- Product loop P0-P2: Task Contract, Validation Gate, Rescue, Capsule, Disagreement, Blast Radius,
  Repo-local Routing, Recipe, Debt, and Ownership Brief.
- Command surface: `--json` for automation-facing verbs, logic-less native wrappers
  (`/fr:*` and `$fr-*`), `doctor`, `setup`, optional `framein shell`, and aliases `framein`, `fr`,
  and `frame`.
- Live CLI verification: headless delegation, MCP connection and tool calls, `trust`, interactive
  attach through `stdio:inherit`, structured model-ingest paths, and quota failover.
- Windows author environment verified.
- `240+` automated tests passing.

Still being validated:

- Clean-machine smoke tests across supported npm platforms.
- Multi-developer workflows.
- Larger-scale use of model-generated narrative sections.
- Future release automation and package update workflow.
- Signed cross-platform executable artifacts through GitHub Actions.

Deliberately not bundled:

- Programmatic PTY control (`node-pty`/ConPTY). It would add a native runtime dependency and break the
  zero-dependency invariant. Framein observes through store/ledger state rather than screen-scraping
  a terminal.
- A simultaneous overlay that shows Framein UI and a live native TUI at the same time. That can be an
  optional future package, but the default product uses `stdio:inherit`.

---

## 13. FAQ

**Q. I want to start over.**

Delete `.frame/` and run `framein init` again. `.frame/` is gitignored.

**Q. Can I edit the generated `.md` files by hand?**

Yes, outside the managed block. Content inside `framein:begin` and `framein:end` will be overwritten
on the next sync. Change managed content through Framein commands.

**Q. Are the three native context files really the same?**

The managed block body is byte-identical and covered by tests. File names and host-specific wrappers
differ; the core projected block does not.

**Q. What about Gemini consumer auth?**

Framein routing treats consumer-login Gemini auth as forbidden. Use API key, Vertex, or Workspace
flows. Provider credentials remain with the provider CLI; Framein does not relay them.

**Q. Does it work on Windows?**

Yes. Node 22.5+ works on native Windows, and the author environment has been live-verified. Headless
delegation uses pipes and npm `.cmd` shims, so Framein does not depend on ConPTY.

**Q. Does another agent receive a new ADR immediately?**

No. Framein is fresh-on-read, not push-based. Tools, sync, session restart, or capsule rebuilds read
the latest local state.

---

## 14. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `No .frame/store.db found. Run 'framein init' first.` | Run `framein init` in the project folder. |
| `node:sqlite` error or missing module | Node is older than 22.5. Check `node --version`. |
| `framein` or `frame` command not found | Build and run `node dist/cli.js ...`, or install/link the package. |
| `ask --run` says `'codex' not found` | The target CLI is not installed or not on PATH. Install it or use `--show` to preview only. |
| MCP tool call is cancelled | Tool calls need trust/approval-bypass flags: Claude trust, Codex `--full-auto`, Gemini `--yolo`. |
| Role assignment did not change | Check syntax: `framein role set <role> <agent>`. Missing agent arguments are rejected. |
| Source edits do not affect CLI behavior | Rebuild after editing `src/*.ts`: `npm run build`. |
| Agent wrapper cannot write state | The agent may be running read-only. Store-backed commands need project write access. |

---

## 15. Developer Notes: Build, Test, and Structure

```bash
npm run build
npm test
node --no-warnings --test dist/store.test.js
node --no-warnings --test --test-name-pattern="supersede" dist/**/*.test.js
node --no-warnings dist/cli.js <cmd>
```

Tests are colocated as `*.test.ts` and use Node's built-in `node:test` and `node:assert/strict`.
There is no linter; `tsc --strict` is the static gate. `lock.mp.test.ts` spawns child processes for
multi-process lock testing, so keep it deterministic.

Module map:

```text
db -> store -> (roles, adr, anomaly, task) -> projector -> fileWriter
                                                -> mcpServer / mcpRegister / detect

Product loop:
evidence, rescue, capsule, disagree, blast, stats, recipe, debt, brief, ingest,
quota, delegate, trust

Command surface:
wrappers, shell

cli.ts:
command dispatch, JSON output, integration wiring, and process boundaries
```

| File | Role |
|---|---|
| `db.ts` | Thin facade over `node:sqlite`. Do not import `node:sqlite` elsewhere. |
| `store.ts` | Config, roles, append-only ADRs, scoped memory, write locks, ledger, import/export. |
| `managedBlock.ts` | Marker-based upsert with user-text preservation, duplicate-marker collapse, marker defanging. |
| `projector.ts` / `fileWriter.ts` | Core block rendering, dry-run planning, changed-file writes. |
| `roles.ts` | Agent/role guards, scoring, selection, repo bonus, forbidden auth handling. |
| `adr.ts` / `anomaly.ts` | ADR digest and thrash detection. |
| `detect.ts` / `mcpRegister.ts` / `mcpServer.ts` | MCP and skill detection, config merge, stdio server. |
| `task.ts` / `evidence.ts` / `rescue.ts` / `capsule.ts` | P0 product-loop pure logic. |
| `disagree.ts` / `blast.ts` / `stats.ts` | P1 product-loop pure logic. |
| `recipe.ts` / `debt.ts` / `brief.ts` / `ingest.ts` | P2 features and structured ingest. |
| `quota.ts` / `delegate.ts` / `trust.ts` | Live delegation, failover, and permission planning. |
| `wrappers.ts` / `shell.ts` | Logic-less native wrapper generation and shell line routing. |
| `cli.ts` / `types.ts` | Command dispatch, `--json`, and shared types. |

Invariants to preserve:

- ADRs are append-only.
- Managed blocks are byte-identical across `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md`.
- User text outside the managed markers is preserved.
- Write-lock acquisition is atomic.
- `framein.store.json` is the git-canonical text snapshot; `.frame/store.db` is a cache.
- Reuse existing tools; do not proxy provider credentials or cross-execute another host's skills.
- Runtime dependencies remain zero unless an ADR explicitly changes that invariant.
- Consumer Gemini auth remains blocked in routing.

Code conventions:

- ESM + `NodeNext`.
- In TypeScript source, import local modules with explicit `.js` extensions.
- Read [`README.md`](../README.md) and this manual before changing behavior with product-level
  tradeoffs.

---

**Framein by Frameout**. MIT. See [`LICENSE`](../LICENSE), [`SECURITY.md`](../SECURITY.md), and
[`CONTRIBUTING.md`](../CONTRIBUTING.md).
