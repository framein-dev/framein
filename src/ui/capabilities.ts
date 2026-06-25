// Terminal capability detection. PURE: resolveCapabilities takes
// an explicit input snapshot so it is fully unit-testable; cli.ts feeds the real process/env values.
// Zero-dep — every signal is a Node built-in (process.stdout.isTTY/.columns/.getColorDepth(), env).
//
// Two gates that matter for non-breaking output:
//  - color  → ONLY when interactive (tty) + not disabled + depth≥4. Pipes/CI/tests get no ANSI, so
//    existing plain-string assertions keep passing.
//  - unicode→ symbols are UTF-8 and pipe fine, so default true; the ASCII fallback only kicks in on
//    --plain or a *live* legacy Windows console (where box-drawing width actually breaks).

export interface UiCapabilities {
  readonly tty: boolean;
  readonly color: boolean;
  readonly colorDepth: 0 | 4 | 8 | 24;
  readonly unicode: boolean;
  readonly columns: number;
}

export interface CapabilityInput {
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly colorDepth?: number; // tty.WriteStream.getColorDepth() → 1 | 4 | 8 | 24
  readonly platform?: string; // process.platform
  readonly env?: Record<string, string | undefined>;
  readonly flags?: readonly string[]; // argv (looks for --plain / --no-color)
}

function quantizeDepth(bits: number): 0 | 4 | 8 | 24 {
  if (bits >= 24) return 24;
  if (bits >= 8) return 8;
  if (bits >= 4) return 4;
  return 0;
}

export function resolveCapabilities(input: CapabilityInput = {}): UiCapabilities {
  const env = input.env ?? {};
  const flags = input.flags ?? [];
  const plain = flags.includes('--plain');
  const tty = Boolean(input.isTTY);
  const colorDepth = quantizeDepth(input.colorDepth ?? (tty ? 4 : 1));

  // NO_COLOR: any defined value disables (informal standard). FORCE_COLOR (≠"0") forces on.
  const noColor = plain || flags.includes('--no-color') || env.NO_COLOR !== undefined;
  const forceColor = env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0';
  const color = !noColor && (forceColor || (tty && colorDepth >= 4));

  const utf8 = /utf-?8/i.test(`${env.LANG ?? ''} ${env.LC_ALL ?? ''} ${env.LC_CTYPE ?? ''}`);
  // Box-drawing only misrenders in a *live* legacy Windows console; in a pipe the bytes are fine.
  const winLegacyTty = tty && input.platform === 'win32' && !env.WT_SESSION && !env.TERM_PROGRAM && !utf8;
  const unicode = !plain && !winLegacyTty;

  const columns = input.columns && input.columns > 0 ? input.columns : 80;
  return { tty, color, colorDepth, unicode, columns };
}
