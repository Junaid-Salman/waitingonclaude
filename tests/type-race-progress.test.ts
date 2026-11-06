import { describe, expect, test } from "vitest";
import { splitWords } from "../shared/type-race/passage";
import { acceptProgress, maxCharsAt, type ProgressEntry } from "../party/games/type-race/progress";

// 12 words of 10 chars ("wordNNNNN "), the last one without its space: 119 characters.
const words = splitWords(Array.from({ length: 12 }, (_, i) => `word${String(i).padStart(5, "0")}`).join(" "));
const START = 10_000;
const END = START + 60_000;
const fresh = (): ProgressEntry => ({ words: 0, keystrokes: 0, errors: 0, finishedMs: null });
const at = (ms: number) => START + ms;
const send = (msg: { words: number; keystrokes: number; errors: number }, now: number, entry = fresh()) => acceptProgress(entry, msg, now, START, END, words);
const chars = (n: number) => words.slice(0, n).join("").length;

describe("bounds and shape", () => {
  test("a normal update is accepted as sent", () => {
    const r = send({ words: 3, keystrokes: 40, errors: 2 }, at(20_000));
    expect(r).toEqual({ ok: true, entry: { words: 3, keystrokes: 40, errors: 2, finishedMs: null } });
  });

  test.each([
    [{ words: -1, keystrokes: 5, errors: 0 }],
    [{ words: 1.5, keystrokes: 15, errors: 0 }],
    [{ words: Number.NaN, keystrokes: 5, errors: 0 }],
    [{ words: 1, keystrokes: 1e9, errors: 0 }],
    [{ words: 1, keystrokes: 15, errors: -1 }],
    [{ words: 1, keystrokes: 15, errors: 0.5 }],
    [{ words: 13, keystrokes: 500, errors: 0 }], // more words than the passage has
    [{ words: Infinity, keystrokes: 5, errors: 0 }],
  ])("%j is dropped", (msg) => {
    expect(send(msg, at(30_000)).ok).toBe(false);
  });

  test("words and keystrokes may not go down", () => {
    const entry = { words: 5, keystrokes: 60, errors: 1, finishedMs: null };
    expect(send({ words: 4, keystrokes: 70, errors: 1 }, at(30_000), entry).ok).toBe(false);
    expect(send({ words: 5, keystrokes: 59, errors: 1 }, at(30_000), entry).ok).toBe(false);
    expect(send({ words: 5, keystrokes: 61, errors: 1 }, at(30_000), entry).ok).toBe(true);
  });

  test("a finished player's later updates are dropped", () => {
    expect(send({ words: 12, keystrokes: 200, errors: 0 }, at(30_000), { ...fresh(), words: 12, finishedMs: 20_000 }).ok).toBe(false);
  });
});

describe("time window", () => {
  test("before startAt is dropped (mutation-checked)", () => {
    expect(send({ words: 1, keystrokes: 10, errors: 0 }, START - 1).ok).toBe(false);
    expect(send({ words: 1, keystrokes: 10, errors: 0 }, START).ok).toBe(true);
  });

  test("at or after endAt is dropped", () => {
    expect(send({ words: 1, keystrokes: 10, errors: 0 }, END - 1).ok).toBe(true);
    expect(send({ words: 1, keystrokes: 10, errors: 0 }, END).ok).toBe(false);
  });
});

describe("speed cap (250 WPM, plus one word of slack)", () => {
  test("the cap is 250 WPM = 1250 chars a minute plus the longest word", () => {
    expect(maxCharsAt(60_000, words)).toBeCloseTo(1250 + 10, 6);
    expect(maxCharsAt(0, words)).toBe(10);
  });

  test("words beyond the cap are not credited", () => {
    // 3 s in: cap = 62.5 + 10 = 72.5 chars = 7 words (70 chars)
    const r = send({ words: 11, keystrokes: 120, errors: 0 }, at(3000));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.words).toBe(7);
      expect(r.entry.finishedMs).toBeNull();
      expect(chars(r.entry.words)).toBeLessThanOrEqual(maxCharsAt(3000, words));
    }
  });

  test("a clamp never goes below what was already accepted", () => {
    const entry = { words: 2, keystrokes: 25, errors: 0, finishedMs: null };
    const r = send({ words: 12, keystrokes: 200, errors: 0 }, at(0), entry);
    expect(r.ok && r.entry.words).toBeGreaterThanOrEqual(2);
  });

  test("a final word sent too fast finishes at the earliest legal time, no resend needed", () => {
    // all 119 chars at 1 s: legal only from (119 - 10) / 20.83 chars/s = 5.23 s
    const r = send({ words: 12, keystrokes: 125, errors: 0 }, at(1000));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.words).toBe(12);
      expect(r.entry.finishedMs).toBe(Math.ceil((119 - 10) / ((250 * 5) / 60_000)));
      expect(r.entry.finishedMs!).toBeGreaterThan(1000);
    }
  });

  test("a legal final word finishes at the receipt time", () => {
    const r = send({ words: 12, keystrokes: 130, errors: 5 }, at(30_000));
    expect(r.ok && r.entry.finishedMs).toBe(30_000);
  });

  test("a finish can never be later than the race", () => {
    const r = acceptProgress(fresh(), { words: 12, keystrokes: 125, errors: 0 }, START + 5, START, START + 100, words);
    expect(r.ok && r.entry.finishedMs).toBeLessThan(100);
  });
});

describe("accuracy clamp", () => {
  test("keystrokes are raised to the characters typed", () => {
    const r = send({ words: 3, keystrokes: 1, errors: 0 }, at(20_000));
    expect(r.ok && r.entry.keystrokes).toBe(chars(3));
  });

  test("errors cannot exceed the keystrokes that were not needed", () => {
    const r = send({ words: 3, keystrokes: chars(3) + 2, errors: 99 }, at(20_000));
    expect(r.ok && r.entry.errors).toBe(2);
  });
});
