import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from './ingest.js';
test('extractJson: pulls a JSON object from prose / ```json fences', () => {
    assert.deepEqual(extractJson('sure!\n```json\n{"verdict":"challenge","claim":"x"}\n```\nok'), { verdict: 'challenge', claim: 'x' });
});
test('extractJson: returns the first valid object; null when none', () => {
    assert.deepEqual(extractJson('a {"a":1} b {"b":2}'), { a: 1 });
    assert.equal(extractJson('no json here'), null);
    assert.equal(extractJson(''), null);
});
test('extractJson: brace inside a string does not break balancing', () => {
    assert.deepEqual(extractJson('{"s":"has } brace","n":2}'), { s: 'has } brace', n: 2 });
});
test('extractJson: skips an invalid object and finds the next valid one', () => {
    assert.deepEqual(extractJson('{not json} then {"ok":true}'), { ok: true });
});
