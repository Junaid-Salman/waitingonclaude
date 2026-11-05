import { create } from "zustand";
import {
  MAX_GUESSES,
  WORD_LENGTH,
  type ChallengeRoundResult,
  type ChallengeServerMessage,
  type TileColour,
} from "../../../shared/protocol";
import { offsetFrom } from "../room/clock";
import { mergeKeyColours, type KeyColours } from "../woordle/keyboard";

// idle: waiting for Start. expired / unavailable: the token or the server refused the run.
export type ChallengeStage = "idle" | "connecting" | "playing" | "reveal" | "finished" | "expired" | "unavailable";

export interface OwnRow {
  word: string;
  colours: TileColour[];
}

export interface ChallengeRoundEnd {
  round: number;
  answer: string;
  solvedMs: number | null;
  guesses: number;
  nextAt: number;
}

export interface ChallengeSummaryInfo {
  rounds: ChallengeRoundResult[];
  solved: number;
  totalMs: number;
}

interface ChallengeState {
  stage: ChallengeStage;
  round: number;
  totalRounds: number;
  limitSec: number;
  endsAt: number;
  // Server clock minus client clock, re-estimated at every round start.
  offset: number;
  rows: OwnRow[];
  input: string;
  pending: boolean;
  message: string;
  keyColours: KeyColours;
  solvedMs: number | null;
  roundEnd: ChallengeRoundEnd | null;
  summary: ChallengeSummaryInfo | null;
  type(letter: string): void;
  backspace(): void;
  // Returns the word to send, or null when the guess is not ready to submit.
  submit(): string | null;
  beginning(): void;
  // The link cannot be a challenge, so say so without asking the server.
  expire(): void;
  // The server never answered Start: back to the Start screen.
  connectTimedOut(): void;
  receive(message: ChallengeServerMessage, clientNow: number): void;
  disconnected(): void;
  reset(): void;
}

const empty = {
  stage: "idle" as ChallengeStage,
  round: 0,
  totalRounds: 5,
  limitSec: 0,
  endsAt: 0,
  offset: 0,
  rows: [] as OwnRow[],
  input: "",
  pending: false,
  message: "",
  keyColours: {} as KeyColours,
  solvedMs: null as number | null,
  roundEnd: null as ChallengeRoundEnd | null,
  summary: null as ChallengeSummaryInfo | null,
};

export const isDone = (s: Pick<ChallengeState, "solvedMs" | "rows">): boolean =>
  s.solvedMs !== null || s.rows.length >= MAX_GUESSES;

const REJECTIONS = {
  "not-a-word": "Not in word list",
  "round-over": "That round is over",
  "no-guesses-left": "No guesses left",
  "rate-limited": "Slow down",
} as const;

// Like the other stores, this never computes colours: every row comes from the server.
export const useChallenge = create<ChallengeState>((set, get) => ({
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
      set({ message: "Not enough letters" });
      return null;
    }
    set({ pending: true, message: "" });
    return s.input;
  },

  beginning: () => set({ ...empty, stage: "connecting" }),

  expire: () => set({ ...empty, stage: "expired" }),

  connectTimedOut() {
    if (get().stage !== "connecting") return;
    set({ ...empty, message: "Could not reach the server. Try Start again." });
  },

  receive(message, clientNow) {
    switch (message.type) {
      case "challengeStart":
        set({ ...empty, stage: "connecting", totalRounds: message.totalRounds, limitSec: message.limitSec });
        break;
      case "roundStart":
        set((s) => ({
          ...empty,
          limitSec: s.limitSec,
          stage: "playing",
          round: message.round,
          totalRounds: message.totalRounds,
          endsAt: message.endsAt,
          offset: offsetFrom(message.startedAt, clientNow),
        }));
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
        set({ pending: false, message: REJECTIONS[message.reason] });
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
            solvedMs: message.solvedMs,
            guesses: message.guesses,
            nextAt: message.nextAt,
          },
        });
        break;
      case "challengeEnd":
        set({ stage: "finished", summary: { rounds: message.rounds, solved: message.solved, totalMs: message.totalMs } });
        break;
      case "error":
        set({ stage: message.code === "invalid-token" ? "expired" : "unavailable" });
        break;
    }
  },

  // A dropped socket loses the run on the server, so the solver starts over from the Start screen.
  disconnected() {
    const { stage } = get();
    if (stage === "connecting" || stage === "playing" || stage === "reveal") {
      set({ ...empty, message: "Connection lost. Start again to restart the challenge." });
    }
  },

  reset: () => set(empty),
}));
