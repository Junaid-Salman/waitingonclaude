import { describe, expect, test } from "vitest";
import answerData from "../party/data/answers.json";
import guessData from "../party/data/guesses.json";
import { isValidGuess, normalise } from "../party/games/woordle/words";

describe("word data", () => {
  test("lists are lowercase five-letter words without duplicates", () => {
    for (const list of [answerData, guessData]) {
      expect(list.every((w) => /^[a-z]{5}$/.test(w))).toBe(true);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  test("every answer is a valid guess", () => {
    const guesses = new Set(guessData);
    expect(answerData.filter((w) => !guesses.has(w))).toEqual([]);
  });

  test("answer count is within the expected range", () => {
    expect(answerData.length).toBeGreaterThanOrEqual(1200);
    expect(answerData.length).toBeLessThanOrEqual(2300);
  });

  test("uncommon and informal words are not answers but stay valid guesses", () => {
    const guesses = new Set(guessData);
    for (const word of ["wryer", "wispy", "uteri", "twang", "tacit", "fagot", "dunno", "gonna", "wanna", "lynch", "queer", "sissy", "paddy", "moron", "booby", "booty", "sperm", "groin", "thong", "urine", "vomit"]) {
      expect(answerData, word).not.toContain(word);
      expect(guesses.has(word), word).toBe(true);
    }
  });

  test("no answer is a known blocklisted word", () => {
    const sample = ["bitch", "grope", "horny", "kinky", "pussy", "semen", "spunk", "whore", "penis"];
    expect(answerData.filter((w) => sample.includes(w))).toEqual([]);
  });

  test("normalise trims and lowercases", () => {
    expect(normalise("  CrAnE\t\n")).toBe("crane");
  });

  test("isValidGuess accepts listed words only", () => {
    expect(isValidGuess("crane")).toBe(true);
    expect(isValidGuess("zzzzz")).toBe(false);
    expect(isValidGuess("")).toBe(false);
  });
});
