import PartySocket from "partysocket";
import type { RoomErrorCode } from "../../../shared/protocol";
import type { TypeRaceClientMessage, TypeRaceServerMessage } from "../../../shared/type-race-protocol";
import { partyHost } from "../party-host";
import { useRaceLobby } from "./lobby-store";
import { useRace, type RaceMessage } from "./race-store";

const ERROR_CODES: string[] = ["room-full", "room-not-found", "match-in-progress", "replaced", "invalid-name"] satisfies RoomErrorCode[];
const RACE_TYPES = ["raceStart", "raceProgress", "progressRejected", "raceEnd", "matchEnd", "raceSnapshot"];

function isServerMessage(value: unknown): value is TypeRaceServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as { type?: unknown; code?: unknown; players?: unknown };
  if (msg.type === "lobby") return Array.isArray(msg.players);
  if (msg.type === "error") return typeof msg.code === "string" && ERROR_CODES.includes(msg.code);
  return typeof msg.type === "string" && RACE_TYPES.includes(msg.type);
}

export interface RaceRoomConnection {
  send(message: TypeRaceClientMessage): void;
  close(): void;
}

// Socket handling copied from src/lib/room/room-client.ts (Woordle), pointed at party `type-race`.
export function connectRaceRoom(options: { code: string; playerId: string; name: string }): RaceRoomConnection {
  const socket = new PartySocket({ host: partyHost(), party: "type-race", room: options.code });
  useRaceLobby.getState().connecting();
  useRace.getState().reset();

  // Sent on every open, so an automatic reconnect after a network drop re-joins by itself.
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "join", playerId: options.playerId, name: options.name }));
  });
  // The server holds the seat for 60 s, so a drop is shown as "reconnecting", not as an error.
  let closedByUs = false;
  socket.addEventListener("close", () => {
    if (!closedByUs) useRaceLobby.getState().dropped();
  });

  socket.addEventListener("message", (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!isServerMessage(parsed)) return;
    if (parsed.type === "lobby" || parsed.type === "error") {
      useRaceLobby.getState().receive(parsed);
      // Back in the lobby (Play again): forget the finished match.
      if (parsed.type === "lobby" && parsed.phase === "lobby") useRace.getState().reset();
    } else {
      useRace.getState().receive(parsed as RaceMessage, Date.now(), useRaceLobby.getState().youId);
    }
    // partysocket reconnects forever after a server-side close; every error is final for this attempt.
    if (parsed.type === "error") {
      closedByUs = true;
      socket.close();
    }
  });

  return {
    // Only on an open socket: a queued frame would flush before our re-join and be dropped as seatless.
    send: (message) => {
      if (socket.readyState === PartySocket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => {
      closedByUs = true;
      socket.close();
    },
  };
}
