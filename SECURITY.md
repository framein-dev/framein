# Security Policy

Framein is **local-first** and holds no provider credentials.

## Trust boundary

- **No pooled credentials, no remote credential relay** — each official CLI (`claude` / `codex` /
  `gemini`) handles its own authentication locally. Framein never collects or routes your subscription.
- Framein stores project state locally — `.frame/store.db` (rebuildable cache) + `framein.store.json`
  (git-canonical snapshot) — and only ever rewrites **its own managed block** in
  `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`. Text outside the block is preserved.
- **Destructive actions preview by default.** `framein rewind` is a preview unless `--force`.
- `framein trust` only **previews** an agent's permission-bypass flags (`--dangerously-skip-permissions`
  / `--full-auto` / `--yolo`); it never auto-enables them. A worktree is not a sandbox — network,
  credentials, and `npm install` are not blocked.
- Consumer Gemini login is **forbidden in routing**; use an API key / Vertex / Workspace.

## Sensitive data

ADRs and scoped memory are projected into git-committed text (`framein.store.json`). **Do not put
secrets, tokens, or internal paths** into contracts, decisions, or memory.

## Reporting a vulnerability

While pre-release, please report security issues **privately** — open a GitHub security advisory on the
repository, or contact the maintainer — rather than filing a public issue. We aim to acknowledge
reports promptly and will credit reporters who wish to be named.
