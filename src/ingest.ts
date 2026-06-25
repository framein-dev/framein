// Structured ingest (F-LOOP-5, live): pull a JSON object out of a model's free-form reply so its
// answer becomes structured framein state (e.g. a reviewer verdict -> a Challenge). Models wrap
// JSON in prose / ```json fences, so scan for the first balanced, string-aware {...} that parses.
// Pure; the live model call that produces the text lives in cli.ts.

export function extractJson(text: string): Record<string, unknown> | null {
  const s = text ?? '';
  for (let i = s.indexOf('{'); i !== -1; i = s.indexOf('{', i + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        if (--depth === 0) {
          try {
            const o: unknown = JSON.parse(s.slice(i, j + 1));
            if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
          } catch { /* not valid JSON — fall through and try the next `{` */ }
          break;
        }
      }
    }
  }
  return null;
}
