// Managed-block upsert: framein owns only the region between its markers.
// Everything a user writes outside the markers is preserved across re-projection.
//
// Robustness (see codex review): markers are matched as EXACT FULL LINES, malformed
// states (dangling / reversed / duplicate markers) are cleaned to a single canonical
// block without losing user text, and marker strings that appear inside the core data
// are defanged so they can never be mistaken for real markers.
export const MANAGED_BEGIN = '<!-- framein:begin — managed by `frame`; edits inside are overwritten. Source: .frame/store.db -->';
export const MANAGED_END = '<!-- framein:end -->';
function isMarker(line, marker) {
    return line.trim() === marker;
}
/** Neutralize any core line that IS exactly a marker, so it cannot be parsed as one. */
function defangMarkerLines(core) {
    return core.split('\n').map((ln) => {
        const t = ln.trim();
        return t === MANAGED_BEGIN || t === MANAGED_END ? ln.replace('<!--', '&lt;!--') : ln;
    }).join('\n');
}
/** Wrap the core block in the managed markers. Identical across all three files. */
export function wrapManaged(coreBlock) {
    return `${MANAGED_BEGIN}\n${defangMarkerLines(coreBlock)}\n${MANAGED_END}`;
}
/** All well-formed [begin,end] line-index regions, paired greedily. */
function findRegions(lines) {
    const regions = [];
    let i = 0;
    while (i < lines.length) {
        if (isMarker(lines[i], MANAGED_BEGIN)) {
            let j = i + 1;
            while (j < lines.length && !isMarker(lines[j], MANAGED_END))
                j++;
            if (j < lines.length) {
                regions.push([i, j]);
                i = j + 1;
                continue;
            }
        }
        i++;
    }
    return regions;
}
/** Count of lines that are exactly a begin or end marker. */
function markerLineCount(lines) {
    return lines.filter((l) => isMarker(l, MANAGED_BEGIN) || isMarker(l, MANAGED_END)).length;
}
/** Remove every well-formed managed region and any stray marker lines; preserve the rest. */
export function stripManagedBlocks(content) {
    const lines = content.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (isMarker(lines[i], MANAGED_BEGIN)) {
            let j = i + 1;
            while (j < lines.length && !isMarker(lines[j], MANAGED_END))
                j++;
            if (j < lines.length) {
                i = j;
                continue;
            } // drop a full region
            continue; // dangling begin: drop just this line
        }
        if (isMarker(lines[i], MANAGED_END))
            continue; // stray end: drop just this line
        out.push(lines[i]);
    }
    return out.join('\n');
}
/** The single well-formed managed region (markers inclusive), or null. */
export function extractManagedBlock(content) {
    const lines = content.split('\n');
    const regions = findRegions(lines);
    if (regions.length === 0)
        return null;
    const [b, e] = regions[0];
    return lines.slice(b, e + 1).join('\n');
}
/**
 * Insert or replace the managed block in `existing`, preserving everything outside it.
 *
 * - null/empty existing            → fresh file: `# <title>` heading + the managed block.
 * - exactly one clean region       → replace it IN PLACE (outside bytes preserved exactly).
 * - malformed (dangling/reversed/duplicate/stray markers) → clean all of them and append a
 *   single canonical block; subsequent runs see one clean region and are fully idempotent.
 *
 * `managed` must be the output of wrapManaged() (markers included).
 */
export function upsertManagedBlock(existing, title, managed) {
    if (existing == null || existing.trim() === '') {
        return `# ${title}\n\n${managed}\n`;
    }
    const lines = existing.split('\n');
    const regions = findRegions(lines);
    const healthySingle = regions.length === 1 && markerLineCount(lines) === 2;
    if (healthySingle) {
        const [b, e] = regions[0];
        return [...lines.slice(0, b), ...managed.split('\n'), ...lines.slice(e + 1)].join('\n');
    }
    // malformed or empty-of-user-text: rebuild cleanly without losing content
    const body = stripManagedBlocks(existing).replace(/\s*$/, '');
    return `${body === '' ? `# ${title}` : body}\n\n${managed}\n`;
}
