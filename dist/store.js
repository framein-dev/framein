// The single source of truth: a SQLite-backed store for config, roles,
// append-only ADRs, scoped memory, and the write lock.
import { openDb } from './db.js';
const SCHEMA = `
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roles (
  role TEXT PRIMARY KEY,
  agent TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS adr (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL,
  consequences TEXT NOT NULL DEFAULT '',
  author_agent TEXT,
  supersedes INTEGER
);
CREATE TABLE IF NOT EXISTS memory (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE TABLE IF NOT EXISTS write_lock (
  scope TEXT PRIMARY KEY,
  holder TEXT,
  acquired_at TEXT,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
`;
// Guard object-key injection (e.g. '__proto__' arriving via the MCP write_memory tool):
// these keys are rejected at write time so assembled config/memory maps stay clean.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function safeKey(k) {
    if (UNSAFE_KEYS.has(k))
        throw new Error(`unsafe key: ${k}`);
    return k;
}
function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function isBusy(e) {
    const err = e;
    return err.code === 'ERR_SQLITE_ERROR'
        && /locked|busy/i.test(`${String(err.message ?? '')} ${String(err.errstr ?? '')}`);
}
function execWithBusyRetry(db, sql) {
    const deadline = Date.now() + 5000;
    for (;;) {
        try {
            db.exec(sql);
            return;
        }
        catch (e) {
            if (!isBusy(e) || Date.now() >= deadline)
                throw e;
            sleepMs(50);
        }
    }
}
function rowToAdr(row) {
    return {
        id: Number(row.id),
        createdAt: String(row.created_at),
        title: String(row.title),
        status: row.status,
        context: row.context ?? '',
        decision: String(row.decision),
        consequences: row.consequences ?? '',
        authorAgent: row.author_agent ?? null,
        supersedes: row.supersedes == null ? null : Number(row.supersedes),
    };
}
export class Store {
    db;
    constructor(db) { this.db = db; }
    static open(path = ':memory:') {
        const db = openDb(path);
        // WAL + a busy timeout let multiple processes share one .frame/store.db without
        // "database is locked" errors; lock acquisition itself is a single atomic statement.
        execWithBusyRetry(db, 'PRAGMA busy_timeout=5000;');
        execWithBusyRetry(db, 'PRAGMA journal_mode=WAL;');
        execWithBusyRetry(db, SCHEMA);
        return new Store(db);
    }
    close() { this.db.close(); }
    // --- config (project rules etc.) ---
    setConfig(key, value) {
        this.db.prepare('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(safeKey(key), JSON.stringify(value));
    }
    getConfig(key) {
        const row = this.db.prepare('SELECT value FROM config WHERE key=?').get(key);
        return row ? JSON.parse(row.value) : undefined;
    }
    getAllConfig() {
        const rows = this.db.prepare('SELECT key,value FROM config').all();
        const out = {};
        for (const r of rows)
            out[r.key] = JSON.parse(r.value);
        return out;
    }
    // --- roles ---
    setRole(role, agent) {
        this.db.prepare('INSERT INTO roles(role,agent) VALUES(?,?) ON CONFLICT(role) DO UPDATE SET agent=excluded.agent').run(role, agent);
    }
    getRole(role) {
        const row = this.db.prepare('SELECT agent FROM roles WHERE role=?').get(role);
        return row?.agent;
    }
    getRoles() {
        const rows = this.db.prepare('SELECT role,agent FROM roles').all();
        const out = {};
        for (const r of rows)
            out[r.role] = r.agent;
        return out;
    }
    // --- ADR (APPEND-ONLY by design: no update/delete methods exist) ---
    appendAdr(input) {
        const createdAt = new Date().toISOString();
        const status = input.status ?? 'accepted';
        const supersedes = input.supersedes ?? null;
        if (supersedes != null && !this.getAdr(supersedes)) {
            throw new Error(`ADR-${supersedes} not found; cannot supersede a non-existent decision`);
        }
        const res = this.db.prepare('INSERT INTO adr(created_at,title,status,context,decision,consequences,author_agent,supersedes) VALUES(?,?,?,?,?,?,?,?)').run(createdAt, input.title, status, input.context ?? '', input.decision, input.consequences ?? '', input.authorAgent ?? null, supersedes);
        return {
            id: Number(res.lastInsertRowid), createdAt, title: input.title, status,
            context: input.context ?? '', decision: input.decision,
            consequences: input.consequences ?? '', authorAgent: input.authorAgent ?? null,
            supersedes,
        };
    }
    /**
     * Append-only correction: records a NEW ADR that replaces `oldId`. The old row is
     * never mutated or deleted — supersession is a forward reference (see isSuperseded).
     */
    supersedeAdr(oldId, input) {
        if (!this.getAdr(oldId))
            throw new Error(`ADR-${oldId} not found; cannot supersede`);
        if (this.isSuperseded(oldId))
            throw new Error(`ADR-${oldId} is already superseded; supersede the current decision instead`);
        return this.appendAdr({ ...input, supersedes: oldId });
    }
    getAdr(id) {
        const row = this.db.prepare('SELECT * FROM adr WHERE id=?').get(id);
        return row ? rowToAdr(row) : undefined;
    }
    /** True if some LATER ADR supersedes this one. Append-only: derived, not stored. */
    isSuperseded(id) {
        return this.db.prepare('SELECT 1 FROM adr WHERE supersedes=? AND id>? LIMIT 1').get(id, id) !== undefined;
    }
    listAdrs() {
        const rows = this.db.prepare('SELECT * FROM adr ORDER BY id').all();
        return rows.map(rowToAdr);
    }
    // --- memory (mutable working state, scoped) ---
    setMemory(scope, key, value) {
        this.db.prepare('INSERT INTO memory(scope,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(safeKey(scope), safeKey(key), JSON.stringify(value), new Date().toISOString());
    }
    getMemory(scope, key) {
        const row = this.db.prepare('SELECT value FROM memory WHERE scope=? AND key=?').get(scope, key);
        return row ? JSON.parse(row.value) : undefined;
    }
    listMemory(scope) {
        const rows = this.db.prepare('SELECT key,value FROM memory WHERE scope=?').all(scope);
        const out = {};
        for (const r of rows)
            out[r.key] = JSON.parse(r.value);
        return out;
    }
    deleteMemory(scope, key) {
        this.db.prepare('DELETE FROM memory WHERE scope=? AND key=?').run(scope, key);
    }
    // --- write lock (governance: one writer at a time, per scope, with TTL) ---
    // Acquisition is a SINGLE atomic conditional upsert — no read-then-write race across
    // processes. A lock is takeable when it is free, held by the same holder (reentrant),
    // or expired (its holder crashed without releasing).
    //
    // CAVEAT: reentrancy keys on the holder STRING. For cross-process mutual exclusion the
    // caller must pass a holder that uniquely identifies the owner (e.g. include the pid) —
    // two processes sharing a holder name would both be allowed in by design.
    static DEFAULT_TTL_MS = 15 * 60 * 1000;
    getLockHolder(scope = 'global') {
        const row = this.db.prepare('SELECT holder, expires_at FROM write_lock WHERE scope=?').get(scope);
        if (!row || row.holder == null)
            return null;
        if (row.expires_at != null && row.expires_at <= new Date().toISOString())
            return null; // expired => free
        return row.holder;
    }
    acquireLock(holder, opts = {}) {
        const scope = opts.scope ?? 'global';
        const ttlMs = opts.ttlMs ?? Store.DEFAULT_TTL_MS;
        const now = new Date();
        const acquiredAt = now.toISOString();
        const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
        const res = this.db.prepare(`INSERT INTO write_lock(scope,holder,acquired_at,expires_at) VALUES(?,?,?,?)
       ON CONFLICT(scope) DO UPDATE SET holder=excluded.holder, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at
       WHERE write_lock.holder IS NULL OR write_lock.holder=excluded.holder OR write_lock.expires_at <= excluded.acquired_at`).run(scope, holder, acquiredAt, expiresAt);
        return res.changes > 0;
    }
    releaseLock(holder, opts = {}) {
        const scope = opts.scope ?? 'global';
        const res = this.db.prepare('UPDATE write_lock SET holder=NULL, acquired_at=NULL, expires_at=NULL WHERE scope=? AND holder=?').run(scope, holder);
        return res.changes > 0;
    }
    /** Force-release a (possibly stale) lock regardless of holder. Backs `frame unlock`. */
    forceUnlock(scope = 'global') {
        this.db.prepare('UPDATE write_lock SET holder=NULL, acquired_at=NULL, expires_at=NULL WHERE scope=?').run(scope);
    }
    withWriteLock(holder, fn, opts = {}) {
        if (opts.ttlMs !== undefined && opts.ttlMs <= 0) {
            throw new Error('withWriteLock requires a positive ttlMs (a non-positive TTL expires immediately)');
        }
        if (!this.acquireLock(holder, opts)) {
            throw new Error(`write lock held by '${this.getLockHolder(opts.scope)}', '${holder}' cannot acquire`);
        }
        try {
            return fn();
        }
        finally {
            this.releaseLock(holder, opts);
        }
    }
    // --- task ledger (runtime work-events; feeds the anomaly/audit detector) ---
    appendLedger(kind, target = '', detail = '') {
        this.db.prepare('INSERT INTO ledger(ts,kind,target,detail) VALUES(?,?,?,?)').run(new Date().toISOString(), kind, target, detail);
    }
    /** Most recent `limit` ledger entries, returned in chronological order. */
    listLedger(limit = 500) {
        const rows = this.db.prepare('SELECT id,ts,kind,target,detail FROM ledger ORDER BY id DESC LIMIT ?').all(limit);
        return rows.reverse().map((r) => ({
            id: Number(r.id), ts: String(r.ts), kind: String(r.kind), target: String(r.target ?? ''), detail: String(r.detail ?? ''),
        }));
    }
    // --- task contract (F-LOOP-1: mutable task state, stored under memory scope 'task') ---
    getTaskContract() {
        return this.getMemory('task', 'contract');
    }
    setTaskContract(c) {
        this.setMemory('task', 'contract', c);
    }
    clearTaskContract() {
        this.deleteMemory('task', 'contract');
    }
    // --- projection snapshot ---
    getState() {
        return { config: this.getAllConfig(), roles: this.getRoles(), adrs: this.listAdrs(), taskContract: this.getTaskContract() };
    }
    // --- git-friendly text serialization (F-SYNC-6) ---
    static SCHEMA_VERSION = 1;
    allMemory() {
        const rows = this.db.prepare('SELECT scope,key,value FROM memory').all();
        const out = {};
        for (const r of rows) {
            (out[r.scope] ??= {})[r.key] = JSON.parse(r.value);
        }
        return out;
    }
    /** Full snapshot for the canonical text form. The write lock is intentionally excluded. */
    exportSnapshot() {
        return {
            schemaVersion: Store.SCHEMA_VERSION,
            config: this.getAllConfig(),
            roles: this.getRoles(),
            adrs: this.listAdrs(),
            memory: this.allMemory(),
        };
    }
    /** Rebuild the store from a snapshot (replaces config/roles/adr/memory). ADR ids are
     *  preserved so `supersedes` references stay valid. Transactional. */
    importSnapshot(snap) {
        if (snap.schemaVersion !== Store.SCHEMA_VERSION) {
            throw new Error(`unsupported snapshot schemaVersion ${snap.schemaVersion} (expected ${Store.SCHEMA_VERSION})`);
        }
        this.db.exec('BEGIN');
        try {
            this.db.exec('DELETE FROM config; DELETE FROM roles; DELETE FROM adr; DELETE FROM memory;');
            for (const [k, v] of Object.entries(snap.config))
                this.setConfig(k, v);
            for (const [r, a] of Object.entries(snap.roles))
                this.setRole(r, a);
            const ins = this.db.prepare('INSERT INTO adr(id,created_at,title,status,context,decision,consequences,author_agent,supersedes) VALUES(?,?,?,?,?,?,?,?,?)');
            let maxAdrId = 0;
            for (const a of snap.adrs) {
                ins.run(a.id, a.createdAt, a.title, a.status, a.context, a.decision, a.consequences, a.authorAgent, a.supersedes);
                if (a.id > maxAdrId)
                    maxAdrId = a.id;
            }
            // Reset the AUTOINCREMENT counter so the next appendAdr() id follows the imported max,
            // not the pre-import max (DELETE FROM adr does not touch sqlite_sequence).
            this.db.exec("DELETE FROM sqlite_sequence WHERE name='adr'");
            this.db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('adr', ?)").run(maxAdrId);
            for (const [scope, kv] of Object.entries(snap.memory)) {
                for (const [k, v] of Object.entries(kv))
                    this.setMemory(scope, k, v);
            }
            this.db.exec('COMMIT');
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
}
