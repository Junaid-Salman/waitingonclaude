import { describe, expect, test } from "vitest";
import { canCreate, wordVerdict } from "../src/lib/challenge/form";

const WORDS = ["crane", "slate", "robot", "moist", "light"];
const ok = Object.fromEntries(WORDS.map((w) => [w, "ok" as const]));

const verdicts = (words: string[], known: Record<string, "ok" | "not-a-word"> = ok, over: { server?: Record<number, "not-a-word" | "duplicate" | "bad-format">; checking?: number | null } = {}) =>
  words.map((_, index) => wordVerdict({ words, index, verdicts: known, serverProblems: over.server ?? {}, checking: over.checking ?? null }));

describe("wordVerdict", () => {
  test("empty is unknown, short is bad-format, repeats are duplicates", () => {
    expect(verdicts(["", "cra", "crane", "CRANE", "slate"], {}).slice(0, 5)).toEqual(["unknown", "bad-format", "duplicate", "duplicate", "unknown"]);
  });

  test("a checked word is ok or not-a-word; a server problem wins; the word being checked is checking", () => {
    expect(verdicts(WORDS)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(verdicts(WORDS, { ...ok, robot: "not-a-word" })[2]).toBe("not-a-word");
    expect(verdicts(WORDS, ok, { server: { 1: "not-a-word" } })[1]).toBe("not-a-word");
    expect(verdicts(WORDS, {}, { checking: 3 })[3]).toBe("checking");
  });
});

const can = (words: string[], known: Record<string, "ok" | "not-a-word"> = ok, over: { server?: Record<number, "not-a-word" | "duplicate" | "bad-format">; checking?: number | null } = {}) =>
  canCreate(words, verdicts(words, known, over));

describe("canCreate", () => {
  test("all ok can be created", () => {
    expect(canCreate(WORDS, verdicts(WORDS))).toBe(true);
  });

  // The check endpoint failing, or not having answered yet, must not block: seal re-validates.
  test("a word whose check failed or is still running can be created", () => {
    expect(can(WORDS, { ...ok, robot: undefined as never })).toBe(true);
    expect(can(WORDS, {})).toBe(true);
    expect(can(WORDS, ok, { checking: 2 })).toBe(true);
  });

  test("an empty word blocks", () => {
    expect(can(["crane", "slate", "robot", "moist", ""])).toBe(false);
  });

  test("a short word blocks", () => {
    expect(can(["crane", "slate", "robot", "moist", "lig"])).toBe(false);
  });

  test("a duplicate blocks", () => {
    expect(can(["crane", "slate", "robot", "moist", "slate"])).toBe(false);
  });

  test("a word the server rejected blocks, until it is edited", () => {
    expect(can(WORDS, { ...ok, moist: "not-a-word" })).toBe(false);
    expect(can(WORDS, ok, { server: { 3: "not-a-word" } })).toBe(false);
  });
});
