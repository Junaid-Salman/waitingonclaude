import { MAX_GUESSES, type SoloServerMessage } from "../../../shared/protocol";
import { createWindowLimiter, LIMITS } from "../../rate-limit";
import { createBoard, submitGuess, type Board } from "./board";

// Inbound frames are tiny ({"type":"guess","word":"crane"}); anything larger is hostile.
const MAX_FRAME_CHARS = 256;

export interface SoloSession {
  start(): SoloServerMessage[];
  handle(raw: string): SoloServerMessage[];
}

type ParsedMessage = { type: "guess"; word: string } | { type: "newGame" };

function parse(raw: string): ParsedMessage | null {
  if (raw.length > MAX_FRAME_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { type, word } = value as { type?: unknown; word?: unknown };
  if (type === "newGame") return { type };
  if (type === "guess" && typeof word === "string") return { type, word };
  return null;
}

// Pure session logic with no PartyKit imports, so it is unit-testable. `pickAnswer` is injected:
// production draws at random, the e2e server cycles a fixed list.
export function createSoloSession({ pickAnswer, now = Date.now }: { pickAnswer: () => string; now?: () => number }): SoloSession {
  let board: Board = createBoard(pickAnswer());
  // One session per connection, so these are the per-connection and per-player limits.
  const frames = createWindowLimiter({ ...LIMITS.frames, now });
  const guesses = createWindowLimiter({ ...LIMITS.guesses, now });

  return {
    start() {
      return [{ type: "soloStart", maxGuesses: MAX_GUESSES }];
    },

    handle(raw) {
      if (!frames.allow("frames")) return [];
      const message = parse(raw);
      if (!message) return [];

      if (message.type === "newGame") {
        if (board.status === "playing") return [];
        board = createBoard(pickAnswer());
        return [{ type: "soloStart", maxGuesses: MAX_GUESSES }];
      }

      if (!guesses.allow("guesses")) return [{ type: "guessRejected", reason: "rate-limited" }];
      const { board: next, outcome } = submitGuess(board, message.word);
      board = next;
      if (outcome.kind === "rejected") return [{ type: "guessRejected", reason: outcome.reason }];

      const out: SoloServerMessage[] = [{ type: "guessResult", word: outcome.word, colours: outcome.colours }];
      if (outcome.finished) {
        out.push({ type: "soloEnd", won: outcome.finished === "won", answer: board.answer });
      }
      return out;
    },
  };
}
