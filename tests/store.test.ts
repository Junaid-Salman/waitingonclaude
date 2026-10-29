import { beforeEach, describe, expect, test } from "vitest";
import { useWoordle } from "../src/lib/woordle/store";

const start = { type: "soloStart", maxGuesses: 6 } as const;

beforeEach(() => {
  useWoordle.getState().disconnected();
  useWoordle.setState({ message: "" });
});

describe("woordle store", () => {
  test("ignores input until the server starts a game", () => {
    useWoordle.getState().type("a");
    expect(useWoordle.getState().input).toBe("");
  });

  test("types up to five letters and ignores non-letters", () => {
    useWoordle.getState().receive(start);
    for (const key of ["c", "r", "a", "n", "e", "x", "1"]) useWoordle.getState().type(key);
    expect(useWoordle.getState().input).toBe("crane");
  });

  test("submit needs five letters, then blocks input until the server replies", () => {
    useWoordle.getState().receive(start);
    expect(useWoordle.getState().submit()).toBeNull();
    expect(useWoordle.getState().message).toBe("Not enough letters");
    for (const key of "crane") useWoordle.getState().type(key);
    expect(useWoordle.getState().submit()).toBe("crane");
    useWoordle.getState().type("x");
    expect(useWoordle.getState().input).toBe("crane");
    expect(useWoordle.getState().submit()).toBeNull();
  });

  test("guessResult adds a row, merges key colours and clears the input", () => {
    const s = useWoordle.getState();
    s.receive(start);
    for (const key of "crane") useWoordle.getState().type(key);
    useWoordle.getState().submit();
    useWoordle.getState().receive({ type: "guessResult", word: "crane", colours: ["green", "grey", "grey", "yellow", "grey"] });
    const after = useWoordle.getState();
    expect(after.rows).toHaveLength(1);
    expect(after.input).toBe("");
    expect(after.pending).toBe(false);
    expect(after.keyColours).toMatchObject({ c: "green", r: "grey", n: "yellow" });
  });

  test("a rejected guess keeps the input and unblocks typing", () => {
    useWoordle.getState().receive(start);
    for (const key of "zzzzz") useWoordle.getState().type(key);
    useWoordle.getState().submit();
    useWoordle.getState().receive({ type: "guessRejected", reason: "not-a-word" });
    expect(useWoordle.getState()).toMatchObject({ input: "zzzzz", pending: false, message: "Not in word list" });
  });

  test("the answer is only known after soloEnd", () => {
    useWoordle.getState().receive(start);
    expect(useWoordle.getState().answer).toBeNull();
    useWoordle.getState().receive({ type: "soloEnd", won: false, answer: "crane" });
    expect(useWoordle.getState()).toMatchObject({ status: "lost", answer: "crane" });
  });

  test("a dropped connection resets the board and the notice survives the new soloStart", () => {
    useWoordle.getState().receive(start);
    useWoordle.getState().receive({ type: "guessResult", word: "crane", colours: ["grey", "grey", "grey", "grey", "grey"] });
    useWoordle.getState().disconnected();
    expect(useWoordle.getState().rows).toHaveLength(0);
    useWoordle.getState().receive(start);
    expect(useWoordle.getState().message).toMatch(/Connection lost/);
    useWoordle.getState().type("a");
    expect(useWoordle.getState().message).toBe("");
  });
});
