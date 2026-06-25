import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { Store } from './store.js';
import { handleTool, dispatch, serve, TOOLS, PROTOCOL_VERSIONS } from './mcpServer.js';
test('handleTool: append_adr then list/get', () => {
    const s = Store.open();
    const r = handleTool(s, 'append_adr', { title: 'Use X', decision: 'x' });
    assert.equal(r.id, 1);
    assert.equal(handleTool(s, 'list_adr').length, 1);
    assert.equal(handleTool(s, 'get_adr', { id: 1 }).title, 'Use X');
    s.close();
});
test('handleTool: memory round-trip and roles', () => {
    const s = Store.open();
    handleTool(s, 'write_memory', { scope: 'project', key: 'k', value: { a: 1 } });
    assert.deepEqual(handleTool(s, 'read_memory', { scope: 'project', key: 'k' }), { a: 1 });
    s.setRole('implementer', 'claude');
    assert.equal(handleTool(s, 'get_role', { role: 'implementer' }), 'claude');
    s.close();
});
test('handleTool: write lock through the MCP surface', () => {
    const s = Store.open();
    assert.deepEqual(handleTool(s, 'acquire_lock', { holder: 'a' }), { acquired: true });
    assert.deepEqual(handleTool(s, 'acquire_lock', { holder: 'b' }), { acquired: false });
    assert.deepEqual(handleTool(s, 'release_lock', { holder: 'a' }), { released: true });
    s.close();
});
test('handleTool: unknown tool throws', () => {
    const s = Store.open();
    assert.throws(() => handleTool(s, 'nope'), /unknown tool/);
    s.close();
});
test('dispatch: JSON-RPC tools/list and tools/call shapes', () => {
    const s = Store.open();
    const list = dispatch(s, { id: 1, method: 'tools/list' });
    assert.equal(list.result.tools.length, TOOLS.length);
    const call = dispatch(s, { id: 2, method: 'tools/call', params: { name: 'append_adr', arguments: { title: 'T' } } });
    assert.equal(call.id, 2);
    assert.match(call.result.content[0].text, /"id":1/);
    const err = dispatch(s, { id: 3, method: 'bogus' });
    assert.match(err.error.message, /unknown method/);
    // a notification (no id) for an unknown method yields no response
    assert.equal(dispatch(s, { method: 'note/ping' }), null);
    s.close();
});
test('dispatch: malformed input never crashes (codex P1)', () => {
    const s = Store.open();
    for (const bad of [null, 1, 'x', [], { id: 1 }, { method: 5 }]) {
        assert.doesNotThrow(() => dispatch(s, bad));
    }
    // a non-object / no-id value yields no response (cannot reply without an id)
    assert.equal(dispatch(s, null), null);
    assert.equal(dispatch(s, 1), null);
    // a tools/call NOTIFICATION (no id) still runs the side effect but returns nothing
    assert.equal(dispatch(s, { method: 'tools/call', params: { name: 'append_adr', arguments: { title: 'N' } } }), null);
    assert.equal(s.listAdrs().length, 1);
    s.close();
});
test('write_memory through MCP rejects prototype-polluting keys (codex P2)', () => {
    const s = Store.open();
    assert.throws(() => handleTool(s, 'write_memory', { scope: 'project', key: '__proto__', value: { x: 1 } }), /unsafe key/);
    s.close();
});
// --- MCP spec compliance (ADR-0007) ---
test('tools/list: every tool carries an object inputSchema (MCP requires it)', () => {
    const s = Store.open();
    const list = dispatch(s, { id: 1, method: 'tools/list' });
    assert.equal(list.result.tools.length, TOOLS.length);
    for (const t of list.result.tools)
        assert.equal(t.inputSchema.type, 'object');
    const adr = list.result.tools.find((t) => t.name === 'append_adr');
    assert.deepEqual(adr.inputSchema.required, ['title']);
    s.close();
});
test('initialize: negotiates protocol version, string serverInfo.version, tools capability', () => {
    const s = Store.open();
    const ok = dispatch(s, { id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    assert.equal(ok.result.protocolVersion, '2024-11-05'); // supported → echoed
    assert.equal(typeof ok.result.serverInfo.version, 'string');
    assert.equal(ok.result.capabilities.tools.listChanged, false);
    const fallback = dispatch(s, { id: 2, method: 'initialize', params: { protocolVersion: '1.0.0' } });
    assert.equal(fallback.result.protocolVersion, PROTOCOL_VERSIONS[0]); // unsupported → server latest
    s.close();
});
test('ping: replies with an empty result', () => {
    const s = Store.open();
    assert.deepEqual(dispatch(s, { id: 9, method: 'ping' }).result, {});
    s.close();
});
test('tools/call: unknown tool / missing name are -32602; exec failure is isError (not a protocol error)', () => {
    const s = Store.open();
    const unknown = dispatch(s, { id: 1, method: 'tools/call', params: { name: 'nope', arguments: {} } });
    assert.equal(unknown.error.code, -32602);
    const noName = dispatch(s, { id: 2, method: 'tools/call', params: { arguments: {} } });
    assert.equal(noName.error.code, -32602);
    const failed = dispatch(s, { id: 3, method: 'tools/call', params: { name: 'append_adr', arguments: {} } });
    assert.equal(failed.result.isError, true); // execution error stays in-band so the model can recover
    assert.match(failed.result.content[0].text, /title/);
    const ok = dispatch(s, { id: 4, method: 'tools/call', params: { name: 'append_adr', arguments: { title: 'T' } } });
    assert.equal(ok.result.isError, false);
    s.close();
});
test('dispatch: initialization ordering is enforced when a session is tracked', () => {
    const s = Store.open();
    const session = { initialized: false };
    const early = dispatch(s, { id: 1, method: 'tools/list' }, session);
    assert.equal(early.error.code, -32600); // request before initialize → rejected
    assert.deepEqual(dispatch(s, { id: 2, method: 'ping' }, session).result, {}); // ping allowed pre-init
    dispatch(s, { id: 3, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, session);
    dispatch(s, { method: 'notifications/initialized' }, session);
    assert.equal(session.initialized, true);
    const list = dispatch(s, { id: 4, method: 'tools/list' }, session);
    assert.equal(list.result.tools.length, TOOLS.length); // now allowed
    s.close();
});
test('serve: NDJSON round-trip over streams + -32700 on a malformed line', async () => {
    const s = Store.open();
    const input = Readable.from([[
            JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }),
            JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
            'this is not json',
            JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        ].join('\n') + '\n']);
    const chunks = [];
    const output = new Writable({ write(chunk, _enc, cb) { chunks.push(String(chunk)); cb(); } });
    await serve(s, input, output);
    const msgs = chunks.join('').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(msgs[0].id, 1);
    assert.equal(msgs[0].result.protocolVersion, '2025-06-18');
    assert.ok(msgs.some((m) => m.error?.code === -32700)); // malformed line answered, not silently dropped
    const list = msgs.find((m) => m.id === 2);
    assert.equal(list.result.tools.length, TOOLS.length); // tools/list works after initialized notification
    // no embedded newlines inside any single framed message (NDJSON invariant)
    for (const line of chunks.join('').trim().split('\n'))
        assert.ok(!line.includes('\n'));
    s.close();
});
