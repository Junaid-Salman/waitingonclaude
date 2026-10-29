// Message types shared by client and server. No word data and no secrets belong here.
// Phase 1 defines only the solo subset; the room and match messages join in Phases 2 and 3.

export type TileColour = "green" | "yellow" | "grey";

export type GuessRejectReason = "not-a-word" | "rate-limited" | "round-over" | "no-guesses-left";

export const SOLO_MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

export type SoloClientMessage = { type: "guess"; word: string } | { type: "newGame" };

export type SoloServerMessage =
  | { type: "soloStart"; maxGuesses: number }
  | { type: "guessResult"; word: string; colours: TileColour[] }
  | { type: "guessRejected"; reason: GuessRejectReason }
  // The only message that may carry the answer, and only after the final guessResult.
  | { type: "soloEnd"; won: boolean; answer: string };
