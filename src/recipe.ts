// Frame Recipe (F-LOOP-8, ADR-0008): a VENDOR-NEUTRAL task protocol (feature/bugfix/ship) that we
// COMPILE/PROJECT onto each CLI's native features — NOT "run a Claude skill inside Codex" (that's a
// category error, ADR-0002/0004). The same numbered protocol body is emitted for every agent; only
// the header naming the agent's native mechanism differs. Shared state stays in framein MCP + ledger.

import type { Agent, Role } from './types.js';
import { PLAIN, type Painter } from './ui/theme.js';

export interface RecipeStep { action: string; role?: Role; readOnly?: boolean; required?: string[]; }
export interface Recipe { name: string; trigger: string; steps: RecipeStep[]; }

export const RECIPES: Recipe[] = [
  { name: 'feature', trigger: 'feature', steps: [
    { role: 'lead', action: 'define_contract' },
    { role: 'implementer', action: 'implement' },
    { action: 'run_validation', required: ['tests', 'build'] },
    { role: 'reviewer', action: 'blocker_review', readOnly: true },
    { role: 'implementer', action: 'resolve_findings' },
    { action: 'human_approval' },
  ] },
  { name: 'bugfix', trigger: 'bugfix', steps: [
    { role: 'implementer', action: 'reproduce' },
    { role: 'reviewer', action: 'root_cause', readOnly: true },
    { role: 'implementer', action: 'minimal_fix' },
    { action: 'run_validation', required: ['regression_test'] },
    { action: 'human_approval' },
  ] },
  { name: 'ship', trigger: 'ship', steps: [
    { action: 'verify_changes', required: ['tests', 'build'] },
    { action: 'risk_check' },
    { role: 'explainer', action: 'ownership_brief' },
    { action: 'human_approval' },
  ] },
];

// How each CLI expresses a recipe natively (we project onto these; we do not cross-execute).
const NATIVE_MECHANISM: Record<Agent, string> = {
  claude: 'a Claude Skill + hooks + subagent guidance',
  codex: 'a Codex skill / plugin / workflow',
  gemini: 'a Gemini extension / skill / hooks',
};

export function listRecipes(): Recipe[] { return RECIPES; }
export function getRecipe(name: string): Recipe | undefined { return RECIPES.find((r) => r.name === name); }

function stepLines(r: Recipe): string[] {
  return r.steps.map((s, i) => {
    const who = s.role ? `[${s.role}] ` : '';
    const ro = s.readOnly ? ' (read-only)' : '';
    const req = s.required ? ` — required: ${s.required.join(', ')}` : '';
    return `${i + 1}. ${who}${s.action}${ro}${req}`;
  });
}

export function renderRecipe(r: Recipe, ui: Painter = PLAIN): string {
  return [ui.tone(`recipe: ${r.name} (trigger: ${r.trigger})`, 'muted'), ...stepLines(r)].join('\n');
}

/** Project a recipe onto one agent's native mechanism. Body (numbered steps) is identical per agent. */
export function compileRecipe(r: Recipe, agent: Agent): string {
  return [
    `# ${r.name} — compiled for ${agent} as ${NATIVE_MECHANISM[agent]}`,
    ...stepLines(r),
    'Shared state: framein MCP + task ledger (the contract, decisions, and validation results all agents read).',
  ].join('\n');
}
