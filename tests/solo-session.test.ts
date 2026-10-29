import { describe, expect, test } from "vitest";
import { createSoloSession } from "../party/games/woordle/solo-session";

const guess = (word: string) => JSON.stringify({ type: "guess", word });
const make = (answer = "crane") => createSoloSession({ pickAnswer: () => answer });

describe("solo session", () => {
  test("start announces the guess limit", () => {
    expect(make().start()).toEqual([{ type: "soloStart", maxGuesses: 6 }]);
  });

  test.each([
    ["malformed JSON", "{nope"],
    ["a non-object", "42"],
    ["null", "null"],
    ["an unknown type", JSON.stringify({ type: "cheat" })],
    ["a non-string word", JSON.stringify({ type: "guess", word: 5 })],
    ["an oversized frame", JSON.stringify({ type: "guess", word: "a".repeat(1000) })],
  ])("drops %s without throwing", (_name, raw) => {
    expect(make().handle(raw)).toEqual([]);
  });

  test("an invalid word is rejected", () => {
    expect(make().handle(guess("zzzzz"))).toEqual([{ type: "guessRejected", reason: "not-a-word" }]);
  });

  test("newGame is ignored mid-game", () => {
    const session = make();
    expect(session.handle(JSON.stringify({ type: "newGame" }))).toEqual([]);
  });

  test("a win sends guessResult then soloEnd with the answer", () => {
    expect(make().handle(guess("crane"))).toEqual([
      { type: "guessResult", word: "crane", colours: ["green", "green", "green", "green", "green"] },
      { type: "soloEnd", won: true, answer: "crane" },
    ]);
  });

  test("no message before the game ends contains the answer", () => {
    const session = make("pious");
    const sent: string[] = [];
    for (let i = 0; i < 5; i++) sent.push(JSON.stringify(session.handle(guess("slate"))));
    expect(sent.join("")).not.toContain("pious");
    const last = session.handle(guess("slate"));
    expect(last.at(-1)).toEqual({ type: "soloEnd", won: false, answer: "pious" });
  });

  test("newGame after the end starts a fresh game with a new pick", () => {
    const answers = ["crane", "robot"];
    const session = createSoloSession({ pickAnswer: () => answers.shift() ?? "robot" });
    session.handle(guess("crane"));
    expect(session.handle(JSON.stringify({ type: "newGame" }))).toEqual([{ type: "soloStart", maxGuesses: 6 }]);
    expect(session.handle(guess("robot")).at(-1)).toEqual({ type: "soloEnd", won: true, answer: "robot" });
  });
});
