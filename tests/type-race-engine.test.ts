import { describe, expect, test } from "vitest";
import { accuracy, wpm } from "../shared/type-race/stats";
import { apply, createEngine, correctKeystrokes, ERROR_BUFFER, typedSplit, type EngineAction, type EngineState } from "../src/lib/type-race/engine";

const chars = (text: string): EngineAction[] => [...text].map((char) => ({ type: "char", char }));
const run = (state: EngineState, actions: EngineAction[]) => actions.reduce(apply, state);
const type = (state: EngineState, text: string) => run(state, chars(text));
const BACK: EngineAction = { type: "backspace" };

describe("exact matching and locking", () => {
  test("typing a word with its space locks it and moves on", () => {
    const s = type(createEngine("the cat sat"), "the ");
    expect(s.wordIndex).toBe(1);
    expect(s.typed).toBe("");
    expect(s.lockedChars).toBe(4);
  });

  test("the last word locks without a trailing space and finishes the run", () => {
    const s = type(createEngine("go now"), "go now");
    expect(s.finished).toBe(true);
    expect(s.lockedChars).toBe(6);
    expect(s.keystrokes).toBe(6);
    expect(s.errors).toBe(0);
  });

  test("a word is not locked before its trailing space", () => {
    const s = type(createEngine("the cat"), "the");
    expect(s.wordIndex).toBe(0);
    expect(s.typed).toBe("the");
  });

  test("case matters", () => {
    const s = type(createEngine("Go now"), "g");
    expect(s.firstError).toBe(0);
    expect(s.errors).toBe(1);
  });

  test("punctuation and spaces must match", () => {
    const s = type(createEngine("Hi, you"), "Hi ");
    expect(s.firstError).toBe(2);
    expect(s.wordIndex).toBe(0);
  });

  test("nothing is accepted after the run is finished", () => {
    const done = type(createEngine("go"), "go");
    expect(apply(done, { type: "char", char: "x" })).toBe(done);
    expect(apply(done, BACK)).toBe(done);
  });

  test("only single characters are accepted", () => {
    const s = createEngine("hello world");
    expect(apply(s, { type: "char", char: "he" })).toBe(s);
    expect(apply(s, { type: "char", char: "" })).toBe(s);
  });
});

describe("errors", () => {
  test("a wrong character is shown and counted, correct ones before it stay", () => {
    const s = type(createEngine("hello world"), "hex");
    expect(s.typed).toBe("hex");
    expect(s.firstError).toBe(2);
    expect(s.errors).toBe(1);
    expect(typedSplit(s)).toEqual({ correct: "he", wrong: "x" });
  });

  test("a typo blocks progress: the word cannot lock until it is fixed", () => {
    let s = type(createEngine("ab cd"), "ax");
    s = type(s, " ");
    expect(s.wordIndex).toBe(0);
    s = run(s, [BACK, BACK]); // the space, then the x
    expect(s.typed).toBe("a");
    expect(s.firstError).toBeNull();
    s = type(s, "b ");
    expect(s.wordIndex).toBe(1);
  });

  test("characters after the first error are wrong too, even if they match the text", () => {
    const s = type(createEngine("abcdef"), "axcd");
    expect(s.errors).toBe(3); // x, then c and d count as wrong because an error precedes them
    expect(correctKeystrokes(s)).toBe(1);
  });

  test("errors stay counted after they are fixed", () => {
    const s = type(run(type(createEngine("cat"), "cx"), [BACK]), "at");
    expect(s.finished).toBe(true);
    expect(s.errors).toBe(1);
    expect(s.keystrokes).toBe(4);
  });
});

describe("error buffer", () => {
  const overflow = (extra: number) => type(createEngine("abcdefghijklmnop qr"), `x${"y".repeat(extra)}`);

  test("accepts exactly 5 characters past the first error", () => {
    const s = overflow(ERROR_BUFFER);
    expect(s.typed).toBe(`x${"y".repeat(5)}`);
    expect(s.keystrokes).toBe(6);
  });

  test("the 6th character after the error is ignored and not counted", () => {
    const s = overflow(ERROR_BUFFER + 3);
    expect(s.typed).toBe(`x${"y".repeat(5)}`);
    expect(s.keystrokes).toBe(6);
    expect(s.errors).toBe(6);
  });

  test("Backspace frees the buffer again", () => {
    const full = overflow(ERROR_BUFFER);
    const s = type(apply(full, BACK), "z");
    expect(s.typed).toBe(`x${"y".repeat(4)}z`);
  });

  test("an error on the first character leaves room for 5 more, not 4", () => {
    expect(ERROR_BUFFER).toBe(5);
    expect(overflow(5).typed.length).toBe(6);
  });
});

describe("backspace", () => {
  test("removes the last character of the current word", () => {
    expect(apply(type(createEngine("hello"), "hel"), BACK).typed).toBe("he");
  });

  test("on an empty current word it does nothing: locked words cannot be edited", () => {
    const afterLock = type(createEngine("ab cd"), "ab ");
    expect(apply(afterLock, BACK)).toBe(afterLock);
    expect(apply(afterLock, BACK).wordIndex).toBe(1);
  });

  test("backspace is not a keystroke", () => {
    const s = apply(type(createEngine("hello"), "hel"), BACK);
    expect(s.keystrokes).toBe(3);
  });

  test("clearWord empties the current word and the error, and keeps locked words", () => {
    const s = apply(type(createEngine("ab cd"), "ab cx"), { type: "clearWord" });
    expect(s.typed).toBe("");
    expect(s.firstError).toBeNull();
    expect(s.wordIndex).toBe(1);
    expect(s.lockedChars).toBe(3);
  });
});

describe("a whole passage with typos matches the stats", () => {
  test("lockedChars, keystrokes and errors feed wpm and accuracy", () => {
    const text = "the quick brown fox";
    let s = createEngine(text);
    s = type(s, "the qu");
    s = type(s, "x"); // typo
    s = run(s, [BACK]);
    s = type(s, "ick brown ");
    s = type(s, "fz"); // typo in the last word
    s = run(s, [BACK]);
    s = type(s, "ox");
    expect(s.finished).toBe(true);
    expect(s.lockedChars).toBe(text.length);
    expect(s.errors).toBe(2);
    expect(s.keystrokes).toBe(text.length + 2); // each typo costs one extra keystroke
    expect(accuracy(correctKeystrokes(s), s.keystrokes)).toBeCloseTo(text.length / s.keystrokes, 10);
    expect(wpm(s.lockedChars, 60_000)).toBeCloseTo(text.length / 5, 10);
  });
});
