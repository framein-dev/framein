// Validation Gate (F-LOOP-2, ADR-0008): "done" is a verified check bundle, not a natural-language
// claim. Pure logic — parse a test runner's output, gate the bundle against the Task Contract, and
// render the ship summary. Actually RUNNING build/test (local, deterministic) and the reviewer's
// model call live in cli.ts; only the latter is the deferred live path.
import { contractIssues } from './task.js';
import { PLAIN, statusTone } from './ui/theme.js';
/** Parse pass/fail counts from common runners (node:test "pass N", jest/vitest "N passed"). */
export function parseTestSummary(output) {
    const t = output ?? '';
    const num = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const passed = num(/\bpass(?:ed|ing)?\s+(\d+)\b/i) ?? num(/\b(\d+)\s+pass(?:ed|ing)?\b/i);
    const failed = num(/\bfail(?:ed|ing|ures)?\s+(\d+)\b/i) ?? num(/\b(\d+)\s+fail(?:ed|ing|ures)?\b/i);
    if (passed === null && failed === null)
        return null;
    return { passed: passed ?? 0, failed: failed ?? 0 };
}
/**
 * Gate the evidence against the contract. Hard checks (build, tests) decide `ready`; the contract's
 * acceptance criteria and unresolved items surface as warnings (they need a reviewer/human, which
 * the gate never auto-claims as verified).
 */
export function gate(contract, bundle) {
    const checks = [];
    const warnings = [];
    if (bundle.build)
        checks.push({ label: 'Build', ok: bundle.build.exitCode === 0, detail: bundle.build.command });
    if (bundle.tests) {
        const s = bundle.tests.summary;
        const ok = bundle.tests.exitCode === 0 && (!s || s.failed === 0);
        checks.push({ label: 'Tests', ok, detail: s ? `${s.passed} passed, ${s.failed} failed` : `exit ${bundle.tests.exitCode}` });
    }
    if (checks.length === 0)
        warnings.push('no build/test commands found — nothing was actually verified');
    if (contract) {
        for (const issue of contractIssues(contract))
            warnings.push(`contract: ${issue}`);
        if (contract.acceptance.length)
            warnings.push(`${contract.acceptance.length} acceptance criteria need verification (reviewer/human)`);
    }
    else {
        warnings.push('no task contract — run `frame start <goal>` to define "done"');
    }
    for (const u of bundle.unresolved ?? [])
        warnings.push(`unresolved: ${u}`);
    return { ready: checks.length > 0 && checks.every((c) => c.ok), checks, warnings };
}
function header(r) {
    if (!r.ready)
        return 'NOT READY';
    return r.warnings.length ? `READY WITH ${r.warnings.length} WARNING${r.warnings.length > 1 ? 'S' : ''}` : 'READY';
}
/** Shared gate body: header + checks + warnings (used by `frame verify`). */
export function renderGate(r, ui = PLAIN) {
    const h = header(r);
    const lines = [ui.tone(h, statusTone(h)), ''];
    for (const c of r.checks) {
        const mark = c.ok ? ui.tone(ui.sym.pass, 'success') : ui.tone(ui.sym.fail, 'danger');
        lines.push(`${mark} ${c.label}${c.detail ? ': ' + c.detail : ''}`);
    }
    for (const w of r.warnings)
        lines.push(`${ui.tone(ui.sym.warn, 'warning')} ${w}`);
    return lines.join('\n');
}
/** Gate body + commit/deploy guidance (used by `frame ship`). */
export function renderShip(r, ui = PLAIN) {
    return [
        renderGate(r, ui),
        '',
        `Safe to commit: ${r.ready ? 'yes' : 'no'}`,
        `Safe to deploy: ${r.ready ? 'requires human confirmation' : 'no'}`,
    ].join('\n');
}
