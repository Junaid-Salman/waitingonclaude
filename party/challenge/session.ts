import {
  CHALLENGE_ROUNDS,
  MAX_TOKEN_CHARS,
  type ChallengeClientMessage,
  type ChallengeRoundResult,
  type ChallengeServerMessage,
} from "../../shared/protocol";
import { createBoard, submitGuess, type Board } from "../games/woordle/board";
import { isValidGuess } from "../games/woordle/words";
import { createWindowLimiter, LIMITS } from "../rate-limit";
import type { Clock } from "../room/room";
import type { ChallengePayload } from "./token";

// A begin frame is a ~134 character token in a small envelope. The cap leaves room for a token at
// MAX_TOKEN_CHARS plus that envelope, so a mangled link is answered with invalid-token instead of
// being dropped; a frame past it is hostile and is never parsed.
const MAX_FRAME_CHARS = MAX_TOKEN_CHARS + 64;
const MAX_GUESS_CHARS = 16;

// Strict parse of an untrusted frame; null drops it.
export function parseChallengeFrame(raw: string): ChallengeClientMessage | null {
  if (raw.length > MAX_FRAME_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const msg = value as { type?: unknown; token?: unknown; word?: unknown };
  // The token's own length is openChallenge's check: it answers a token over the cap with invalid-token.
  if (msg.type === "begin" && typeof msg.token === "string") {
    return { type: "begin", token: msg.token };
  }
  if (msg.type === "guess" && typeof msg.word === "string" && msg.word.length <= MAX_GUESS_CHARS) {
    return { type: "guess", word: msg.word };
  }
  return null;
}

export interface ChallengeSessionOptions {
  clock: Clock;
  send(message: ChallengeServerMessage): void;
  // The pause between rounds (production 5000 ms).
  revealMs?: number;
  // Shrinks only the round limit, for tests. The reveal pause is a UI pause and is never scaled.
  timeScale?: number;
  // Injected so tests can model a word list that changed since the link was made.
  isWord?: (word: string) => boolean;
}

export interface ChallengeSession {
  // Starts a run from an opened token. Ignored while a run is in progress; allowed again after the
  // summary, which is how "Play again" works.
  start(payload: ChallengePayload): void;
  guess(raw: string): void;
  close(): void;
}

type Phase = "idle" | "round" | "reveal" | "done";

// One solver's run: pure state plus an injected clock, like the room, so it is testable without
// PartyKit. Server-authoritative: the client sends words, this decides colours, times and ends.
export function createChallengeSession(options: ChallengeSessionOptions): ChallengeSession {
  const { clock, send } = options;
  const revealMs = options.revealMs ?? 5000;
  const timeScale = options.timeScale ?? 1;
  const isWord = options.isWord ?? isValidGuess;
  const guessLimiter = createWindowLimiter({ ...LIMITS.guesses, now: () => clock.now() });

  let phase: Phase = "idle";
  let words: string[] = [];
  let limitMs = 0;
  let round = 0;
  let board: Board = createBoard("");
  let startedAt = 0;
  let endsAt = 0;
  let solvedMs: number | null = null;
  let results: ChallengeRoundResult[] = [];
  let cancelTimer: (() => void) | null = null;

  const schedule = (ms: number, fn: () => void) => {
    cancelTimer?.();
    cancelTimer = clock.setTimer(ms, fn);
  };

  function startRound(n: number) {
    phase = "round";
    round = n;
    board = createBoard(words[n - 1]);
    solvedMs = null;
    startedAt = clock.now();
    endsAt = startedAt + limitMs;
    send({ type: "roundStart", round: n, totalRounds: CHALLENGE_ROUNDS, startedAt, endsAt });
    // The round number guards a timer that fires after its round already ended.
    schedule(limitMs, () => endRound(n));
  }

  function endRound(n: number) {
    if (phase !== "round" || n !== round) return;
    phase = "reveal";
    results.push({ answer: board.answer, solvedMs, guesses: board.rows.length });
    const nextAt = clock.now() + revealMs;
    send({ type: "roundEnd", round: n, answer: board.answer, solvedMs, guesses: board.rows.length, nextAt });
    schedule(revealMs, () => (n < CHALLENGE_ROUNDS ? startRound(n + 1) : finish()));
  }

  function finish() {
    phase = "done";
    cancelTimer = null;
    // An unsolved round counts the full limit, the same rule the Time Race ranking uses.
    const totalMs = results.reduce((sum, r) => sum + (r.solvedMs ?? limitMs), 0);
    send({ type: "challengeEnd", rounds: results, solved: results.filter((r) => r.solvedMs !== null).length, totalMs });
  }

  return {
    start(payload) {
      if (phase === "round" || phase === "reveal") return;
      // A word that left the guess list since the link was made would be unwinnable.
      if (!payload.words.every((w) => isWord(w))) {
        send({ type: "error", code: "invalid-token" });
        return;
      }
      words = payload.words;
      limitMs = payload.limitSec * 1000 * timeScale;
      results = [];
      send({ type: "challengeStart", totalRounds: CHALLENGE_ROUNDS, limitSec: payload.limitSec });
      startRound(1);
    },

    guess(raw) {
      if (phase === "idle") return;
      if (!guessLimiter.allow("guesses")) {
        send({ type: "guessRejected", reason: "rate-limited" });
        return;
      }
      // A guess at or after endsAt is late even if the round timer has not fired yet.
      if (phase !== "round" || clock.now() >= endsAt) {
        send({ type: "guessRejected", reason: "round-over" });
        return;
      }
      const result = submitGuess(board, raw);
      board = result.board;
      if (result.outcome.kind === "rejected") {
        send({ type: "guessRejected", reason: result.outcome.reason });
        return;
      }
      const { word, colours, finished } = result.outcome;
      if (finished === "won") solvedMs = clock.now() - startedAt;
      send({ type: "guessResult", word, colours, solvedMs });
      if (finished) endRound(round);
    },

    close() {
      cancelTimer?.();
      cancelTimer = null;
      phase = "idle";
    },
  };
}
