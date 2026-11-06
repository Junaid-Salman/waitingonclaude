import { describe, expect, test } from "vitest";
import { accuracy, round1, wpm } from "../shared/type-race/stats";

describe("wpm (spec 4: one word = 5 characters)", () => {
  test.each([
    // [correct chars, elapsed ms, expected]
    [250, 60_000, 50], // 50 words in a minute
    [100, 30_000, 40], // 20 words in half a minute
    [5, 1000, 60], // one word in a second
    [175, 90_000, 23.3333333333], // 35 words in a minute and a half
  ])("%d chars in %d ms -> %d", (chars, ms, expected) => {
    expect(wpm(chars, ms)).toBeCloseTo(expected, 6);
  });

  test("no time or no characters gives 0, never Infinity or NaN", () => {
    expect(wpm(100, 0)).toBe(0);
    expect(wpm(100, -5)).toBe(0);
    expect(wpm(0, 10_000)).toBe(0);
    expect(wpm(Number.NaN, 10_000)).toBe(0);
  });
});

describe("accuracy (correct keystrokes / total keystrokes)", () => {
  test("worked cases", () => {
    expect(accuracy(95, 100)).toBeCloseTo(0.95, 10);
    expect(accuracy(1, 4)).toBe(0.25);
    expect(accuracy(0, 5)).toBe(0);
  });

  test("no keystrokes counts as perfect", () => {
    expect(accuracy(0, 0)).toBe(1);
  });

  test("is clamped to 0..1 for hostile input", () => {
    expect(accuracy(10, 5)).toBe(1);
    expect(accuracy(-3, 5)).toBe(0);
  });
});

describe("round1", () => {
  test("rounds to one decimal for display only", () => {
    expect(round1(23.3333)).toBe(23.3);
    expect(round1(23.36)).toBe(23.4);
    expect(round1(50)).toBe(50);
  });
});
