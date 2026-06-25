import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyJsonMcp, applyCodexMcp, parseClaudeMcpList, resolveFrameinEntry } from './mcpRegister.js';
test('resolveFrameinEntry: framein-on-PATH uses `framein`, else node + absolute cli path', () => {
    assert.deepEqual(resolveFrameinEntry(true, 'C:/x/dist/cli.js'), { command: 'framein', args: ['mcp', 'serve'] });
    assert.deepEqual(resolveFrameinEntry(false, 'C:/x/dist/cli.js'), { command: 'node', args: ['C:/x/dist/cli.js', 'mcp', 'serve'] });
});
// --- JSON configs (Claude .mcp.json, Gemini settings.json) ---
test('applyJsonMcp: creates the framein entry from empty/null', () => {
    const out = JSON.parse(applyJsonMcp(null));
    assert.deepEqual(out.mcpServers.framein, { command: 'framein', args: ['mcp', 'serve'] });
});
test('applyJsonMcp: preserves other servers and top-level keys; idempotent', () => {
    const existing = JSON.stringify({
        theme: 'dark',
        mcpServers: { fs: { command: 'npx', args: ['fs'] } },
    });
    const once = applyJsonMcp(existing);
    const out = JSON.parse(once);
    assert.equal(out.theme, 'dark'); // unrelated top-level key preserved
    assert.deepEqual(out.mcpServers.fs, { command: 'npx', args: ['fs'] }); // other server preserved
    assert.deepEqual(out.mcpServers.framein, { command: 'framein', args: ['mcp', 'serve'] });
    assert.equal(applyJsonMcp(once), once); // applying again is a no-op
});
test('applyJsonMcp: updates a stale framein entry in place (no duplicate)', () => {
    const stale = JSON.stringify({ mcpServers: { framein: { command: 'old', args: [] } } });
    const out = JSON.parse(applyJsonMcp(stale));
    assert.deepEqual(out.mcpServers.framein, { command: 'framein', args: ['mcp', 'serve'] });
    assert.equal(Object.keys(out.mcpServers).length, 1);
});
// --- TOML config (Codex ~/.codex/config.toml), text-merge, zero-dep ---
test('applyCodexMcp: appends a [mcp_servers.framein] table to empty input', () => {
    const out = applyCodexMcp(null);
    assert.match(out, /\[mcp_servers\.framein\]/);
    assert.match(out, /command = "framein"/);
    assert.match(out, /args = \["mcp", "serve"\]/);
});
test('applyCodexMcp: preserves existing tables; idempotent', () => {
    const existing = 'model = "gpt-5.5"\n\n[mcp_servers.other]\ncommand = "x"\n';
    const once = applyCodexMcp(existing);
    assert.match(once, /model = "gpt-5\.5"/); // top-level preserved
    assert.match(once, /\[mcp_servers\.other\]/); // other server preserved
    assert.match(once, /\[mcp_servers\.framein\]/);
    assert.equal(applyCodexMcp(once), once); // idempotent
    // exactly one framein table
    assert.equal((once.match(/\[mcp_servers\.framein\]/g) ?? []).length, 1);
});
test('applyCodexMcp: replaces a stale framein block without duplicating or eating neighbors', () => {
    const stale = '[mcp_servers.framein]\ncommand = "old"\nargs = []\n\n[mcp_servers.keep]\ncommand = "k"\n';
    const out = applyCodexMcp(stale);
    assert.equal((out.match(/\[mcp_servers\.framein\]/g) ?? []).length, 1);
    assert.match(out, /command = "framein"/);
    assert.doesNotMatch(out, /command = "old"/);
    assert.match(out, /\[mcp_servers\.keep\]/); // following table survived
    assert.match(out, /command = "k"/);
});
// --- verify parser for `claude mcp list` output ---
test('parseClaudeMcpList: connected / failed / registered / absent', () => {
    assert.equal(parseClaudeMcpList('framein: frame mcp serve - ✓ Connected'), 'connected');
    assert.equal(parseClaudeMcpList('framein: frame mcp serve - ✗ Failed to connect'), 'failed');
    assert.equal(parseClaudeMcpList('framein: frame mcp serve'), 'registered'); // listed, no health marker
    assert.equal(parseClaudeMcpList('fs: npx fs - ✓ Connected'), 'absent'); // framein not present
    // realistic multi-line output, framein among others
    const out = 'Checking MCP server health...\n\nfs: npx fs - ✓ Connected\nframein: frame mcp serve - ✓ Connected\n';
    assert.equal(parseClaudeMcpList(out), 'connected');
});
