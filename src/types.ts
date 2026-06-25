// Shared domain types for framein.

export const AGENTS = ['claude', 'codex', 'gemini'] as const;
export type Agent = typeof AGENTS[number];
export type AuthMode = 'oauth' | 'api-key' | 'vertex' | 'workspace' | 'consumer-login';

export const ROLES = ['lead', 'implementer', 'reviewer', 'explainer', 'researcher'] as const;
export type Role = typeof ROLES[number];

export interface AdrInput {
  title: string;
  decision: string;
  status?: 'proposed' | 'accepted' | 'superseded';
  context?: string;
  consequences?: string;
  authorAgent?: Agent | null;
  /** id of the ADR this one replaces (append-only correction). */
  supersedes?: number | null;
}

export interface Adr {
  id: number;
  createdAt: string;
  title: string;
  status: 'proposed' | 'accepted' | 'superseded';
  context: string;
  decision: string;
  consequences: string;
  authorAgent: Agent | null;
  supersedes: number | null;
}

/** Repo-local performance for one agent, derived from the ledger (F-LOOP-7, routing learning). */
export interface AgentStats { delegations: number; failures: number; quotaHits: number; }

/** A work-event in the task ledger (edits, test failures, turns, asks). Runtime-local. */
export interface LedgerEntry {
  id: number;
  ts: string;
  kind: string;     // 'edit' | 'test-fail' | 'turn' | 'commit' | 'ask' | ...
  target: string;   // file / test / role
  detail: string;
}

/**
 * Task Contract (F-LOOP-1, ADR-0008): what "done" means for the current task. A MUTABLE task
 * entity (distinct from append-only ADRs and from "what we know" memory) — it fixes "what to
 * treat as complete" so every agent judges against the same bar.
 */
export interface TaskContract {
  goal: string;
  mustPreserve: string[];
  acceptance: string[];
  protected: string[];
  nonGoals: string[];
}

/** A snapshot of the single source of truth, used to project native files. */
export interface ProjectState {
  config: Record<string, unknown>;
  roles: Partial<Record<Role, Agent>>;
  adrs: Adr[];
  taskContract?: TaskContract;
}

/**
 * Full, git-friendly serialization of the store. The TEXT form (JSON) is the canonical
 * source committed to git (PRD F-SYNC-6); `.frame/store.db` is a rebuildable cache.
 */
export interface StoreSnapshot {
  schemaVersion: number;
  config: Record<string, unknown>;
  roles: Partial<Record<Role, Agent>>;
  adrs: Adr[];
  memory: Record<string, Record<string, unknown>>;
}
