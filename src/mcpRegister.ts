// Apply step of the MCP registration flow (§6.3: detect -> propose -> APPLY approved -> verify).
// Pure, idempotent config-merge writers that ADD framein's own MCP server into each CLI's config
// without clobbering anything else (same safety contract as managedBlock, ADR-0007 B-1). The
// actual file write + live `claude mcp list` spawn live in cli.ts; only the parser below is pure.
// Zero-dep: JSON via JSON.parse/stringify, TOML via a line-based text merge (no TOML serializer).

export interface McpEntry { command: string; args: string[]; }

/** framein registers itself as a subprocess MCP server each CLI launches (ADR-0007). */
export const FRAMEIN_ENTRY: McpEntry = { command: 'framein', args: ['mcp', 'serve'] };

/**
 * Pick the spawn command the agent CLIs should use to launch framein's MCP server: the canonical
 * `framein` bin when it's on PATH (installed product), else `node <abs cli.js>` (dev / not globally
 * installed). The agent spawns this verbatim, so it MUST resolve to a real executable.
 */
export function resolveFrameinEntry(frameOnPath: boolean, cliPath: string): McpEntry {
  return frameOnPath ? { command: 'framein', args: ['mcp', 'serve'] } : { command: 'node', args: [cliPath, 'mcp', 'serve'] };
}

/**
 * Merge `mcpServers.<name>` into a JSON config (Claude `.mcp.json`, Gemini `settings.json`),
 * preserving every other key and server. Idempotent. Reformats with 2-space indent.
 */
export function applyJsonMcp(existing: string | null, name = 'framein', entry: McpEntry = FRAMEIN_ENTRY): string {
  let root: Record<string, unknown> = {};
  if (existing && existing.trim()) {
    const parsed = JSON.parse(existing) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) root = parsed as Record<string, unknown>;
  }
  const prev = root.mcpServers;
  const servers = prev && typeof prev === 'object' && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {};
  servers[name] = { command: entry.command, args: entry.args };
  root.mcpServers = servers;
  return JSON.stringify(root, null, 2) + '\n';
}

/**
 * Merge a `[mcp_servers.<name>]` table into a Codex `config.toml` as text: replace the existing
 * block (header line through the next table header / EOF) if present, else append. Idempotent.
 * Preserves all other content; only the framein table is rewritten.
 */
export function applyCodexMcp(existing: string | null, name = 'framein', entry: McpEntry = FRAMEIN_ENTRY): string {
  const header = `[mcp_servers.${name}]`;
  const block = [
    header,
    `command = ${JSON.stringify(entry.command)}`,
    `args = [${entry.args.map((a) => JSON.stringify(a)).join(', ')}]`,
  ];
  const text = existing ?? '';
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === header);

  if (start === -1) {
    const base = text.trim();
    return (base ? base + '\n\n' : '') + block.join('\n') + '\n';
  }

  // Block ends at the next table header (any `[...]`) or EOF.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) { end = i; break; }
  }
  const before = lines.slice(0, start);
  const after = lines.slice(end);
  const sep = after.length && after[0].trim() !== '' ? [''] : []; // keep a blank line before a following table
  return [...before, ...block, ...sep, ...after].join('\n').replace(/\n*$/, '\n');
}

export type McpConnState = 'connected' | 'failed' | 'registered' | 'absent';

/**
 * Read the connection state of a server from `claude mcp list` output. `connected`/`failed` when
 * a health marker (✓/✗) is shown, `registered` when listed without one, `absent` when not found.
 * (The verify step; the spawn that produces `output` is the live B-layer piece.)
 */
export function parseClaudeMcpList(output: string, name = 'framein'): McpConnState {
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    if (line.slice(0, colon).trim() !== name) continue;
    if (/✗|✘|fail/i.test(line)) return 'failed';
    if (/✓|✔|connected/i.test(line)) return 'connected';
    return 'registered';
  }
  return 'absent';
}
