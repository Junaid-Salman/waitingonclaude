import { MAX_WPM_CAP } from "../../../shared/type-race-protocol";
import { charsThrough } from "../../../shared/type-race/passage";

// Server-side validation of a client's cumulative `progress` (spec 7, edge cases). The client is
// untrusted: it reports words completed, keystrokes and wrong keystrokes, never time. The server
// stamps time itself, so a client can only claim to be faster than the cap allows, and is clamped.

export interface ProgressEntry {
  words: number;
  keystrokes: number;
  errors: number;
  // Milliseconds from startAt to the last word, or null while still typing.
  finishedMs: number | null;
}

export interface ProgressMessage {
  words: number;
  keystrokes: number;
  errors: number;
}

const MAX_COUNT = 1_000_000;
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_COUNT;

// Characters per millisecond at the cap (5 characters to a word).
const CAP_CHARS_PER_MS = (MAX_WPM_CAP * 5) / 60_000;

// The most characters that may be complete `elapsedMs` after the start: the cap, plus one word of
// slack because a word counts whole.
export const maxCharsAt = (elapsedMs: number, words: readonly string[]): number =>
  CAP_CHARS_PER_MS * Math.max(0, elapsedMs) + Math.max(0, ...words.map((w) => w.length));

// The earliest elapsed time at which `chars` characters are legal.
const earliestMsFor = (chars: number, words: readonly string[]): number =>
  Math.max(0, (chars - Math.max(0, ...words.map((w) => w.length))) / CAP_CHARS_PER_MS);

export type ProgressDecision = { ok: true; entry: ProgressEntry } | { ok: false };

// Returns the entry to store, or ok:false to drop the message silently.
//  - dropped: not integers or out of range, more words than the passage has, fewer words or
//    keystrokes than already accepted, before startAt, at or after endAt, after the player finished;
//  - clamped: faster than the cap (fewer words are credited), keystrokes below the characters typed,
//    errors above the keystrokes that were not needed (accuracy stays a number between 0 and 1);
//  - a final word sent faster than legal is accepted with finishedMs at the earliest legal time, so
//    the client needs no resend.
export function acceptProgress(
  entry: ProgressEntry,
  msg: ProgressMessage,
  now: number,
  startAt: number,
  endAt: number,
  words: readonly string[],
): ProgressDecision {
  if (!isCount(msg.words) || !isCount(msg.keystrokes) || !isCount(msg.errors)) return { ok: false };
  if (entry.finishedMs !== null) return { ok: false };
  if (now < startAt || now >= endAt) return { ok: false };
  if (msg.words > words.length) return { ok: false };
  if (msg.words < entry.words || msg.keystrokes < entry.keystrokes) return { ok: false };

  const elapsed = now - startAt;
  let credited = msg.words;
  const cap = maxCharsAt(elapsed, words);
  const finalWord = msg.words === words.length;
  if (charsThrough(words, credited) > cap && !finalWord) {
    // Fewest words that still fit under the cap; never fewer than already accepted.
    while (credited > entry.words && charsThrough(words, credited) > cap) credited--;
  }

  const correctChars = charsThrough(words, credited);
  const keystrokes = Math.max(msg.keystrokes, correctChars);
  const errors = Math.min(msg.errors, keystrokes - correctChars);

  let finishedMs: number | null = null;
  if (finalWord) {
    finishedMs = Math.max(elapsed, Math.ceil(earliestMsFor(correctChars, words)));
    // Never later than the race: a clamped final word still counts inside the limit.
    finishedMs = Math.min(finishedMs, endAt - startAt - 1);
  }
  return { ok: true, entry: { words: credited, keystrokes, errors, finishedMs } };
}
