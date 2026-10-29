import { SOLO_MAX_GUESSES, type GuessRejectReason, type TileColour } from "../../../shared/protocol";
import { scoreGuess } from "./score";
import { isValidGuess, normalise } from "./words";

export interface BoardRow {
  word: string;
  colours: TileColour[];
}

export interface Board {
  answer: string;
  rows: BoardRow[];
  status: "playing" | "won" | "lost";
}

export type GuessOutcome =
  | { kind: "rejected"; reason: GuessRejectReason }
  | { kind: "accepted"; word: string; colours: TileColour[]; finished: "won" | "lost" | null };

export function createBoard(answer: string): Board {
  return { answer, rows: [], status: "playing" };
}

// Pure: returns a new board. A rejected guess leaves the board unchanged, so no guess is consumed.
export function submitGuess(board: Board, raw: string): { board: Board; outcome: GuessOutcome } {
  if (board.status !== "playing") {
    return { board, outcome: { kind: "rejected", reason: "round-over" } };
  }
  const word = normalise(raw);
  if (!isValidGuess(word)) {
    return { board, outcome: { kind: "rejected", reason: "not-a-word" } };
  }

  const colours = scoreGuess(word, board.answer);
  const rows = [...board.rows, { word, colours }];
  const finished = word === board.answer ? "won" : rows.length >= SOLO_MAX_GUESSES ? "lost" : null;
  return {
    board: { ...board, rows, status: finished ?? "playing" },
    outcome: { kind: "accepted", word, colours, finished },
  };
}
