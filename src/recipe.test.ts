import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listRecipes, getRecipe, renderRecipe, compileRecipe } from './recipe.js';

test('listRecipes / getRecipe: built-in feature / bugfix / ship', () => {
  assert.deepEqual(listRecipes().map((r) => r.name).sort(), ['bugfix', 'feature', 'ship']);
  assert.equal(getRecipe('feature')?.steps[0].role, 'lead');
  assert.equal(getRecipe('nope'), undefined);
});

test('renderRecipe: numbered steps with roles and required gates', () => {
  const out = renderRecipe(getRecipe('feature')!);
  assert.match(out, /1\./);
  assert.match(out, /lead/);
  assert.match(out, /define_contract/);
  assert.match(out, /required: tests, build/);
});

test('compileRecipe: per-agent native mechanism header, identical protocol body (no cross-exec)', () => {
  const r = getRecipe('feature')!;
  const claude = compileRecipe(r, 'claude');
  const codex = compileRecipe(r, 'codex');
  assert.match(claude, /claude/i);
  assert.match(claude, /skill/i);          // claude: Skill + hooks + subagent
  assert.match(codex, /workflow|plugin/i); // codex: skill/plugin/workflow
  // the vendor-neutral protocol (the numbered steps) is byte-identical across agents
  const body = (s: string) => s.split('\n').filter((l) => /^\d+\./.test(l)).join('\n');
  assert.equal(body(claude), body(codex));
  assert.ok(body(claude).length > 0);
});
