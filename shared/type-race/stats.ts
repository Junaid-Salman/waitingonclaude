// WPM and accuracy (spec 4), used by the live client stats and by the server's authoritative result
// so the two cannot disagree. Both return raw numbers: rank on the raw value, show `round1`.

// One word = 5 characters including spaces and punctuation. `correctChars` is the characters of
// completed words. Zero or negative elapsed time gives 0, never Infinity.
export function wpm(correctChars: number, elapsedMs: number): number {
  if (!(elapsedMs > 0) || !(correctChars > 0)) return 0;
  return correctChars / 5 / (elapsedMs / 60_000);
}

// correct keystrokes / total keystrokes, from 0 to 1. No keystrokes yet counts as 1 (nothing wrong).
export function accuracy(correctKeystrokes: number, totalKeystrokes: number): number {
  if (!(totalKeystrokes > 0)) return 1;
  return Math.min(1, Math.max(0, correctKeystrokes / totalKeystrokes));
}

// One decimal, for display only.
export const round1 = (value: number): number => Math.round(value * 10) / 10;
