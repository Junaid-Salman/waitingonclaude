import { describe, expect, test } from "vitest";
import type { TileColour } from "../shared/protocol";
import { scoreGuess } from "../party/games/woordle/score";
import { answers } from "../party/games/woordle/words";

const toColours = (s: string): TileColour[] =>
  [...s].map((c) => (c === "G" ? "green" : c === "Y" ? "yellow" : "grey"));

// Hand-verified (G green, Y yellow, - grey). The first two rows are Spec 5.1.
const table: [guess: string, answer: string, expected: string][] = [
  ["speed", "abide", "--Y-Y"],
  ["eerie", "there", "Y-Y-G"],
  ["llama", "hello", "YY---"],
  ["hello", "llama", "--YY-"],
  ["aaaaa", "aback", "G-G--"],
  ["crane", "crane", "GGGGG"],
  ["crane", "ghost", "-----"],
];

describe("scoreGuess", () => {
  test.each(table)("%s vs %s", (guess, answer, expected) => {
    expect(scoreGuess(guess, answer)).toEqual(toColours(expected));
  });

  // Independent count-based reference: a letter is coloured yellow only while the answer still
  // has an unmatched copy of it, scanning left to right.
  function reference(guess: string, answer: string): TileColour[] {
    const counts: Record<string, number> = {};
    for (const c of answer) counts[c] = (counts[c] ?? 0) + 1;
    const out: TileColour[] = ["grey", "grey", "grey", "grey", "grey"];
    [...guess].forEach((c, i) => {
      if (c === answer[i]) {
        out[i] = "green";
        counts[c]--;
      }
    });
    [...guess].forEach((c, i) => {
      if (out[i] !== "green" && counts[c] > 0) {
        out[i] = "yellow";
        counts[c]--;
      }
    });
    return out;
  }

  test("matches the reference implementation on 2,000 pairs", () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000;
    for (let n = 0; n < 2000; n++) {
      const guess = answers[Math.floor(next() * answers.length)];
      const answer = answers[Math.floor(next() * answers.length)];
      expect(scoreGuess(guess, answer), `${guess} vs ${answer}`).toEqual(reference(guess, answer));
    }
  });
});
