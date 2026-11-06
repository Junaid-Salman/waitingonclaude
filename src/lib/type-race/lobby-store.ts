import { create } from "zustand";
import type { LobbyPlayer, RoomErrorCode, RoomPhase } from "../../../shared/protocol";
import type { PassageLength, Races, TypeRaceServerMessage } from "../../../shared/type-race-protocol";

export type RaceLobbyStatus = "idle" | "connecting" | "joined" | "error";

interface RaceLobbyState {
  status: RaceLobbyStatus;
  players: LobbyPlayer[];
  phase: RoomPhase;
  races: Races;
  length: PassageLength;
  youId: string | null;
  error: RoomErrorCode | null;
  // True after our socket dropped until the server answers the automatic re-join.
  reconnecting: boolean;
  connecting(): void;
  dropped(): void;
  receive(message: Extract<TypeRaceServerMessage, { type: "lobby" | "error" }>): void;
  reset(): void;
}

const empty = {
  status: "idle" as RaceLobbyStatus,
  players: [] as LobbyPlayer[],
  phase: "lobby" as RoomPhase,
  races: 5 as Races,
  length: "short" as PassageLength,
  youId: null as string | null,
  error: null as RoomErrorCode | null,
  reconnecting: false,
};

// Type Race's twin of useRoom (src/lib/room/store.ts), which holds Woordle's roundSeconds. The server
// sends the whole lobby every time, so the client never merges or guesses.
export const useRaceLobby = create<RaceLobbyState>((set) => ({
  ...empty,
  connecting: () => set({ ...empty, status: "connecting" }),
  dropped: () => set((s) => (s.status === "joined" ? { reconnecting: true } : {})),
  receive(message) {
    if (message.type === "lobby") {
      set({ status: "joined", players: message.players, phase: message.phase, races: message.races, length: message.length, youId: message.youId, error: null, reconnecting: false });
    } else {
      set({ status: "error", error: message.code, reconnecting: false });
    }
  },
  reset: () => set(empty),
}));
