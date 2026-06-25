// Ownership Brief (F-LOOP-10, ADR-0008): make the explainer produce a doc the user can take
// OWNERSHIP of — not just a friendly recap. Pure: render the brief skeleton, filling the facts
// framein already knows (changed files, how to test, how to roll back) and leaving the narrative
// sections for the live explainer role. Gathering the facts lives in cli.ts.

export interface BriefInput {
  goal?: string;
  changedFiles?: string[];
  testCommand?: string;
  lastGreen?: string;
}

const TBD = '  (for the explainer role to fill)';

export function ownershipBrief(input: BriefInput): string {
  const changed = input.changedFiles?.length
    ? input.changedFiles.map((f) => `  - ${f}`).join('\n')
    : '  (no changed files detected)';
  const sections: [string, string][] = [
    ['What changed', changed],
    ['How to test it', input.testCommand ? `  ${input.testCommand}` : '  (no test command found)'],
    ['How to roll it back', input.lastGreen ? `  git reset --hard ${input.lastGreen.slice(0, 7)}  (last green checkpoint)` : '  (no checkpoint recorded — run `frame checkpoint`)'],
    ['How requests flow', TBD],
    ['Where configuration lives', TBD],
    ['Known limitations', TBD],
    ['What will likely break next', TBD],
  ];
  const head = `Ownership brief${input.goal ? `: ${input.goal}` : ''}`;
  return [head, '', ...sections.map(([h, b]) => `## ${h}\n${b}`)].join('\n');
}
