import { describe, expect, test } from "vitest";
import { createBoard, submitGuess } from "../party/games/woordle/board";

describe("board", () => {
  test("a word outside the list is rejected and consumes no guess", () => {
    const board = createBoard("crane");
    const { board: next, outcome } = submitGuess(board, "zzzzz");
    expect(outcome).toEqual({ kind: "rejected", reason: "not-a-word" });
    expect(next.rows).toHaveLength(0);
  });

  test.each(["", "cran", "cranes", "12345", "cr ne"])("malformed input %j is not-a-word", (raw) => {
    expect(submitGuess(createBoard("crane"), raw).outcome).toEqual({ kind: "rejected", reason: "not-a-word" });
  });

  test("input is trimmed and lowercased before the check", () => {
    const { outcome } = submitGuess(createBoard("crane"), "  SLATE ");
    expect(outcome.kind).toBe("accepted");
  });

  test("the correct word wins", () => {
    const { board, outcome } = submitGuess(createBoard("crane"), "crane");
    expect(board.status).toBe("won");
    expect(outcome).toMatchObject({ kind: "accepted", finished: "won" });
  });

  test("the sixth wrong guess loses", () => {
    let board = createBoard("crane");
    for (let i = 0; i < 5; i++) board = submitGuess(board, "slate").board;
    expect(board.status).toBe("playing");
    const last = submitGuess(board, "slate");
    expect(last.board.status).toBe("lost");
    expect(last.outcome).toMatchObject({ finished: "lost" });
  });

  test("a guess after the game ends is round-over", () => {
    const won = submitGuess(createBoard("crane"), "crane").board;
    expect(submitGuess(won, "slate").outcome).toEqual({ kind: "rejected", reason: "round-over" });
  });

  test("submitGuess does not mutate the input board", () => {
    const board = createBoard("crane");
    submitGuess(board, "slate");
    expect(board.rows).toHaveLength(0);
  });
});
