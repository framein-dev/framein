// Audit cadence (ADR-0005, F-AUDIT-3): detect "thrash" signals from the task ledger so a
// reviewer can be pulled in only when an agent is going in circles — not on every turn.
// Pure function over ledger entries; thresholds are tunable (PRD §11.8).
export function detectThrash(entries, opts = {}) {
    const editThreshold = opts.repeatedEdits ?? 3;
    const failThreshold = opts.repeatedFailures ?? 2;
    const noProgress = opts.noProgressTurns ?? 5;
    const signals = [];
    const editCounts = new Map();
    const failCounts = new Map();
    for (const e of entries) {
        if (e.kind === 'edit' && e.target)
            editCounts.set(e.target, (editCounts.get(e.target) ?? 0) + 1);
        if (e.kind === 'test-fail' && e.target)
            failCounts.set(e.target, (failCounts.get(e.target) ?? 0) + 1);
    }
    for (const [target, count] of editCounts) {
        if (count >= editThreshold)
            signals.push({ kind: 'repeated-edits', target, count, message: `'${target}' edited ${count}× — possible thrash loop` });
    }
    for (const [target, count] of failCounts) {
        if (count >= failThreshold)
            signals.push({ kind: 'repeated-failure', target, count, message: `'${target}' failed ${count}× — stuck on the same test` });
    }
    // turns accumulated since the last real progress (edit/commit). Other events (ask,
    // test-fail) are neither progress nor turns — they're skipped, not counted.
    let trailingTurns = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
        const k = entries[i].kind;
        if (k === 'edit' || k === 'commit')
            break;
        if (k === 'turn')
            trailingTurns++;
    }
    if (trailingTurns >= noProgress) {
        signals.push({ kind: 'no-progress', count: trailingTurns, message: `${trailingTurns} turns without an edit/commit — may be going in circles` });
    }
    return signals;
}
