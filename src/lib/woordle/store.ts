import { create } from "zustand";
import { WORD_LENGTH, type SoloServerMessage, type TileColour } from "../../../shared/protocol";
import { mergeKeyColours, type KeyColours } from "./keyboard";

export interface Row {
  word: string;
  colours: TileColour[];
}

export type Status = "connecting" | "playing" | "won" | "lost";

interface WoordleState {
  status: Status;
  maxGuesses: number;
  rows: Row[];
  input: string;
  pending: boolean;
  message: string;
  keyColours: KeyColours;
  answer: string | null;
  type(letter: string): void;
  backspace(): void;
  // Returns the word to send, or null when the guess is not ready to submit.
  submit(): string | null;
  receive(message: SoloServerMessage): void;
  disconnected(): void;
}

const fresh = {
  rows: [] as Row[],
  input: "",
  pending: false,
  message: "",
  keyColours: {} as KeyColours,
  answer: null as string | null,
};

// The store never computes colours: every row comes from a server guessResult.
export const useWoordle = create<WoordleState>((set, get) => ({
  status: "connecting",
  maxGuesses: 6,
  ...fresh,

  type(letter) {
    const { status, pending, input } = get();
    if (status !== "playing" || pending || input.length >= WORD_LENGTH) return;
    if (!/^[a-z]$/.test(letter)) return;
    set({ input: input + letter, message: "" });
  },

  backspace() {
    const { status, pending, input } = get();
    if (status !== "playing" || pending) return;
    set({ input: input.slice(0, -1), message: "" });
  },

  submit() {
    const { status, pending, input } = get();
    if (status !== "playing" || pending) return null;
    if (input.length < WORD_LENGTH) {
      set({ message: "Not enough letters" });
      return null;
    }
    set({ pending: true, message: "" });
    return input;
  },

  receive(message) {
    switch (message.type) {
      case "soloStart":
        // Keep the "connection lost" notice that disconnected() set; it clears on the next keystroke.
        set((s) => ({
          ...fresh,
          status: "playing",
          maxGuesses: message.maxGuesses,
          message: s.status === "connecting" ? s.message : "",
        }));
        break;
      case "guessResult":
        set((s) => ({
          rows: [...s.rows, { word: message.word, colours: message.colours }],
          keyColours: mergeKeyColours(s.keyColours, message.word, message.colours),
          input: "",
          pending: false,
        }));
        break;
      case "guessRejected":
        set({
          pending: false,
          message: message.reason === "not-a-word" ? "Not in word list" : "Guess not accepted",
        });
        break;
      case "soloEnd":
        set({ status: message.won ? "won" : "lost", answer: message.answer, pending: false });
        break;
    }
  },

  disconnected() {
    set({ ...fresh, status: "connecting", message: "Connection lost. A new game starts when we reconnect." });
  },
}));
