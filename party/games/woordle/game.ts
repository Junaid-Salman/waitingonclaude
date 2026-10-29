import {
  MAX_GUESSES,
  ROUNDS_PER_MATCH,
  ROUND_SECONDS_OPTIONS,
  DEFAULT_ROUND_SECONDS,
  type RankingEntry,
  type RoundSeconds,
  type TileColour,
} from "../../../shared/protocol";
import type { RoomPlayer, PublicId } from "../../room/types";
import { SYSTEM, type GameContext, type GameDefinition, type Sender } from "../types";
import { createBoard, submitGuess, type Board } from "./board";
import { pickDistinct } from "./pick";
import { rankPlayers } from "./ranking";
import { answers } from "./words";

// Guesses are five letters; anything much longer is hostile and never reaches the word list.
const MAX_WORD_CHARS = 16;

export interface WoordleSettings {
  roundSeconds: RoundSeconds;
}

export type WoordleAction =
  | { type: "guess"; word: string }
  // Scheduled by the game itself. parseAction never produces these from client input.
  | { type: "endRound"; round: number }
  | { type: "nextRound"; round: number }
  | { type: "finish" };

interface PlayerState {
  id: PublicId;
  name: string;
  connected: boolean;
  roundsWon: number;
  totalMs: number;
}

interface PlayerRound {
  board: Board;
  solvedMs: number | null;
}

interface RoundState {
  n: number;
  answer: string;
  startedAt: number;
  endsAt: number;
  status: "running" | "revealing";
  boards: Map<PublicId, PlayerRound>;
  winnerId: PublicId | null;
}

// Owned by the game: handlers mutate it and return it.
export interface WoordleState {
  limitMs: number;
  answers: string[];
  players: PlayerState[];
  round: RoundState | null;
  status: "running" | "finished";
  ranking: RankingEntry[] | null;
  cancelTimer: (() => void) | null;
}

export interface WoordleOptions {
  // Five different answers for a match. Defaults to a random sample from the answer list.
  pickAnswers?: (count: number) => string[];
  // Multiplies each round's time limit. Always 1 in production; the e2e server shrinks it so a whole
  // match takes seconds.
  timeScale?: number;
  // Pause between rounds. It is a UI pause, not a game clock, so timeScale does not shrink it.
  revealMs?: number;
}

type Ctx = GameContext<WoordleAction>;

const isSeconds = (value: unknown): value is RoundSeconds => ROUND_SECONDS_OPTIONS.includes(value as RoundSeconds);

// What a player may see of one board: colours and the solve time, never letters.
function publicBoard(entry: PlayerRound): { rows: TileColour[][]; solvedMs: number | null } {
  return { rows: entry.board.rows.map((r) => r.colours), solvedMs: entry.solvedMs };
}

