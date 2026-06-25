import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeMcpJson, parseGeminiMcpJson, parseCodexMcpToml, findConflicts, frameinMcpRegistration, parseSkillFrontmatter, FRAMEIN_SKILLS, } from './detect.js';
test('parseClaudeMcpJson reads mcpServers with agent=claude', () => {
    const servers = parseClaudeMcpJson('{"mcpServers":{"github":{"command":"gh-mcp"},"fs":{"command":"fs-mcp"}}}');
    assert.deepEqual(servers, [
        { agent: 'claude', name: 'github', command: 'gh-mcp' },
        { agent: 'claude', name: 'fs', command: 'fs-mcp' },
    ]);
    assert.deepEqual(parseClaudeMcpJson('{}'), []); // no mcpServers key
});
test('parseGeminiMcpJson reads mcpServers with agent=gemini', () => {
    const servers = parseGeminiMcpJson('{"mcpServers":{"search":{"command":"s"}}}');
    assert.deepEqual(servers, [{ agent: 'gemini', name: 'search', command: 's' }]);
});
test('parseCodexMcpToml extracts top-level servers, ignores .env sub-tables', () => {
    const toml = [
        'model = "gpt-5.5"',
        '[mcp_servers.node_repl]',
        "command = 'C:\\repl.exe'", // TOML literal string: backslash kept verbatim
        'args = []',
        '[mcp_servers.node_repl.env]',
        'FOO = "bar"',
        '[mcp_servers.github]',
        'command = "gh-mcp"',
        '[other]',
        'x = 1',
    ].join('\n');
    const servers = parseCodexMcpToml(toml);
    assert.deepEqual(servers, [
        { agent: 'codex', name: 'node_repl', command: 'C:\\repl.exe' }, // one literal backslash
        { agent: 'codex', name: 'github', command: 'gh-mcp' },
    ]);
});
test('parseCodexMcpToml tolerates trailing comments (codex P2)', () => {
    const toml = '[mcp_servers.github] # the gh server\ncommand = "gh-mcp"  # path\n';
    assert.deepEqual(parseCodexMcpToml(toml), [{ agent: 'codex', name: 'github', command: 'gh-mcp' }]);
});
test('findConflicts surfaces names configured for more than one agent', () => {
    const servers = [
        ...parseClaudeMcpJson('{"mcpServers":{"github":{"command":"a"},"only":{"command":"b"}}}'),
        ...parseCodexMcpToml('[mcp_servers.github]\ncommand = "c"'),
    ];
    assert.deepEqual(findConflicts(servers), ['github']);
});
test('frameinMcpRegistration emits valid per-CLI patches (apply-after-review)', () => {
    const reg = frameinMcpRegistration();
    const claude = JSON.parse(reg.claude);
    assert.deepEqual(claude.mcpServers.framein, { command: 'framein', args: ['mcp', 'serve'] });
    assert.equal(reg.claude, reg.gemini); // same JSON shape
    assert.match(reg.codex, /^\[mcp_servers\.framein\]/);
    assert.match(reg.codex, /command = "framein"/);
});
test('parseSkillFrontmatter reads name/description; tolerates none', () => {
    const md = '---\nname: tdd\ndescription: write tests first\n---\n# body';
    assert.deepEqual(parseSkillFrontmatter(md), { name: 'tdd', description: 'write tests first' });
    assert.deepEqual(parseSkillFrontmatter('no frontmatter here'), {});
});
test('framein ships a small built-in skill catalog', () => {
    assert.ok(FRAMEIN_SKILLS.some((s) => s.name === 'adr-flow'));
    assert.ok(FRAMEIN_SKILLS.every((s) => s.source === 'framein' && s.description.length > 0));
});
