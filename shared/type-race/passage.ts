// Pure passage helpers shared by the client (typing engine) and the server (progress checks, pool
// validation). No secrets and no passage text live here.
import type { PassageLength } from "../type-race-protocol";

// Character ranges per length bucket (spec 5.5), both ends inclusive. The spec's "80-180" and
// "180-350" share an edge; the shorter bucket stops one character earlier so every length has
// exactly one bucket.
export const LENGTH_BUCKETS: Record<PassageLength, { min: number; max: number }> = {
  short: { min: 80, max: 179 },
  medium: { min: 180, max: 349 },
  long: { min: 350, max: 600 },
};

// Time limit per bucket, in seconds (spec 5.5).
export const LIMIT_SECONDS: Record<PassageLength, number> = { short: 60, medium: 90, long: 120 };

export const MIN_PASSAGE_CHARS = LENGTH_BUCKETS.short.min;
export const MAX_PASSAGE_CHARS = LENGTH_BUCKETS.long.max;

// Makes text typeable on any keyboard (spec 5.6): curly quotes, dashes and the ellipsis character
// become ASCII, every run of whitespace (line breaks included) becomes one space, ends are trimmed.
// Idempotent: normalising twice gives the same text as once.
export function normalisePassage(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

export type PassageProblem = "too-short" | "too-long" | "bad-chars";

// Judges the text after normalising it, so a pasted curly quote is fine but a letter with an accent
// is not. Printable ASCII only (0x20-0x7E): everything must come from one keystroke.
export function passageProblem(text: string): PassageProblem | null {
  const clean = normalisePassage(text);
  if (!/^[\x20-\x7E]*$/.test(clean)) return "bad-chars";
  if (clean.length < MIN_PASSAGE_CHARS) return "too-short";
  if (clean.length > MAX_PASSAGE_CHARS) return "too-long";
  return null;
}

// The bucket a length belongs to, or null outside 80-600.
export function bucketOf(length: number): PassageLength | null {
  for (const [name, { min, max }] of Object.entries(LENGTH_BUCKETS)) {
    if (length >= min && length <= max) return name as PassageLength;
  }
  return null;
}

// Each word keeps its trailing space; the last has none. A word counts once typed perfectly with
// its space (spec 4), so the pieces add back up to the passage.
export function splitWords(text: string): string[] {
  if (text === "") return [];
  const parts = text.split(" ");
  return parts.map((word, i) => (i < parts.length - 1 ? `${word} ` : word));
}

// Characters in the first `n` words. Both sides count progress this way, so a client claiming
// `words: n` is worth exactly this many characters (clamped to the passage).
export function charsThrough(words: readonly string[], n: number): number {
  let total = 0;
  const end = Math.max(0, Math.min(Math.floor(n), words.length));
  for (let i = 0; i < end; i++) total += words[i].length;
  return total;
}
