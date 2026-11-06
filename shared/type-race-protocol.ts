// Type Race message and HTTP shapes. A separate file from shared/protocol.ts (Woordle) so the
// Woordle wire format stays untouched. Holds no secrets; passages are served by the server, never
// bundled into the client (Phase 8, Q33). Room messages are below; Challenge messages arrive in 8.3.

import type { LobbyPlayer, RoomErrorCode, RoomPhase, RosterPlayer } from "./protocol";

export const PASSAGE_LENGTHS = ["short", "medium", "long"] as const;
export type PassageLength = (typeof PASSAGE_LENGTHS)[number];

export const isPassageLength = (value: unknown): value is PassageLength =>
  typeof value === "string" && (PASSAGE_LENGTHS as readonly string[]).includes(value);

// GET /parties/type-race-solo/passage?length=short&exclude=s-001,s-002
export interface PassageResponse {
  id: string;
  text: string;
  length: PassageLength;
  source?: string;
}

export interface PassageError {
  error: "invalid" | "rate-limited";
}

// More ids than this in `exclude` is a hostile request. Practice sends the last 10.
export const MAX_EXCLUDE_IDS = 20;

// ---- Race rooms (party "type-race") -------------------------------------------------------
//
// Room rules (join, cap, host, grace, takeover) are the platform's and reuse shared/protocol.ts:
// the `join`, `start`, `playAgain` and `leave` messages, `error` codes and `LobbyPlayer`.
// The spec's event names map to ours: race:countdown -> raceStart (sent when the countdown begins,
// startAt = now + 3 s), race:update -> raceProgress, race:end -> raceEnd, match:end -> matchEnd,
// room:state -> lobby + raceSnapshot. race:finish has no message: the server stamps the finish
// itself when the last word arrives (the client's clock is never trusted).

export const RACES_OPTIONS = [3, 5, 7] as const;
export type Races = (typeof RACES_OPTIONS)[number];
export const DEFAULT_RACES: Races = 5;
export const DEFAULT_LENGTH: PassageLength = "short";
export const COUNTDOWN_MS = 3000;
export const RESULTS_MS = 5000;
// The client sends progress at most this often (the last word at once).
export const PROGRESS_MIN_GAP_MS = 400;
// Per-seat limit on `progress` messages (room-level action limit for this game).
export const TYPE_RACE_ACTION_LIMIT = { limit: 5, windowMs: 1000 } as const;
// A sustained speed no human reaches; progress faster than this is clamped (spec 7).
export const MAX_WPM_CAP = 250;

export type TypeRaceClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "settings"; races?: Races; length?: PassageLength }
  | { type: "start" }
  // Cumulative: words completed, total keystrokes, wrong keystrokes. Never characters of the passage.
  | { type: "progress"; words: number; keystrokes: number; errors: number }
  | { type: "playAgain" }
  | { type: "leave" };

export interface RacePlayerResult {
  id: string;
  // null for a player who did not finish. Equal finish times share a placement (1, 1, 3).
  placement: number | null;
  wpm: number;
  accuracy: number;
  timeMs: number | null;
  // Share of the passage completed, 0 to 1.
  progress: number;
  points: number;
}

export interface RaceEnd {
  race: number;
  results: RacePlayerResult[];
  // Server time of the next raceStart (or of the match results after the last race).
  nextAt: number;
}

export interface Standing {
  id: string;
  name: string;
  points: number;
  avgWpm: number;
  avgAccuracy: number;
  bestWpm: number;
  rank: number;
}

export interface RaceProgressEntry {
  id: string;
  words: number;
  wpm: number;
  finishedMs: number | null;
}

export type RaceStage = "countdown" | "racing" | "results" | "finished";

export interface RaceSnapshot {
  type: "raceSnapshot";
  serverNow: number;
  stage: RaceStage;
  race: number;
  totalRaces: number;
  passage: { text: string; source?: string };
  startAt: number;
  endAt: number;
  players: RosterPlayer[];
  own: { words: number; keystrokes: number; errors: number; finishedMs: number | null };
  progress: RaceProgressEntry[];
  // Set from the results pause onwards.
  raceEnd: RaceEnd | null;
  standings: Standing[] | null;
}

export type TypeRaceServerMessage =
  | { type: "lobby"; players: LobbyPlayer[]; races: Races; length: PassageLength; youId: string; phase: RoomPhase }
  | { type: "error"; code: RoomErrorCode }
  // Only the current race's passage, and only once its countdown starts.
  | {
      type: "raceStart";
      race: number;
      totalRaces: number;
      passage: { text: string; source?: string };
      serverNow: number;
      startAt: number;
      endAt: number;
      players: RosterPlayer[];
    }
  // To everyone including the sender (their own copy is the acknowledgement).
  | ({ type: "raceProgress" } & RaceProgressEntry)
  | { type: "progressRejected"; reason: "rate-limited" }
  | ({ type: "raceEnd" } & RaceEnd)
  | { type: "matchEnd"; standings: Standing[] }
  | RaceSnapshot;
