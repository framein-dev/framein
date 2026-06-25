// ADR digest: a compact index embedded into the projected native files.
// Full ADRs live in the store (queried live via MCP); files carry only a digest.
export function buildAdrDigest(adrs, opts = {}) {
    if (adrs.length === 0)
        return '_No decisions recorded yet._';
    const max = opts.max ?? 10;
    // Derived (append-only): an ADR is superseded only if a LATER one references it.
    const supersededIds = new Set(adrs.filter((a) => a.supersedes != null && a.id > a.supersedes).map((a) => a.supersedes));
    const recent = [...adrs].sort((a, b) => b.id - a.id).slice(0, max);
    const lines = recent.map((a) => {
        const status = supersededIds.has(a.id) ? 'superseded' : a.status;
        return `- [ADR-${a.id}] ${a.title} (${status})`;
    });
    const overflow = adrs.length > recent.length
        ? `\n- …and ${adrs.length - recent.length} earlier decision(s)` : '';
    return `${adrs.length} decision(s) recorded. Latest:\n${lines.join('\n')}${overflow}`;
}
