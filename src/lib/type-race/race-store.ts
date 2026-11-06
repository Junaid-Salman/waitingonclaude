import { create } from "zustand";
import type { RosterPlayer } from "../../../shared/protocol";
import type { RaceEnd, RaceProgressEntry, RaceStage, Standing, TypeRaceServerMessage } from "../../../shared/type-race-protocol";
import { offsetFrom, toServerTime } from "../room/clock";
import { apply, restoreEngine, createEngine, type EngineAction, type EngineState } from "./engine";

// The race view. The server sends the passage, the clock and everyone's progress; the engine in here
// is only the local keystroke state. Nothing is computed that the server later contradicts: results
// and standings are rendered as received.

export type RaceMessage = Exclude<TypeRaceServerMessage, { type: "lobby" | "error" }>;
export type TrStage = "idle" | RaceStage;

interface RaceState {
  stage: TrStage;
  race: number;
  totalRaces: number;
  passage: string | null;
  startAt: number;
  endAt: number;
  // Server clock minus client clock, estimated at each raceStart and snapshot (display only).
  offset: number;
  roster: RosterPlayer[];
  progress: Record<string, RaceProgressEntry>;
  engine: EngineState | null;
  // The server's own acknowledgement of our progress: the words it credited, and its finish time.
  ackedWords: number;
  ownFinishedMs: number | null;
  // Bumped on every progressRejected, so the sender can resend.
  rejections: number;
  raceEnd: RaceEnd | null;
  standings: Standing[] | null;
  receive(message: RaceMessage, clientNow: number, youId?: string | null): void;
  // One keystroke. Returns the engine state when it changed, else null (locked, ignored, no change).
  input(action: EngineAction, clientNow: number): EngineState | null;
  reset(): void;
}

const empty = {
  stage: "idle" as TrStage,
  race: 0,
  totalRaces: 0,
  passage: null as string | null,
  startAt: 0,
  endAt: 0,
  offset: 0,
  roster: [] as RosterPlayer[],
  progress: {} as Record<string, RaceProgressEntry>,
  engine: null as EngineState | null,
  ackedWords: 0,
  ownFinishedMs: null as number | null,
  rejections: 0,
  raceEnd: null as RaceEnd | null,
  standings: null as Standing[] | null,
};

// The stage as the player experiences it: the server announces `countdown` once and says nothing at
// zero, so the switch to `racing` is by time.
export function stageAt(s: Pick<RaceState, "stage" | "startAt" | "offset">, clientNow: number): TrStage {
  return s.stage === "countdown" && toServerTime(clientNow, s.offset) >= s.startAt ? "racing" : s.stage;
}

export const useRace = create<RaceState>((set, get) => ({
  ...empty,

  receive(message, clientNow, youId) {
    switch (message.type) {
      case "raceStart":
        set({
          ...empty,
          stage: "countdown",
          race: message.race,
          totalRaces: message.totalRaces,
          passage: message.passage.text,
          startAt: message.startAt,
          endAt: message.endAt,
          offset: offsetFrom(message.serverNow, clientNow),
          roster: message.players,
          engine: createEngine(message.passage.text),
          // Keep the standings-free view; a new race starts clean.
        });
        break;
      case "raceProgress": {
        const { type: _type, ...entry } = message;
        void _type;
        set((s) => ({
          progress: { ...s.progress, [entry.id]: entry },
          ...(entry.id === youId ? { ackedWords: entry.words, ownFinishedMs: entry.finishedMs } : {}),
        }));
        break;
      }
      case "progressRejected":
        set((s) => ({ rejections: s.rejections + 1 }));
        break;
      case "raceEnd": {
        const { type: _type, ...end } = message;
        void _type;
        set({ stage: "results", raceEnd: end });
        break;
      }
      case "matchEnd":
        set({ stage: "finished", standings: message.standings });
        break;
      case "raceSnapshot": {
        const progress: Record<string, RaceProgressEntry> = {};
        for (const p of message.progress) progress[p.id] = p;
        set({
          ...empty,
          stage: message.stage,
          race: message.race,
          totalRaces: message.totalRaces,
          passage: message.passage.text,
          startAt: message.startAt,
          endAt: message.endAt,
          offset: offsetFrom(message.serverNow, clientNow),
          roster: message.players,
          progress,
          // Resume at the server's word count with an empty current word (Q28).
          engine: restoreEngine(message.passage.text, message.own.words, message.own.keystrokes, message.own.errors),
          ackedWords: message.own.words,
          ownFinishedMs: message.own.finishedMs,
          raceEnd: message.raceEnd,
          standings: message.standings,
        });
        break;
      }
    }
  },

  input(action, clientNow) {
    const s = get();
    if (!s.engine || stageAt(s, clientNow) !== "racing" || s.engine.finished) return null;
    // After the time limit the server drops progress; typing stops with the clock.
    if (toServerTime(clientNow, s.offset) >= s.endAt) return null;
    const next = apply(s.engine, action);
    if (next === s.engine) return null;
    set({ engine: next });
    return next;
  },

  reset: () => set(empty),
}));
