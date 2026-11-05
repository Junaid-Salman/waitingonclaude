import { create } from "zustand";
import {
  MAX_GUESSES,
  WORD_LENGTH,
  type RankingEntry,
  type RoomServerMessage,
  type RosterPlayer,
  type RoundPlayerResult,
  type TileColour,
} from "../../../shared/protocol";
import { mergeKeyColours, type KeyColours } from "../woordle/keyboard";
import { offsetFrom } from "./clock";

export type MatchMessage = Exclude<RoomServerMessage, { type: "lobby" } | { type: "error" }>;

export type MatchStage = "idle" | "playing" | "reveal" | "finished";

export interface OwnRow {
  word: string;
  colours: TileColour[];
}

export interface OpponentBoard {
  rows: TileColour[][];
  solvedMs: number | null;
}

export interface RoundEndInfo {
  round: number;
  answer: string;
  winnerId: string | null;
  results: RoundPlayerResult[];
  nextAt: number;
}

interface MatchState {
  stage: MatchStage;
  round: number;
  totalRounds: number;
  endsAt: number;
  // Server clock minus client clock, re-estimated at every round start.
  offset: number;
  roster: RosterPlayer[];
  rows: OwnRow[];
  input: string;
  pending: boolean;
  message: string;
  keyColours: KeyColours;
  solvedMs: number | null;
  opponents: Record<string, OpponentBoard>;
  roundEnd: RoundEndInfo | null;
  ranking: RankingEntry[] | null;
  // Bumped on every refused guess, so the board can shake once per refusal.
  rejections: number;
  type(letter: string): void;
  backspace(): void;
  // Returns the word to send, or null when the guess is not ready to submit.
  submit(): string | null;
  receive(message: MatchMessage, clientNow: number): void;
  reset(): void;
}

const empty = {
  stage: "idle" as MatchStage,
  round: 0,
  totalRounds: 5,
  endsAt: 0,
  offset: 0,
  roster: [] as RosterPlayer[],
  rows: [] as OwnRow[],
  input: "",
  pending: false,
  message: "",
  keyColours: {} as KeyColours,
  solvedMs: null as number | null,
  opponents: {} as Record<string, OpponentBoard>,
  roundEnd: null as RoundEndInfo | null,
  ranking: null as RankingEntry[] | null,
  rejections: 0,
};

// This player has solved the round or used every guess, so the board is locked.
export const isDone = (s: Pick<MatchState, "solvedMs" | "rows">): boolean =>
  s.solvedMs !== null || s.rows.length >= MAX_GUESSES;

const REJECTIONS = {
  "not-a-word": "Not in word list",
  "round-over": "That round is over",
  "no-guesses-left": "No guesses left",
  "rate-limited": "Slow down",
} as const;

// Like the solo store, this never computes colours: every row comes from the server.
export const useMatch = create<MatchState>((set, get) => ({
  ...empty,

  type(letter) {
    const s = get();
    if (s.stage !== "playing" || s.pending || isDone(s) || s.input.length >= WORD_LENGTH) return;
    if (!/^[a-z]$/.test(letter)) return;
    set({ input: s.input + letter, message: "" });
  },

  backspace() {
    const s = get();
    if (s.stage !== "playing" || s.pending || isDone(s)) return;
    set({ input: s.input.slice(0, -1), message: "" });
  },

  submit() {
    const s = get();
    if (s.stage !== "playing" || s.pending || isDone(s)) return null;
    if (s.input.length < WORD_LENGTH) {
      set({ message: "Not enough letters", rejections: s.rejections + 1 });
      return null;
    }
    set({ pending: true, message: "" });
    return s.input;
  },

  receive(message, clientNow) {
    switch (message.type) {
      case "roundStart":
        set({
          ...empty,
          stage: "playing",
          round: message.round,
          totalRounds: message.totalRounds,
          endsAt: message.endsAt,
          offset: offsetFrom(message.startedAt, clientNow),
          roster: message.players,
        });
        break;
      case "guessResult":
        set((s) => ({
          rows: [...s.rows, { word: message.word, colours: message.colours }],
          keyColours: mergeKeyColours(s.keyColours, message.word, message.colours),
          solvedMs: message.solvedMs ?? s.solvedMs,
          input: "",
          pending: false,
        }));
        break;
      case "guessRejected":
        set((s) => ({ pending: false, message: REJECTIONS[message.reason], rejections: s.rejections + 1 }));
        break;
      case "opponentProgress":
        set((s) => ({ opponents: { ...s.opponents, [message.id]: { rows: message.rows, solvedMs: message.solvedMs } } }));
        break;
      case "roundEnd":
        set({
          stage: "reveal",
          input: "",
          pending: false,
          message: "",
          roundEnd: {
            round: message.round,
            answer: message.answer,
            winnerId: message.winnerId,
            results: message.results,
            nextAt: message.nextAt,
          },
        });
        break;
      case "matchEnd":
        set({ stage: "finished", ranking: message.ranking });
        break;
      case "matchSnapshot": {
        // A refresh or reconnect mid-match: rebuild the whole screen from the server's view.
        const rows = message.own.rows.map((r) => ({ word: r.word, colours: r.colours }));
        set({
          ...empty,
          stage: message.stage === "playing" ? "playing" : message.stage === "reveal" ? "reveal" : "finished",
          round: message.round,
          totalRounds: message.totalRounds,
          endsAt: message.endsAt,
          offset: offsetFrom(message.serverNow, clientNow),
          roster: message.players,
          rows,
          keyColours: rows.reduce<KeyColours>((acc, r) => mergeKeyColours(acc, r.word, r.colours), {}),
          solvedMs: message.own.solvedMs,
          opponents: Object.fromEntries(message.opponents.map((o) => [o.id, { rows: o.rows, solvedMs: o.solvedMs }])),
          roundEnd: message.roundEnd ? { round: message.round, ...message.roundEnd } : null,
          ranking: message.ranking,
        });
        break;
      }
    }
  },

  reset: () => set(empty),
}));
