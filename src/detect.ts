// Reuse-first (ADR-0002/0004): DETECT each agent's existing MCP servers and skills and
// surface them; never proxy or reimplement them. Parsers are pure (fixture-testable);
// the disk layer is best-effort and swallows missing/malformed files.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Agent } from './types.js';

export interface McpServer {
  agent: Agent;
  name: string;
  command: string;
}

// --- pure parsers (one per CLI's config format) ---

/** Claude project `.mcp.json`: { "mcpServers": { name: { command, args } } } */
export function parseClaudeMcpJson(text: string): McpServer[] {
  const servers = (JSON.parse(text)?.mcpServers ?? {}) as Record<string, { command?: string }>;
  return Object.entries(servers).map(([name, def]) => ({ agent: 'claude' as const, name, command: def?.command ?? '' }));
}

/** Gemini `settings.json`: { "mcpServers": { name: { command, args } } } */
export function parseGeminiMcpJson(text: string): McpServer[] {
  const servers = (JSON.parse(text)?.mcpServers ?? {}) as Record<string, { command?: string }>;
  return Object.entries(servers).map(([name, def]) => ({ agent: 'gemini' as const, name, command: def?.command ?? '' }));
}

/**
 * Codex `~/.codex/config.toml`: top-level `[mcp_servers.<name>]` tables (sub-tables like
 * `[mcp_servers.<name>.env]` are NOT servers). Minimal line-based reader (zero-dep).
 */
export function parseCodexMcpToml(text: string): McpServer[] {
  const out: McpServer[] = [];
  let cur: McpServer | null = null;
  for (const raw of text.split('\n')) {
    // strip a trailing ` # comment` (best effort: not quote-aware, but tolerates the common case)
    const line = raw.replace(/\s+#.*$/, '').trim();
    const sec = line.match(/^\[mcp_servers\.([^.\]]+)\]$/);
    if (sec) { cur = { agent: 'codex', name: sec[1], command: '' }; out.push(cur); continue; }
    if (line.startsWith('[')) { cur = null; continue; } // any other section ends the current server
    if (cur) {
      const m = line.match(/^command\s*=\s*['"](.*?)['"]\s*$/);
      if (m) cur.command = m[1];
    }
  }
  return out;
}

/** Server names configured for more than one agent (surfaced, not auto-resolved). */
export function findConflicts(servers: McpServer[]): string[] {
  const byName = new Map<string, Set<Agent>>();
  for (const s of servers) {
    if (!byName.has(s.name)) byName.set(s.name, new Set());
    byName.get(s.name)!.add(s.agent);
  }
  return [...byName.entries()].filter(([, agents]) => agents.size > 1).map(([name]) => name).sort();
}

/**
 * The config patches that would register framein's OWN MCP server into each CLI. Generated
 * for the user to apply after approval (§6.3) — framein does not write them automatically.
 */
export function frameinMcpRegistration(command = 'framein', args: string[] = ['mcp', 'serve']): { claude: string; codex: string; gemini: string } {
  const json = JSON.stringify({ mcpServers: { framein: { command, args } } }, null, 2);
  const codex = `[mcp_servers.framein]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((a) => JSON.stringify(a)).join(', ')}]`;
  return { claude: json, codex, gemini: json };
}

// --- skills (light: catalog framein's own + recognize Claude SKILL.md frontmatter) ---

export interface SkillInfo { source: string; name: string; description: string; }

export const FRAMEIN_SKILLS: SkillInfo[] = [
  { source: 'framein', name: 'adr-flow', description: 'record a decision as an ADR and re-sync all agents' },
  { source: 'framein', name: 'delegate', description: 'hand a task to another role; it reads the shared store' },
  { source: 'framein', name: 'cross-review', description: 'ask the reviewer role to audit the current change' },
];

/** Parse the `name`/`description` from a SKILL.md YAML-ish frontmatter block. */
export function parseSkillFrontmatter(md: string): { name?: string; description?: string } {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return {};
  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description };
}

// --- best-effort disk layer ---

function tryParse(path: string, parse: (t: string) => McpServer[], into: McpServer[]): void {
  try { if (existsSync(path)) into.push(...parse(readFileSync(path, 'utf8'))); } catch { /* ignore malformed/missing */ }
}

export function detectMcpFromDisk(opts: { cwd?: string; home?: string } = {}): McpServer[] {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const servers: McpServer[] = [];
  tryParse(join(cwd, '.mcp.json'), parseClaudeMcpJson, servers);
  tryParse(join(home, '.codex', 'config.toml'), parseCodexMcpToml, servers);
  tryParse(join(home, '.gemini', 'settings.json'), parseGeminiMcpJson, servers);
  tryParse(join(cwd, '.gemini', 'settings.json'), parseGeminiMcpJson, servers);
  return servers;
}

export function detectSkillsFromDisk(opts: { cwd?: string; home?: string } = {}): SkillInfo[] {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const out: SkillInfo[] = [];
  for (const base of [join(cwd, '.claude', 'skills'), join(home, '.claude', 'skills')]) {
    try {
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const md = join(base, entry.name, 'SKILL.md');
        if (!existsSync(md)) continue;
        const { name, description } = parseSkillFrontmatter(readFileSync(md, 'utf8'));
        out.push({ source: 'claude', name: name ?? entry.name, description: description ?? '' });
      }
    } catch { /* ignore */ }
  }
  return out;
}
