// Message types shared by client and server. No word data and no secrets belong here.
// Phase 1 defined the solo subset, Phase 2 the room messages, Phase 3 the match messages.

export type TileColour = "green" | "yellow" | "grey";

export type GuessRejectReason = "not-a-word" | "rate-limited" | "round-over" | "no-guesses-left";

export const MAX_GUESSES = 6;
export const ROUNDS_PER_MATCH = 5;
export const WORD_LENGTH = 5;

export type SoloClientMessage = { type: "guess"; word: string } | { type: "newGame" };

export type SoloServerMessage =
  | { type: "soloStart"; maxGuesses: number }
  | { type: "guessResult"; word: string; colours: TileColour[] }
  | { type: "guessRejected"; reason: GuessRejectReason }
  // The only message that may carry the answer, and only after the final guessResult.
  | { type: "soloEnd"; won: boolean; answer: string };

// Room messages (party "main").
//
// `playerId` is a secret the client generates and keeps in sessionStorage. The server never sends
// it back: every broadcast uses the public `id` the server assigns to each seat, so seeing the
// lobby does not let anyone take another player's seat.

export type RoundSeconds = 120 | 180 | 300;
export const ROUND_SECONDS_OPTIONS: readonly RoundSeconds[] = [120, 180, 300];
export const DEFAULT_ROUND_SECONDS: RoundSeconds = 180;
export const MAX_PLAYERS = 5;
export const MAX_NAME_LENGTH = 20;

export type RoomClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "settings"; roundSeconds: RoundSeconds }
  | { type: "start" }
  | { type: "guess"; word: string }
  | { type: "playAgain" };

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
}

export type RoomErrorCode =
  | "room-full"
  | "room-not-found"
  | "match-in-progress"
  | "replaced"
  | "invalid-name";

// `lobby.phase` stays "match" from Start until the host sends Play again, so the results screen
// is part of the match as far as joining is concerned.
export type RoomPhase = "lobby" | "match";

export interface RosterPlayer {
  id: string;
  name: string;
}

export interface RoundPlayerResult {
  id: string;
  solvedMs: number | null;
  guesses: number;
}

export interface RankingEntry {
  id: string;
  name: string;
  roundsWon: number;
  totalMs: number;
  rank: number;
}

export type RoomServerMessage =
  | { type: "lobby"; players: LobbyPlayer[]; roundSeconds: number; youId: string; phase: RoomPhase }
  | { type: "error"; code: RoomErrorCode }
  // `startedAt` is the server clock when the round began, so a client can estimate its offset from
  // it on receipt. The roster lists everyone in the match, including players who have since left.
  | { type: "roundStart"; round: number; totalRounds: number; startedAt: number; endsAt: number; players: RosterPlayer[] }
  // `solvedMs` is set only on the guess that solved the round.
  | { type: "guessResult"; word: string; colours: TileColour[]; solvedMs: number | null }
  | { type: "guessRejected"; reason: GuessRejectReason }
  // Colours only, sent to everyone except the player it describes.
  | { type: "opponentProgress"; id: string; rows: TileColour[][]; solvedMs: number | null }
  // The only message that carries the answer. `nextAt` is the server time of the next roundStart
  // (or of matchEnd after the last round).
  | {
      type: "roundEnd";
      round: number;
      answer: string;
      winnerId: string | null;
      results: RoundPlayerResult[];
      nextAt: number;
    }
  | { type: "matchEnd"; ranking: RankingEntry[] };
