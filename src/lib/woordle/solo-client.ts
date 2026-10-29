import PartySocket from "partysocket";
import type { SoloClientMessage, SoloServerMessage } from "../../../shared/protocol";
import { useWoordle } from "./store";

function isServerMessage(value: unknown): value is SoloServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === "soloStart" || type === "guessResult" || type === "guessRejected" || type === "soloEnd";
}

export interface SoloConnection {
  send(message: SoloClientMessage): void;
  close(): void;
}

// One socket per game page, in a random room so load spreads across Durable Objects.
export function connectSolo(): SoloConnection {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
  const socket = new PartySocket({ host, party: "solo", room: crypto.randomUUID() });
  let opened = false;

  socket.addEventListener("message", (event) => {
    try {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isServerMessage(parsed)) useWoordle.getState().receive(parsed);
    } catch {
      // Ignore malformed frames; the server is trusted but the transport is not.
    }
  });
  socket.addEventListener("open", () => {
    // A reopen after a drop lands in a brand-new server session, so reset the board.
    if (opened) useWoordle.getState().disconnected();
    opened = true;
  });
  socket.addEventListener("close", () => {
    if (opened) useWoordle.getState().disconnected();
  });

  return {
    send: (message) => socket.send(JSON.stringify(message)),
    close: () => socket.close(),
  };
}
