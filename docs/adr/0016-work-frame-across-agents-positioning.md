# ADR-0016: Position Framein as a Work Frame Across Agents

- **Status:** Accepted (2026-06-25)
- **Refines:** [ADR-0015](./0015-benchmark-driven-evidence-gate-positioning.md)
- **Related:** [ADR-0008](./0008-reposition-to-quality-continuity-layer.md), [ADR-0013](./0013-lobby-and-cross-model-continuity.md)

## Context

ADR-0015 moved the public message toward a local evidence gate, decision ledger, and native skill
surface. That was directionally correct because Framein must not look like another prompt pack.
However, making "verify before done" the lead message makes the product feel narrower than the
developer pain we are actually addressing.

Good PRDs, plans, ADRs, and skill packs already help Claude, Codex, Gemini, and similar agents do
better work. The sharper pain appears when a task has to survive beyond a single clean model session:

- the lead model stalls and repeats the same approach;
- a different model should challenge the plan, diff, or risk;
- quota, model fit, or a dead end forces a lead-model switch;
- the final answer still needs deterministic validation before ship.

If Framein is presented primarily as "a tool that catches false done," developers may classify it as
a test runner, hook, or small verification skill. If it is presented as a handoff-document generator,
the value also collapses to "summary management." Neither description captures the product.

## Decision

Framein's public positioning is:

> **Keep one work frame across Claude, Codex, and Gemini.**
>
> Start with one agent, challenge it with another, switch when needed, and close the work with
> validation.

The product is a local work-state layer under the agents a developer already uses. It keeps the
following facts stable across agent sessions and model switches:

1. **Task Contract** - what the work is supposed to preserve and complete.
2. **Decision Trail** - ADRs, ledger entries, failed attempts, and route history.
3. **Challenge Loop** - bounded objections from a different reviewer role when another view is useful.
4. **Model-Switch Capsule** - a compact projection of local facts for the next lead model.
5. **Validation Gate** - build/test/risk checks that close the work before ship.

The evidence gate remains core, but it is the closing mechanism of the work frame rather than the
entire product promise.

## Messaging Rules

- Say **work frame**, **shared local facts**, **lead model switch**, **bounded challenge**, and
  **validation gate**.
- Avoid leading with **handoff document**, **summary manager**, or **full multi-agent cockpit**.
- Do not promise autonomous model-team consensus. Framein coordinates a lead model, optional reviewer
  challenges, explicit switches, and deterministic validation.
- Keep benchmark tools out of headline copy. Explain compatibility with skill packs and slash-command
  frameworks without naming them as competitors.
- Validation copy should remain concrete: `verify`, `ship`, build/test results, risk gates, and human
  approval for sensitive changes.

## Product Priority

The public loop is:

```text
start -> challenge -> capsule/switch -> verify/ship
```

This does not remove `risk`, `rescue`, `checkpoint`, `ADR`, `MCP`, or wrapper surfaces. It changes
which concepts appear first on the website and README.

## Consequences

- Website and README lead with cross-agent continuity, challenge, switch, and validation.
- `capsule` is described as preparing a model switch from local facts, not as handoff-document
  management.
- `challenge` moves earlier in public examples because the independent reviewer use case is now part
  of the core story.
- `verify` and `ship` stay visible as the way the work frame is closed.
- Future UI or CLI work should make `/lead`, `capsule <agent>`, `challenge --run`, `verify`, and
  `ship` feel like one loop rather than unrelated commands.

## Alternatives Considered

- **Keep "verify before done" as the hero.** Rejected as too narrow. It makes Framein look like a
  verification helper rather than the shared work frame across agents.
- **Lead with multi-agent collaboration.** Rejected as too broad unless bounded. It risks implying a
  full autonomous team, provider proxy, or IDE-level cockpit.
- **Lead with handoff/capsule.** Rejected. It makes the product sound like summary generation, while
  the actual value is structured local work state plus validation.
