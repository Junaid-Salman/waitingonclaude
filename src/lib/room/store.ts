import { create } from "zustand";
import type { LobbyPlayer, RoomErrorCode, RoomPhase, RoomServerMessage } from "../../../shared/protocol";

export type RoomStatus = "idle" | "connecting" | "joined" | "error";

interface RoomState {
  status: RoomStatus;
  players: LobbyPlayer[];
  phase: RoomPhase;
  roundSeconds: number;
  youId: string | null;
  error: RoomErrorCode | null;
  // True after our socket dropped until the server answers the automatic re-join.
  reconnecting: boolean;
  connecting(): void;
  dropped(): void;
  receive(message: Extract<RoomServerMessage, { type: "lobby" | "error" }>): void;
  reset(): void;
}

const empty = { status: "idle" as RoomStatus, players: [] as LobbyPlayer[], phase: "lobby" as RoomPhase, roundSeconds: 180, youId: null as string | null, error: null as RoomErrorCode | null, reconnecting: false };

// The server sends the whole lobby every time, so the client never merges or guesses.
export const useRoom = create<RoomState>((set) => ({
  ...empty,
  connecting: () => set({ ...empty, status: "connecting" }),
  dropped: () => set((s) => (s.status === "joined" ? { reconnecting: true } : {})),
  receive(message) {
    if (message.type === "lobby") {
      set({ status: "joined", players: message.players, phase: message.phase, roundSeconds: message.roundSeconds, youId: message.youId, error: null, reconnecting: false });
    } else {
      // An error ends the reconnect too (the server said no), so the two messages never stack.
      set({ status: "error", error: message.code, reconnecting: false });
    }
  },
  reset: () => set(empty),
}));
