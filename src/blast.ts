// Blast Radius Guard (F-LOOP-6, ADR-0008): detect when a change touches sensitive code and raise
// the required gates — but only when risk actually changes, matching the audit cadence (ADR-0005:
// not every task). Pure: map changed file paths to a risk level + required gates. Reading the
// changed files (git) and acting on the gate live in cli.ts.

import { PLAIN, type Painter, type Tone } from './ui/theme.js';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface BlastHit { category: string; file: string; }
export interface BlastAssessment { level: RiskLevel; hits: BlastHit[]; requiredGates: string[]; }

interface Rule { category: string; level: Exclude<RiskLevel, 'low'>; pattern: RegExp; gate: string; }

// Order matters only for readability; each file is matched against every rule.
const RULES: Rule[] = [
  { category: 'secrets', level: 'high', pattern: /(^|\/)\.env(\.|$)|secret|credential|\.pem$|\.key$/i, gate: 'secret scan / rotation validation' },
  { category: 'auth', level: 'high', pattern: /auth|login|session|oauth|permission|rbac|password/i, gate: 'security review' },
  { category: 'payment', level: 'high', pattern: /payment|billing|stripe|checkout|invoice|charge/i, gate: 'security review (payments)' },
  { category: 'migration', level: 'high', pattern: /migrat|\.sql$|schema\.|prisma\/migrations|alembic/i, gate: 'migration rollback validation' },
  { category: 'deploy', level: 'high', pattern: /dockerfile|docker-compose|\.tf$|terraform|fly\.toml|vercel\.json|(^|\/)k8s\/|\.github\/workflows/i, gate: 'deploy rollback plan' },
  { category: 'deps', level: 'medium', pattern: /(^|\/)package\.json$|package-lock\.json|yarn\.lock|pnpm-lock\.yaml/i, gate: 'dependency justification' },
  { category: 'config', level: 'medium', pattern: /(^|\/)config\/|\.env\.example$|settings\.(json|py|ts)|\.config\./i, gate: 'config review' },
];

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
export function riskRank(level: RiskLevel): number { return RANK[level]; }

export function assessBlastRadius(changedFiles: string[]): BlastAssessment {
  const hits: BlastHit[] = [];
  const gates = new Set<string>();
  let level: RiskLevel = 'low';
  for (const file of changedFiles) {
    for (const rule of RULES) {
      if (rule.pattern.test(file)) {
        hits.push({ category: rule.category, file });
        gates.add(rule.gate);
        if (RANK[rule.level] > RANK[level]) level = rule.level;
      }
    }
  }
  return { level, hits, requiredGates: [...gates] };
}

/** A message when risk INCREASED vs the previous assessment (cadence: only speak on change). */
export function riskTransition(prev: RiskLevel | undefined, curr: RiskLevel): string | undefined {
  if (prev === undefined || RANK[curr] <= RANK[prev]) return undefined;
  return `Risk level changed: ${prev.toUpperCase()} → ${curr.toUpperCase()}`;
}

export function renderBlast(a: BlastAssessment, ui: Painter = PLAIN): string {
  if (a.level === 'low') return `Risk level: ${ui.tone('LOW', 'success')} (no sensitive files touched)`;
  const tone: Tone = a.level === 'high' ? 'danger' : 'warning';
  const lines = [`Risk level: ${ui.tone(a.level.toUpperCase(), tone)}`, 'Reason:'];
  for (const h of a.hits) lines.push(`  - ${h.category}: ${h.file}`);
  lines.push('Required before ship:');
  for (const g of a.requiredGates) lines.push(`  - ${g}`);
  return lines.join('\n');
}
