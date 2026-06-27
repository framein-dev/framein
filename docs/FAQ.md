# Framein FAQ

Honest answers to questions a skeptical developer is likely to ask first. If something here is
unconvincing, that is useful feedback: please open an issue.

## Is this just another wrapper or tmux multiplexer?

No. Framein does not run, orchestrate, or multiplex agents. It sits underneath whatever agent or
harness you already use as a local work-state layer: task contract, decision trail, validation
results, risk state, and a capsule the next model can read.

The agents read and write that shared local frame. Framein does not drive them in a grid. If your
mental model is "a cockpit that runs three CLIs side by side," that is specifically what Framein is
not trying to be.

## How is this different from CCB, Claude Squad, or CC Switch?

Those tools solve a different problem: running, switching, or managing multiple agent sessions.
Framein solves what happens to the work when you do that.

The distinction in one line: session managers manage agents; Framein persists work state so it
outlives any single model or session, then closes the work with build, test, and risk gates. You can
use Framein alongside a session manager. It is a layer underneath the work, not a competing terminal
multiplexer.

## How does this relate to Pi, OpenCode, and other agent harnesses?

It sits underneath them, not against them. Claude Code, Codex, Gemini CLI, Pi, OpenCode, and similar
tools are harnesses: the runtime around a model, tool loop, session, and extensions. Framein does not
try to replace that surface.

A harness can preserve session state inside itself. Framein preserves work state in the repo, outside
any one harness. The task contract, decisions, failed attempts, validation state, and handoff capsule
stay with the project so switching harness, model, or session does not reset the work.

If harnesses are the engine, Framein is the shared logbook the engines write to.

## Is this just `CLAUDE.md`, `AGENTS.md`, or a skill pack?

No. Those are useful inputs that help a model do better work, and Framein coexists with them. Keep
your skill packs, personas, slash commands, and project instructions.

The gap appears after one clean session: when the lead model stalls, when another model should
challenge the plan, when you switch because of quota or model fit, or when "done" was claimed before
build and tests ran. A static instruction file does not carry the contract, failed attempts,
validation state, and decisions across that boundary. Framein records those through its own commands,
and because the state lives in repo files, changes are reviewable through git.

## Does it read or relay my subscription tokens?

No. This is a core design boundary.

Framein:

- collects no provider credentials;
- relays no tokens and pools no subscriptions;
- runs no proxy for model traffic;
- screen-scrapes no terminal I/O;
- calls official CLIs locally, leaving authentication with those CLIs.

Given recent scrutiny around tools that pool credentials or route subscription traffic, Framein keeps
that boundary hard. It is designed not to handle provider credentials, proxy model traffic, or pool
subscriptions. Users remain responsible for each provider's terms.

See [`SECURITY.md`](../SECURITY.md) and the Trust Boundary section of the README.

## Where does my data live? Does it phone home?

Everything lives in your repo. The git-friendly snapshot is `framein.store.json`; `.frame/store.db`
is a local SQLite cache.

There is no cloud work-frame service. If a future build adds telemetry, it should be opt-in and
documented before release. Silent telemetry would violate the local-first design.

## What does `challenge` do, and why not just switch models?

`challenge` asks a different model for a bounded objection against the facts already recorded: the
contract, diff, validation state, and relevant decisions. You do not need to open a fresh chat and
re-explain the project.

The point is not always to replace the stuck model. Sometimes you need a second set of eyes while the
work is still alive. On something like a checkout webhook where retries and idempotency matter, a
confident "done" can still be unsafe. One bounded "what risk is this plan missing?" can be more
useful than a full model swap.

## Does this lock me into Claude, Codex, and Gemini?

No. The same local engine is exposed as `/fr:*` slash commands for Claude and Gemini, `$fr-*` skills
for Codex, a CLI with JSON output, and a local stdio MCP server. The wrappers contain no product
logic; they call the same `framein` engine.

If you use one agent today and add another later, the frame does not change.

## Will it break every time a CLI updates?

The integration surface is intentionally thin. Framein does not screen-scrape terminal output or
hook private session formats. Its wrappers are logic-less and call the local engine.

That is less brittle than tools that parse another program's TTY. It is still pre-release; if an
integration breaks, please file an issue with the CLI version and command that failed.

## Why should I trust a pre-release tool?

You should not trust it blindly. Try it in a throwaway repo first.

What you can inspect today:

- MIT-licensed source;
- zero runtime dependencies;
- Node 22's built-in `node:sqlite` for the local store;
- 240+ automated tests;
- all work-frame state stored in files you can read in your repo;
- `ship` exits non-zero on hard validation failure;
- deployment remains a human gate.

Framein does not push, deploy, or publish anything on its own.

## What is not solid yet?

The core store, managed-block projection, task contract, verify/risk/ship gates, `/fr:*` and `$fr-*`
wrappers, `challenge`, `capsule`, and the MCP server are working today.

Still being validated:

- signed standalone executable releases for Windows and macOS;
- clean-machine install checks beyond the npm path;
- multi-developer workflows;
- interactive lobby paths such as `/lead`, `/go`, and inline command palette.

## How do I install it?

```bash
npm install -g framein
framein --version
```

Node 22.5.0+ is required because Framein uses built-in `node:sqlite`.

Then in a repo:

```bash
framein init
framein integrations install all --write
framein start "the smallest safe change"
```

## How can I help?

Honest teardowns are useful at this stage. Open an issue, start a GitHub Discussion, or say what made
you stop. "I tried it and stopped because X" is high-signal feedback.
