// Optional interactive `framein` lobby (ADR-0010, layer 4). A zero-dep readline *switchboard*: run framein
// verbs inline, switch the lead agent, and hand the terminal to a lead's NATIVE TUI via stdio:'inherit'
// (framein pauses while the lead drives, resumes on exit). Simultaneous overlay of framein + a live TUI
// would require node-pty (a native dep) — deferred/optional, never bundled (ADR-0010). This module is the
// PURE line router (fully unit-tested); the I/O loop (readline + spawn) is the thin wrapper in cli.ts.
import { AGENTS } from './types.js';
import { isAgent } from './roles.js';
/** Split a lobby line into tokens, honoring "double" and 'single' quotes (quotes stripped) so multi-word
 *  values like `start "add Google login"` survive as one token instead of leaking literal quotes. */
export function tokenizeLine(line) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(line)) !== null)
        tokens.push(m[1] ?? m[2] ?? m[3]);
    return tokens;
}
/** Map one input line to an action. Pure: no I/O, no agent launch — the loop performs the effect. */
export function routeShellLine(line, state) {
    const trimmed = line.trim();
    if (!trimmed)
        return { kind: 'noop' };
    const tokens = tokenizeLine(trimmed);
    const head = tokens[0].toLowerCase();
    const rest = tokens.slice(1);
    if (head === 'exit' || head === 'quit' || head === '/exit' || head === '/quit')
        return { kind: 'exit' };
    if (head === 'help' || head === '/help' || head === '?')
        return { kind: 'help' };
    if (head === '/lead') {
        if (rest.length === 0)
            return { kind: 'pickLead' }; // bare /lead → interactive picker (TTY); printed fallback otherwise
        const agent = rest[0].toLowerCase();
        if (!isAgent(agent))
            return { kind: 'error', message: `Unknown agent '${rest[0]}'. Valid: ${AGENTS.join(', ')}` };
        return { kind: 'setLead', agent };
    }
    if (head === '/go') {
        const prompt = rest.join(' ').trim();
        return { kind: 'launchLead', agent: state.lead, prompt: prompt || undefined };
    }
    if (head === '/trust')
        return { kind: 'toggleTrust' }; // arm/disarm permission-bypass for the next /go (time-boxed)
    // A bare agent name (optionally with a prompt) switches to + launches that agent's native TUI.
    if (isAgent(head)) {
        const prompt = rest.join(' ').trim();
        return { kind: 'launchLead', agent: head, prompt: prompt || undefined };
    }
    // Otherwise it's a framein command — `/verify` and `verify` both reach the engine.
    const verb = head.startsWith('/') ? head.slice(1) : head;
    if (verb === 'lobby' || verb === 'shell')
        return { kind: 'error', message: 'Already in the lobby.' };
    return { kind: 'engine', args: [verb, ...rest] };
}
/** Rows for the context card shown right before handing the terminal to a lead's native TUI (`/go`).
 *  Pure: the loop reads these from the store and renders them, so the user carries intent INTO the
 *  native UI. We surface state here; we never screen-scrape the TUI itself (ADR-0009). */
export function handoffCardRows(info) {
    const rows = [['lead', info.lead]];
    if (info.reviewer)
        rows.push(['reviewer', info.reviewer]);
    rows.push(['task', info.goal && info.goal.trim() ? info.goal : 'no active contract']);
    if (info.lastGreen)
        rows.push(['last green', info.lastGreen]);
    if (info.blocker)
        rows.push(['blocker', info.blocker]);
    return rows;
}
export function renderShellHelp() {
    return [
        'framein lobby — your switchboard for AI coding. The leading / is optional. Every verb is',
        'deterministic and LOCAL: you don’t need an agent to run one (the agent just decides when to).',
        '',
        '  Lobby-only — choose who drives & hand off (these live in the lobby, not inside agents):',
        '    /lead                switch the lead agent (↑↓ · type to filter · enter)',
        '    /go [task]           hand the terminal to the lead — work there, exit (Ctrl-D) to return',
        '    /trust               arm/disarm permission-bypass for /go (off by default · 30m)',
        '    /exit                leave the lobby (or Ctrl-D on an empty line)',
        `    ${AGENTS.join(' · ')}   shortcut: jump straight into that agent (e.g. \`codex fix the bug\`)`,
        '',
        '  framein verbs — run here, inside your agent (/fr:verify · $fr-verify), or as `framein <verb>`:',
        '    start <goal>         define what “done” means — the Task Contract',
        '    verify               run build/test, check validation against the contract',
        '    ship                 deployment-readiness gate (blocks if not ready)',
        '    risk                 blast-radius of the current change',
        '    rescue               stuck in a fix-loop? show the loop + safe options',
        '    challenge · decide   have another model argue a proposal, then you rule',
        '    task · capsule       show/amend the contract · carry state across a model switch',
        '    status               project · contract · state',
        '',
        '  Also in the lobby / terminal (not wrapped into agents): init · stats · explain',
        '',
        'Tip: type / to browse (filters as you type · ↑↓ to pick · ⏎ runs) · full list: framein --help · manual: docs/MANUAL.md',
    ].join('\n');
}
/** Verbs offered by lobby Tab-completion (a friendly subset of the full CLI surface). */
export const LOBBY_VERBS = ['init', 'start', 'verify', 'ship', 'rescue', 'status', 'stats', 'explain', 'risk', 'task', 'checkpoint', 'capsule'];
const LOBBY_COMMANDS = [...LOBBY_VERBS, ...LOBBY_VERBS.map((v) => `/${v}`), '/lead', '/go', '/trust', '/help', 'exit', 'quit'];
/** readline completer for the lobby line editor (pure). Completes agent names after `/lead `, otherwise
 *  the first token against the verb / slash-command list. Returns [matches, fragmentBeingCompleted]. */
export function lobbyCompleter(line) {
    const lead = line.match(/^\/lead\s+(\S*)$/i);
    if (lead) {
        const frag = lead[1];
        const hits = AGENTS.filter((a) => a.startsWith(frag.toLowerCase()));
        return [hits.length ? hits : AGENTS.slice(), frag];
    }
    const hits = LOBBY_COMMANDS.filter((c) => c.startsWith(line));
    return [hits, line];
}
/** Commands shown in the lobby's live `/` palette (the inline menu opened by typing `/`). All slash-
 *  prefixed for consistency; the leading `/` is what surfaces the menu. Curated to what's actually
 *  useful FROM the lobby — the deterministic checks ("local, no agent" → they run without an LLM) plus
 *  the switchboard verbs. The real coding happens after /go, inside the lead's own UI. (palette.ts) */
export const LOBBY_PALETTE = [
    { cmd: '/go', desc: 'hand the terminal to the lead agent — where the coding happens' },
    { cmd: '/lead', desc: 'switch the lead agent (claude · codex · gemini)' },
    { cmd: '/trust', desc: 'arm/disarm permission-bypass for /go (time-boxed)' },
    { cmd: '/status', desc: 'project · contract · state (local, no agent)' },
    { cmd: '/verify', desc: 'run build/test, check validation vs the contract (local, no agent)' },
    { cmd: '/ship', desc: 'deployment-readiness check (local, no agent)' },
    { cmd: '/risk', desc: 'blast-radius of the current changes (local, no agent)' },
    { cmd: '/rescue', desc: 'stuck? detect the loop + get options (local, no agent)' },
    { cmd: '/init', desc: 'set up framein in this folder' },
    { cmd: '/help', desc: 'all commands' },
    { cmd: '/exit', desc: 'leave the lobby' },
];
