import { create } from "zustand";
import type { LobbyPlayer, RoomErrorCode, RoomServerMessage } from "../../../shared/protocol";

export type RoomStatus = "idle" | "connecting" | "joined" | "error";

interface RoomState {
  status: RoomStatus;
  players: LobbyPlayer[];
  roundSeconds: number;
  youId: string | null;
  error: RoomErrorCode | null;
  connecting(): void;
  receive(message: RoomServerMessage): void;
  reset(): void;
}

const empty = { status: "idle" as RoomStatus, players: [] as LobbyPlayer[], roundSeconds: 180, youId: null as string | null, error: null as RoomErrorCode | null };

// The server sends the whole lobby every time, so the client never merges or guesses.
export const useRoom = create<RoomState>((set) => ({
  ...empty,
  connecting: () => set({ ...empty, status: "connecting" }),
  receive(message) {
    if (message.type === "lobby") {
      set({ status: "joined", players: message.players, roundSeconds: message.roundSeconds, youId: message.youId, error: null });
    } else {
      set({ status: "error", error: message.code });
    }
  },
  reset: () => set(empty),
}));
