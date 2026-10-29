import PartySocket from "partysocket";
import type { RoomClientMessage, RoomServerMessage } from "../../../shared/protocol";
import { partyHost } from "../party-host";
import { useRoom } from "./store";

const ERROR_CODES = ["room-full", "room-not-found", "match-in-progress", "replaced", "invalid-name"];

function isServerMessage(value: unknown): value is RoomServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as { type?: unknown; code?: unknown; players?: unknown };
  if (msg.type === "lobby") return Array.isArray(msg.players);
  return msg.type === "error" && typeof msg.code === "string" && ERROR_CODES.includes(msg.code);
}

export interface RoomConnection {
  send(message: RoomClientMessage): void;
  close(): void;
}

export function connectRoom(options: { code: string; playerId: string; name: string }): RoomConnection {
  const socket = new PartySocket({ host: partyHost(), party: "main", room: options.code });
  useRoom.getState().connecting();

  // Sent on every open, so an automatic reconnect after a network drop re-joins by itself.
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "join", playerId: options.playerId, name: options.name }));
  });

  socket.addEventListener("message", (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!isServerMessage(parsed)) return;
    useRoom.getState().receive(parsed);
    // partysocket reconnects forever after a server-side close. Every error here is final for
    // this attempt, so stop the socket or a rejected player would hammer the room.
    if (parsed.type === "error") socket.close();
  });

  return {
    send: (message) => socket.send(JSON.stringify(message)),
    close: () => socket.close(),
  };
}
