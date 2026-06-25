// Thin framein MCP surface (F-OWN-1): the minimum tools agents need to share the store.
// `handleTool` maps a tool call to a store op (unit-tested); `dispatch` handles one JSON-RPC
// message; `serve` is the stdio loop. The wire format is newline-delimited JSON (NDJSON) —
// that IS the MCP stdio transport (ADR-0007). MCP stdio is NOT Content-Length framed (that's
// LSP); headers only appear in MCP's separate Streamable HTTP transport. Live MCP-CLIENT
// wiring (each CLI launching its own `frame mcp serve`) is the orchestration layer (B).

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { Store } from './store.js';
import type { Role } from './types.js';

export interface Tool {
  name: string;
  description: string;
  // MCP requires every tool to declare a JSON Schema for its arguments, or clients ignore it.
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Tool['inputSchema'] =>
  ({ type: 'object', properties, required });
const str = { type: 'string' };

export const TOOLS: Tool[] = [
  { name: 'append_adr', description: 'record an ADR', inputSchema: obj({ title: str, decision: str, context: str, consequences: str }, ['title']) },
  { name: 'list_adr', description: 'list all ADRs', inputSchema: obj({}) },
  { name: 'get_adr', description: 'get one ADR', inputSchema: obj({ id: { type: 'number' } }, ['id']) },
  { name: 'read_memory', description: 'read scoped memory', inputSchema: obj({ scope: str, key: str }, ['scope', 'key']) },
  { name: 'write_memory', description: 'write scoped memory', inputSchema: obj({ scope: str, key: str, value: {} }, ['scope', 'key', 'value']) },
  { name: 'list_memory', description: 'list a memory scope', inputSchema: obj({ scope: str }, ['scope']) },
  { name: 'get_role', description: 'agent assigned to a role', inputSchema: obj({ role: str }, ['role']) },
  { name: 'get_roles', description: 'all role assignments', inputSchema: obj({}) },
  { name: 'acquire_lock', description: 'acquire the write lock', inputSchema: obj({ holder: str, scope: str }, ['holder']) },
  { name: 'release_lock', description: 'release the write lock', inputSchema: obj({ holder: str, scope: str }, ['holder']) },
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

/** Protocol versions we accept, newest first. Negotiation echoes the client's if supported. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
// Advertised to clients; keep loosely in sync with package.json (a string is required by spec).
const SERVER_INFO = { name: 'framein', version: '0.0.1' };

export function handleTool(store: Store, name: string, args: Record<string, unknown> = {}): unknown {
  switch (name) {
    case 'append_adr': {
      const title = String(args.title ?? '');
      if (!title) throw new Error('append_adr requires a title');
      const a = store.appendAdr({
        title,
        decision: String(args.decision ?? title),
        context: args.context as string | undefined,
        consequences: args.consequences as string | undefined,
      });
      return { id: a.id };
    }
    case 'list_adr': return store.listAdrs();
    case 'get_adr': return store.getAdr(Number(args.id)) ?? null;
    case 'read_memory': return store.getMemory(String(args.scope), String(args.key)) ?? null;
    case 'write_memory': store.setMemory(String(args.scope), String(args.key), args.value); return { ok: true };
    case 'list_memory': return store.listMemory(String(args.scope));
    case 'get_role': return store.getRole(args.role as Role) ?? null;
    case 'get_roles': return store.getRoles();
    case 'acquire_lock': return { acquired: store.acquireLock(String(args.holder), { scope: args.scope as string | undefined }) };
    case 'release_lock': return { released: store.releaseLock(String(args.holder), { scope: args.scope as string | undefined }) };
    default: throw new Error(`unknown tool: ${name}`);
  }
}

/** Per-connection state. `serve` tracks one; pass it to enforce the initialize-first ordering. */
export interface Session { initialized: boolean; }

/**
 * Dispatch one parsed JSON-RPC value. Never throws. Returns a reply object for requests, or
 * `null` for notifications and for anything we can't reply to (no id). When a `session` is
 * supplied, the initialize-first lifecycle is enforced (ADR-0007); without one, dispatch stays
 * lenient (used by unit tests). `initialize` and `ping` are always allowed pre-init.
 */
export function dispatch(store: Store, req: unknown, session?: Session): object | null {
  const isObj = typeof req === 'object' && req !== null && !Array.isArray(req);
  const r = (isObj ? req : {}) as { id?: unknown; method?: unknown; params?: unknown };
  const hasId = isObj && 'id' in r && r.id !== null && r.id !== undefined;
  const id = hasId ? (r.id as string | number) : null;
  const params = (typeof r.params === 'object' && r.params !== null ? r.params : {}) as { name?: unknown; arguments?: unknown; protocolVersion?: unknown };
  const reply = (result: unknown) => (hasId ? { jsonrpc: '2.0', id, result } : null);
  const errReply = (code: number, message: string) => (hasId ? { jsonrpc: '2.0', id, error: { code, message } } : null);

  if (typeof r.method !== 'string') return errReply(-32600, 'invalid request');
  const method = r.method;

  // Lifecycle methods allowed before initialization completes.
  if (method === 'notifications/initialized') { if (session) session.initialized = true; return null; }
  if (method === 'initialize') {
    if (session) session.initialized = false; // re-init resets; the initialized notification re-arms it
    const want = params.protocolVersion;
    const protocolVersion = typeof want === 'string' && PROTOCOL_VERSIONS.includes(want) ? want : PROTOCOL_VERSIONS[0];
    return reply({ protocolVersion, serverInfo: SERVER_INFO, capabilities: { tools: { listChanged: false } } });
  }
  if (method === 'ping') return reply({});

  if (session && !session.initialized) return errReply(-32600, 'received request before initialization');

  try {
    switch (method) {
      case 'tools/list': return reply({ tools: TOOLS });
      case 'tools/call': {
        const name = params.name;
        if (typeof name !== 'string' || !TOOL_NAMES.has(name)) return errReply(-32602, `unknown tool: ${String(name)}`);
        const args = (typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : {}) as Record<string, unknown>;
        try {
          const out = handleTool(store, name, args);
          return reply({ content: [{ type: 'text', text: JSON.stringify(out) }], isError: false });
        } catch (e) {
          // Tool EXECUTION errors stay in-band (isError) so the model sees them and can recover.
          return reply({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
        }
      }
      default: return errReply(-32601, `unknown method: ${method}`);
    }
  } catch (e) {
    return errReply(-32603, (e as Error).message);
  }
}

/**
 * MCP stdio loop: newline-delimited JSON-RPC over stdin/stdout (the MCP stdio transport — not
 * Content-Length framing, ADR-0007). A malformed line is answered with a JSON-RPC parse error
 * (-32700), not silently dropped. Only valid MCP messages are written to `output` (stdout
 * hygiene); diagnostics belong on stderr. Consumes input until EOF.
 */
export async function serve(store: Store, input: Readable = process.stdin, output: Writable = process.stdout): Promise<void> {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const session: Session = { initialized: false };
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    let req: unknown;
    try {
      req = JSON.parse(t);
    } catch {
      output.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n');
      continue;
    }
    const res = dispatch(store, req, session);
    if (res) output.write(JSON.stringify(res) + '\n');
  }
}
