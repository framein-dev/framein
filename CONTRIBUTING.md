# Contributing to Framein

Issues, design critiques, adapters, compatibility reports, and workflow recipes are all welcome.
Framein is **Framein by Frameout**, built in the open.

## Dev setup

- **Node ≥ 22.5.0** (uses the built-in `node:sqlite` and `node:test`).
- **Zero runtime dependencies** — do not add an npm *runtime* dependency without a very good reason;
  it breaks a core selling point. Dev-only tooling (`typescript`, `@types/node`) is fine.

```bash
npm install      # dev tooling only
npm run build    # tsc → dist/
npm test         # build + run the full suite
```

## Conventions

- **TDD** — write or extend the test first, then implement; keep the suite green per commit.
- **ESM + NodeNext** — import with explicit `.js` extensions in `.ts` source.
- Significant decisions go in [`docs/adr/`](docs/adr/) (**append-only**; correct via `supersede`,
  never edit/delete).
- Tests are colocated (`*.test.ts`), `node:test` + `node:assert/strict`.
- Don't break the core invariants documented in [docs/MANUAL.md](docs/MANUAL.md) and
  [docs/adr/](docs/adr/): managed-block byte-identical projection, atomic write lock,
  text-canonical store, no-relay/no cross-execution, and zero runtime deps.

## Before a pull request

- `npm test` is green and you added/updated tests for the change.
- Read [docs/MANUAL.md](docs/MANUAL.md) (workflow + invariants) and [SECURITY.md](SECURITY.md)
  (trust boundary).
- One logical change per PR; reference the relevant ADR or open a new one for a decision.
