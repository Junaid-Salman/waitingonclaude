import { describe, expect, test } from "vitest";
import {
  bucketOf,
  charsThrough,
  LENGTH_BUCKETS,
  LIMIT_SECONDS,
  normalisePassage,
  passageProblem,
  splitWords,
} from "../shared/type-race/passage";

const ofLength = (n: number) => "a".repeat(n);

describe("normalisePassage", () => {
  test.each([
    ["“Hi,” she said", '"Hi," she said'],
    ["it’s fine, ‘really’", "it's fine, 'really'"],
    ["one—two – three", "one-two - three"],
    ["wait… what", "wait... what"],
    ["  too   many    spaces  ", "too many spaces"],
    ["line one\nline two\r\n\tline three", "line one line two line three"],
    ["no break", "no break"],
  ])("%j -> %j", (input, expected) => {
    expect(normalisePassage(input)).toBe(expected);
  });

  test("is idempotent", () => {
    for (const text of ["“A” — b…  c\n", "plain text", "", "  ‘x’  "]) {
      const once = normalisePassage(text);
      expect(normalisePassage(once)).toBe(once);
    }
  });
});

describe("passageProblem", () => {
  test("accepts 80 to 600 printable ASCII characters", () => {
    expect(passageProblem(ofLength(80))).toBeNull();
    expect(passageProblem(ofLength(600))).toBeNull();
  });

  test("too short and too long", () => {
    expect(passageProblem(ofLength(79))).toBe("too-short");
    expect(passageProblem("")).toBe("too-short");
    expect(passageProblem(ofLength(601))).toBe("too-long");
  });

  test("length is checked after normalising", () => {
    // 80 characters with 5 double spaces: 75 after collapsing into single spaces
    const padded = `${"ab ".repeat(25)}${"  ".repeat(2)}b`;
    expect(padded.length).toBeGreaterThanOrEqual(80);
    expect(passageProblem(padded)).toBe("too-short");
    // a curly-quote passage becomes valid once normalised
    expect(passageProblem(`“${ofLength(80)}”`)).toBeNull();
  });

  test.each(["café", "emoji \u{1F600}", "tab\u0007bell", "中文"])("bad characters: %j", (bad) => {
    expect(passageProblem(`${ofLength(100)} ${bad}`)).toBe("bad-chars");
  });
});

describe("buckets", () => {
  test("every length from 80 to 600 has exactly one bucket and the edges are right", () => {
    expect(bucketOf(79)).toBeNull();
    expect(bucketOf(80)).toBe("short");
    expect(bucketOf(179)).toBe("short");
    expect(bucketOf(180)).toBe("medium");
    expect(bucketOf(349)).toBe("medium");
    expect(bucketOf(350)).toBe("long");
    expect(bucketOf(600)).toBe("long");
    expect(bucketOf(601)).toBeNull();
    for (let n = 80; n <= 600; n++) expect(bucketOf(n)).not.toBeNull();
  });

  test("ranges are contiguous", () => {
    expect(LENGTH_BUCKETS.short.max + 1).toBe(LENGTH_BUCKETS.medium.min);
    expect(LENGTH_BUCKETS.medium.max + 1).toBe(LENGTH_BUCKETS.long.min);
  });

  test("time limits follow the bucket (spec 5.5)", () => {
    expect(LIMIT_SECONDS).toEqual({ short: 60, medium: 90, long: 120 });
  });
});

describe("splitWords / charsThrough", () => {
  test("each word keeps its trailing space, the last has none", () => {
    expect(splitWords("the quick fox")).toEqual(["the ", "quick ", "fox"]);
    expect(splitWords("one")).toEqual(["one"]);
    expect(splitWords("")).toEqual([]);
  });

  test("the pieces add back up to the passage", () => {
    const text = "Mind the gap, said the clerk.";
    expect(splitWords(text).join("")).toBe(text);
  });

  test("charsThrough counts whole words and clamps", () => {
    const words = splitWords("the quick fox");
    expect(charsThrough(words, 0)).toBe(0);
    expect(charsThrough(words, 1)).toBe(4);
    expect(charsThrough(words, 2)).toBe(10);
    expect(charsThrough(words, 3)).toBe("the quick fox".length);
    expect(charsThrough(words, 99)).toBe("the quick fox".length);
    expect(charsThrough(words, -2)).toBe(0);
  });
});