export function createWoordleGame(options: WoordleOptions = {}): GameDefinition<WoordleState, WoordleSettings, WoordleAction> {
  const scale = options.timeScale ?? 1;
  const revealMs = options.revealMs ?? 5000;
  const pickAnswers = options.pickAnswers ?? ((count: number) => pickDistinct(answers, count));

  function startRound(state: WoordleState, n: number, ctx: Ctx) {
    const startedAt = ctx.now();
    const round: RoundState = {
      n,
      answer: state.answers[n - 1],
      startedAt,
      endsAt: startedAt + state.limitMs,
      status: "running",
      boards: new Map(),
      winnerId: null,
    };
    for (const p of state.players) round.boards.set(p.id, { board: createBoard(round.answer), solvedMs: null });
    state.round = round;
    state.cancelTimer = ctx.schedule(state.limitMs, { type: "endRound", round: n });
    ctx.broadcast({
      type: "roundStart",
      round: n,
      totalRounds: ROUNDS_PER_MATCH,
      startedAt,
      endsAt: round.endsAt,
      players: state.players.map((p) => ({ id: p.id, name: p.name })),
    });
  }

  function endRound(state: WoordleState, ctx: Ctx) {
    const round = state.round;
    if (!round || round.status !== "running") return;
    round.status = "revealing";
    state.cancelTimer?.();

    // Every player counts, including anyone who left: an unsolved round is the full limit.
    const results = state.players.map((p) => {
      const entry = round.boards.get(p.id)!;
      p.totalMs += entry.solvedMs ?? state.limitMs;
      return { id: p.id, solvedMs: entry.solvedMs, guesses: entry.board.rows.length };
    });
    const winner = state.players.find((p) => p.id === round.winnerId);
    if (winner) winner.roundsWon++;

    ctx.broadcast({
      type: "roundEnd",
      round: round.n,
      answer: round.answer,
      winnerId: round.winnerId,
      results,
      nextAt: ctx.now() + revealMs,
    });
    // After the last round the same pause lets players read the answer before the ranking.
    state.cancelTimer = ctx.schedule(
      revealMs,
      round.n < ROUNDS_PER_MATCH ? { type: "nextRound", round: round.n } : { type: "finish" },
    );
  }

  // Ends the round as soon as every connected player has solved or used all guesses.
  function endEarlyIfDone(state: WoordleState, ctx: Ctx) {
    const round = state.round;
    if (!round || round.status !== "running") return;
    const connected = state.players.filter((p) => p.connected);
    if (connected.length === 0) return;
    if (connected.every((p) => round.boards.get(p.id)!.board.status !== "playing")) endRound(state, ctx);
  }

  function guess(state: WoordleState, id: PublicId, word: string, ctx: Ctx) {
    const round = state.round;
    const entry = round?.boards.get(id);
    if (!round || !entry) return;
    // A guess at or after endsAt can arrive before the timer fires; the clock decides, not the timer.
    if (round.status !== "running" || ctx.now() >= round.endsAt) {
      ctx.sendTo(id, { type: "guessRejected", reason: "round-over" });
      return;
    }
    if (entry.board.status === "lost") {
      ctx.sendTo(id, { type: "guessRejected", reason: "no-guesses-left" });
      return;
    }
    if (entry.board.status === "won") {
      ctx.sendTo(id, { type: "guessRejected", reason: "round-over" });
      return;
    }

    const { board, outcome } = submitGuess(entry.board, word);
    if (outcome.kind === "rejected") {
      ctx.sendTo(id, { type: "guessRejected", reason: outcome.reason });
      return;
    }
    entry.board = board;
    if (outcome.finished === "won") {
      entry.solvedMs = ctx.now() - round.startedAt;
      // Messages are handled one at a time, so the earlier solve is always the first here.
      if (round.winnerId === null) round.winnerId = id;
    }

    ctx.sendTo(id, {
      type: "guessResult",
      word: outcome.word,
      colours: outcome.colours,
      solvedMs: outcome.finished === "won" ? entry.solvedMs : null,
    });
    ctx.broadcastExcept(id, { type: "opponentProgress", id, ...publicBoard(entry) });
    endEarlyIfDone(state, ctx);
  }

  function finish(state: WoordleState, ctx: Ctx) {
    if (state.status === "finished") return;
    state.status = "finished";
    state.cancelTimer = null;
    state.ranking = rankPlayers(state.players);
    ctx.broadcast({ type: "matchEnd", ranking: state.ranking });
  }

  return {
    id: "woordle",
    defaultSettings: { roundSeconds: DEFAULT_ROUND_SECONDS },

    validateSettings(input) {
      const roundSeconds = (input as { roundSeconds?: unknown } | null)?.roundSeconds;
      if (!isSeconds(roundSeconds)) throw new Error("invalid roundSeconds");
      return { roundSeconds };
    },

    parseAction(input) {
      if (typeof input !== "object" || input === null) return null;
      const { type, word } = input as { type?: unknown; word?: unknown };
      if (type === "guess" && typeof word === "string" && word.length <= MAX_WORD_CHARS) return { type, word };
      return null;
    },

    createState(players: RoomPlayer[], settings, ctx) {
      const state: WoordleState = {
        limitMs: settings.roundSeconds * 1000 * scale,
        answers: pickAnswers(ROUNDS_PER_MATCH),
        players: players.map((p) => ({ id: p.id, name: p.name, connected: true, roundsWon: 0, totalMs: 0 })),
        round: null,
        status: "running",
        ranking: null,
        cancelTimer: null,
      };
      startRound(state, 1, ctx);
      return state;
    },

    onAction(state, sender: Sender, action, ctx) {
      switch (action.type) {
        case "guess":
          if (sender !== SYSTEM) guess(state, sender, action.word, ctx);
          break;
        case "endRound":
          if (sender === SYSTEM && state.round?.n === action.round) endRound(state, ctx);
          break;
        case "nextRound":
          if (sender === SYSTEM && state.round?.n === action.round && state.round.status === "revealing") {
            startRound(state, action.round + 1, ctx);
          }
          break;
        case "finish":
          if (sender === SYSTEM) finish(state, ctx);
          break;
      }
      return state;
    },

    onPlayerLeave(state, id, ctx) {
      const player = state.players.find((p) => p.id === id);
      if (player) player.connected = false;
      endEarlyIfDone(state, ctx);
      return state;
    },

    viewFor(state, id) {
      const round = state.round;
      const own = round?.boards.get(id);
      const over = state.status === "finished" || round?.status === "revealing";
      return {
        round: round?.n ?? null,
        totalRounds: ROUNDS_PER_MATCH,
        own: own ? { rows: own.board.rows, solvedMs: own.solvedMs, maxGuesses: MAX_GUESSES } : null,
        opponents: round
          ? state.players
              .filter((p) => p.id !== id)
              .map((p) => ({ id: p.id, name: p.name, ...publicBoard(round.boards.get(p.id)!) }))
          : [],
        // The answer is revealed only once the round is over.
        answer: over && round ? round.answer : null,
        ranking: state.ranking,
      };
    },

    isFinished: (state) => state.status === "finished",
  };
}
