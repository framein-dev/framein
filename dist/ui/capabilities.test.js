import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCapabilities } from './capabilities.js';
test('color is on only for an interactive color terminal', () => {
    assert.equal(resolveCapabilities({ isTTY: true, colorDepth: 24, env: {} }).color, true);
    assert.equal(resolveCapabilities({ isTTY: false, colorDepth: 24, env: {} }).color, false); // pipe → no ANSI
    assert.equal(resolveCapabilities({ isTTY: true, colorDepth: 1, env: {} }).color, false); // 2-color
});
test('NO_COLOR / --plain / --no-color disable color; FORCE_COLOR forces it', () => {
    assert.equal(resolveCapabilities({ isTTY: true, colorDepth: 24, env: { NO_COLOR: '' } }).color, false);
    assert.equal(resolveCapabilities({ isTTY: true, colorDepth: 24, flags: ['--plain'], env: {} }).color, false);
    assert.equal(resolveCapabilities({ isTTY: true, colorDepth: 24, flags: ['--no-color'], env: {} }).color, false);
    assert.equal(resolveCapabilities({ isTTY: false, env: { FORCE_COLOR: '1' } }).color, true);
});
test('unicode defaults true (pipes are fine); --plain and live legacy Windows fall back to ASCII', () => {
    assert.equal(resolveCapabilities({ isTTY: false, platform: 'win32', env: {} }).unicode, true); // win pipe ok
    assert.equal(resolveCapabilities({ isTTY: true, platform: 'win32', env: {} }).unicode, false); // legacy console
    assert.equal(resolveCapabilities({ isTTY: true, platform: 'win32', env: { WT_SESSION: '1' } }).unicode, true);
    assert.equal(resolveCapabilities({ isTTY: true, platform: 'darwin', env: {} }).unicode, true);
    assert.equal(resolveCapabilities({ isTTY: true, platform: 'win32', flags: ['--plain'], env: { WT_SESSION: '1' } }).unicode, false);
});
test('colorDepth quantizes; columns falls back to 80', () => {
    assert.equal(resolveCapabilities({ isTTY: true, colorDepth: 8, env: {} }).colorDepth, 8);
    assert.equal(resolveCapabilities({ isTTY: true, colorDepth: 3, env: {} }).colorDepth, 0);
    assert.equal(resolveCapabilities({ columns: 0, env: {} }).columns, 80);
    assert.equal(resolveCapabilities({ columns: 120, env: {} }).columns, 120);
});
