# Framein Test Scenarios

This checklist is for manual validation beyond the automated test suite. It follows the public
README and manual, but it is intentionally more operational: each case states the command, the
expected behavior, and the safety point being checked.

Run these in a scratch project, not in the Framein repository root.

Prerequisites:

- Node.js 22.5.0 or newer.
- Installed `framein` binary (`framein`, `fr`, and `frame` should all work).
- A git repository for checkpoint/risk/rewind scenarios.
- Optional real CLIs for live integration checks: `claude`, `codex`, `gemini`.

Recommended smoke project:

```bash
mkdir framein-smoke && cd framein-smoke
git init
framein init
```

---

## 0. Daily Agent Surface

The everyday path is agent-driven. `framein init` projects operating guidance into native context
files and installs wrappers for detected CLIs.

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
| Build handoff context | `/fr:capsule` | `$fr-capsule` |
| Resolve a reviewer debate | `/fr:decide` | `$fr-decide` |

Expected:

- Wrappers are logic-less and call `framein <verb>` locally.
- Contract and validation state are written to the shared store and native managed blocks.
- Codex uses `$fr-*` skills, not deprecated `/prompts:*`.

---

## A. Binary, Help, and Init

- `framein --version`, `fr --version`, `frame --version` all print the same version.
- `framein --help` mentions `validate done`, `/fr:*`, and `--json`.
- `framein verify --help` describes build/test validation.
- `framein nope` exits 1 with an unknown-command error.
- `framein init` creates `.frame/store.db`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, and ensures
  `.frame/` is gitignored.
- Re-running `framein init` is idempotent.
- `framein status --json` emits one valid JSON object.

---

## B. Task Contract and Projection

```bash
framein start "add Google login while preserving existing email login"
framein task amend acceptance "existing users can still log in with email"
framein task amend nongoal "full UI redesign"
framein task show
framein task show --json
```

Expected:

- Contract changes re-project into all three native files.
- `git diff -- CLAUDE.md AGENTS.md GEMINI.md` shows the contract change clearly.
- The managed block body is byte-identical across the three native files.
- Text outside the `framein:begin` / `framein:end` markers survives `framein sync`.
- Invalid fields, for example `framein task amend bogus x`, exit 1.

---

## C. Validation and Ship Gates

With no build/test scripts:

- `framein verify` reports missing checks and exits 0 because `verify` is informational.
- `framein ship` exits 1 if hard validation is not ready.

With passing scripts:

```bash
framein verify
framein verify --json
framein ship
framein ship --json
```

Expected:

- `verify` runs real build/test commands when present.
- `verify --json` contains `schemaVersion`, `command`, `ready`, `status`, `checks`, and `warnings`.
- `ship` exits 0 when hard validation passes, even if unresolved acceptance criteria remain as
  reviewer/human warnings.
- In that warning state, `ship` should report `Safe to commit: yes` and
  `Safe to deploy: requires human confirmation`.
- If build or tests fail, `verify` still exits 0, while `ship` exits 1.

---

## D. Risk and Blast Radius

```bash
framein risk
framein risk --json
```

Expected:

- No changed sensitive files -> `Risk level: LOW`.
- Dependency/config changes -> MEDIUM with required gate.
- Auth/payment/migration/secrets/deploy changes -> HIGH with required gates.
- Re-running after a risk increase reports the transition, for example `LOW -> MEDIUM`.
- `framein ship` includes risk output when risk is above LOW.

---

## E. Rescue, Checkpoint, and Rewind

```bash
framein checkpoint baseline
framein ledger add test-fail tests/blog.test.mjs
framein ledger add test-fail tests/blog.test.mjs
framein rescue
framein rescue --json
framein rewind
```

Expected:

- `checkpoint` records the current git commit.
- `rescue` reports repeated-failure or no-progress signals when present.
- `rescue` offers options and prints "No action taken automatically."
- `rewind` previews a destructive reset. It only runs with `--force`.

---

## F. Capsule and Continuity

```bash
framein pause
framein resume
framein capsule show
framein capsule codex
```

Expected:

- Capsule includes goal, branch, last-green commit, decisions, changed files, validation results,
  blocker, last delegation, armed handoff target, and recent ledger activity when available.
- `capsule <agent>` arms a handoff without changing code, and a later `capsule show` renders
  `handoff: <agent> (armed)`.
- Output says no manual handoff is needed.

---

## G. Challenge and Decide

Manual path:

```bash
framein challenge "use a transaction to prevent duplicates"
framein challenge --block "needs a unique constraint" --require "add a unique index"
framein challenge --show
framein decide accept "add the unique index"
```

Live reviewer path, when another CLI is available:

