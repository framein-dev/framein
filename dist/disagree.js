// Disagreement Protocol (F-LOOP-5, ADR-0008): bound model-vs-model debate so it converges instead
// of looping. A proposal is met with at most `maxRounds` blocking challenges; the reviewer returns
// CLAIMS + a required change (never edits — the lead keeps control); no agreement after the cap
// escalates to the human with exactly two options. Pure state machine; the model-authored content
// of each turn is the deferred live path.
import { PLAIN } from './ui/theme.js';
export const MAX_ROUNDS = 2;
export function newDebate(topic, proposal, maxRounds = MAX_ROUNDS) {
    return { topic, entries: [{ kind: 'proposal', proposal }], maxRounds };
}
export function challengeCount(d) {
    return d.entries.filter((e) => e.kind === 'challenge').length;
}
function leadPosition(d) {
    for (let i = d.entries.length - 1; i >= 0; i--) {
        const e = d.entries[i];
        if (e.kind === 'revision')
            return e.revision.text || d.topic;
        if (e.kind === 'response')
            return e.response.proposedRevision ?? e.response.text ?? d.topic;
        if (e.kind === 'proposal')
            return e.proposal.text;
    }
    return d.topic;
}
function reviewerRequirement(d) {
    for (let i = d.entries.length - 1; i >= 0; i--) {
        const e = d.entries[i];
        if (e.kind === 'challenge' && e.challenge.verdict === 'challenge')
            return e.challenge.requiredChange ?? e.challenge.claim;
    }
    return undefined;
}
export function debateStatus(d) {
    const last = d.entries[d.entries.length - 1];
    const rounds = challengeCount(d);
    const escalate = () => ({
        state: 'escalate',
        reason: `no agreement after ${rounds} round${rounds === 1 ? '' : 's'} (max ${d.maxRounds})`,
        options: [`A: ${leadPosition(d)}`, `B: ${reviewerRequirement(d) ?? 'reviewer change'}`],
    });
    if (!last || last.kind === 'proposal')
        return { state: 'awaiting-challenge' };
    if (last.kind === 'challenge') {
        if (last.challenge.verdict === 'accept')
            return { state: 'resolved', how: 'accepted-by-reviewer' };
        if (rounds >= d.maxRounds)
            return escalate();
        return { state: 'awaiting-revision', required: last.challenge.requiredChange };
    }
    if (last.kind === 'response') {
        if (rounds >= d.maxRounds)
            return escalate();
        return { state: 'awaiting-decision', required: reviewerRequirement(d) };
    }
    // last is a revision
    if (last.revision.accepted)
        return { state: 'resolved', how: 'lead-accepted' };
    if (rounds >= d.maxRounds)
        return escalate();
    return { state: 'awaiting-challenge' };
}
export function renderDebate(d, ui = PLAIN) {
    const lines = [`Debate: ${d.topic}`, ''];
    for (const e of d.entries) {
        if (e.kind === 'proposal')
            lines.push(`proposal${e.proposal.by ? ` (${e.proposal.by})` : ''}: ${e.proposal.text}`);
        else if (e.kind === 'challenge') {
            const c = e.challenge;
            lines.push(c.verdict === 'accept'
                ? `challenge${c.by ? ` (${c.by})` : ''}: accept`
                : `challenge${c.by ? ` (${c.by})` : ''}: ${c.claim ?? ''}${c.requiredChange ? ` → require: ${c.requiredChange}` : ''}`);
            if (c.basis?.length)
                lines.push(`  basis: ${c.basis.join(', ')}`);
            if (c.missingEvidence?.length)
                lines.push(`  missing_evidence: ${c.missingEvidence.join('; ')}`);
        }
        else if (e.kind === 'response') {
            const r = e.response;
            lines.push(`response${r.by ? ` (${r.by})` : ''}: ${r.text}`);
            if (r.proposedRevision)
                lines.push(`  proposed_revision: ${r.proposedRevision}`);
            if (r.acceptsRequiredChange !== undefined)
                lines.push(`  accepts_required_change: ${r.acceptsRequiredChange ? 'yes' : 'no'}`);
        }
        else {
            lines.push(`revision: ${e.revision.accepted ? 'accepted' : 'rejected'}${e.revision.text ? ` — ${e.revision.text}` : ''}`);
        }
    }
    lines.push('');
    const st = debateStatus(d);
    if (st.state === 'resolved')
        lines.push(ui.tone(`Resolved (${st.how}).`, 'success'));
    else if (st.state === 'escalate') {
        lines.push(ui.tone(`Escalate to human — ${st.reason}:`, 'warning'));
        for (const o of st.options)
            lines.push(`  ${o}`);
    }
    else if (st.state === 'awaiting-decision')
        lines.push(ui.tone(`Awaiting lead decision${st.required ? ` (reviewer requires: ${st.required})` : ''}.`, 'info'));
    else if (st.state === 'awaiting-revision')
        lines.push(ui.tone(`Awaiting lead revision${st.required ? ` (required: ${st.required})` : ''}.`, 'info'));
    else
        lines.push(ui.tone('Awaiting reviewer challenge.', 'info'));
    return lines.join('\n');
}