```bash
framein challenge "use Validation Gate terminology consistently" --run --by claude
```

Expected:

- Manual debate state is persisted and rendered.
- `decide accept|reject` resolves the debate.
- `challenge --run --by <host>` asks a different model to review.
- The calling host should not review itself.

---

## H. Delegation, Trust, Route, and Stats

```bash
framein ask reviewer "Reply with FRAMEIN_REVIEW_OK only." --show
framein ask reviewer "Reply with FRAMEIN_REVIEW_OK only." --run
framein trust codex --ttl 20m
framein stats
framein route explain reviewer
```

Expected:

- `--show` previews without spawning or writing the ledger.
- `--run` spawns the selected CLI and records delegation success/failure.
- `trust` previews provider-specific bypass flags and does not enable them silently.
- `stats` and `route explain` use repo-local ledger facts after live delegation.

---

## I. Native Wrappers, Doctor, and Setup

```bash
framein integrations list
framein integrations show codex
framein integrations install claude
framein integrations install claude --write
framein integrations uninstall claude
framein doctor
framein setup
```

Expected:

- `list` shows 10 verbs for each host.
- Codex path is shown as `.codex/skills/fr-<verb>/SKILL.md`.
- `install <host>` without `--write` previews.
- `install <host> --write` writes files.
- `uninstall <host>` removes only files with Framein provenance. It is an apply command, not a
  preview command.
- Hand-written files in the same command folder survive uninstall.
- `doctor` reports CLI presence and wrapper counts.
- `setup` prints doctor output and next install recommendation in non-interactive use.

---

## J. MCP

```bash
framein mcp
framein mcp patch
framein mcp register
```

Expected:

- `mcp` detects existing MCP servers and does not proxy them.
- `patch` prints registration snippets for Claude, Codex, and Gemini.
- `register` without `--write` previews the config merge.

MCP stdio smoke:

```text
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"qa","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_adr","arguments":{}}}
```

Expected:

- The server responds with initialize result, then tool list, then a `list_adr` tool result.
- Requests before `notifications/initialized` are rejected with `-32600`.
- Transport is newline-delimited JSON-RPC, not LSP `Content-Length` framing.

---

## K. Rules, Roles, ADRs, Sync, and Snapshot

```bash
framein rules show
framein rules set "Use validation terminology in public docs and generated context."
framein rules reset
framein role list
framein role set reviewer codex
framein adr add "Record a smoke-test decision"
framein adr list
framein adr show 1
framein sync --dry-run
framein sync
framein export framein.store.json
framein import framein.store.json
```

Expected:

- Rules are projected into native files and reset to defaults.
- Roles validate both role and agent names.
- ADRs are append-only. Corrections use `supersede`.
- `sync --dry-run` writes nothing.
- `framein.store.json` is the shareable text snapshot; `.frame/store.db` is a rebuildable cache.

---

## L. Recipes, Debt, Explain, Skills, Ledger, Audit

```bash
framein recipe list
framein recipe show feature
framein recipe compile bugfix codex
framein debt
framein debt --json
framein explain
framein skills
framein ledger add turn manual-scenario
framein ledger list
framein audit
```

Expected:

- Recipes use `run_validation` terminology and compile to each host's native mechanism.
- Debt reports only delta for the current change.
- Explain emits an ownership brief skeleton.
- Skills are detected and cataloged, not cross-executed.
- Audit reports repeated-failure or no-progress signals when the ledger contains them.

---

## M. Lobby and Shell

Batch mode:

```bash
printf 'status\n/lead codex\nstatus\nexit\n' | framein shell
```

Expected:

- Prints status, switches lead, prints status again, and exits with `bye`.
- No interactive banner or TUI attach is required in piped mode.

Interactive mode:

- Running bare `framein` in a TTY opens the lobby.
- `/` opens the command palette.
- `/lead` opens the picker.
- `/go` hands the terminal to the lead's native TUI through `stdio:inherit`.
- `exit`, `/exit`, or Ctrl-D on an empty line exits.

---

## N. Exit Code Matrix

| Case | Expected exit |
|---|---|
| Successful command | 0 |
| `verify` with failed checks | 0 |
| `ship` with failed hard validation | 1 |
| Unknown command or invalid argument | 1 |
| Missing `.frame/store.db` for store-backed command | 1 |
| `rewind` preview | 0 |

---

## Pass Criteria

The suite passes when:

- Command output matches the scenarios above.
- All documented JSON outputs are valid one-line JSON.
- Managed-block preservation, uninstall provenance, trust preview, and destructive-command previews
  behave as documented.
- README and `docs/MANUAL.md` describe the same behavior observed in the terminal.
