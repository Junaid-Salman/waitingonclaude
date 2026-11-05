import PartySocket from "partysocket";
import type { ChallengeClientMessage, ChallengeServerMessage } from "../../../shared/protocol";
import { partyHost } from "../party-host";
import { useChallenge } from "./store";

const TYPES = ["challengeStart", "roundStart", "guessResult", "guessRejected", "roundEnd", "challengeEnd", "error"];

function isServerMessage(value: unknown): value is ChallengeServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && TYPES.includes(type);
}

export interface ChallengeConnection {
  send(message: ChallengeClientMessage): void;
  close(): void;
}

// One socket per solver page, in a random room so load spreads across Durable Objects. It is
// opened when the solver clicks Start, not when the page loads.
export function connectChallenge(): ChallengeConnection {
  const socket = new PartySocket({ host: partyHost(), party: "challenge", room: crypto.randomUUID() });
  // A close we asked for (unmount, connect timeout, final error) must not touch the store, or a
  // late close event could knock a newer connection back to the Start screen.
  let closedByUs = false;
  useChallenge.getState().reset();

  socket.addEventListener("message", (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!isServerMessage(parsed)) return;
    useChallenge.getState().receive(parsed, Date.now());
    // partysocket reconnects forever after a server-side close. An error here is final for this
    // link, so stop the socket.
    if (parsed.type === "error") {
      closedByUs = true;
      socket.close();
    }
  });
  // A reopened socket lands in a brand-new server session, so the run in progress is gone.
  socket.addEventListener("close", () => {
    if (!closedByUs) useChallenge.getState().disconnected();
  });

  return {
    send: (message) => socket.send(JSON.stringify(message)),
    close: () => {
      closedByUs = true;
      socket.close();
    },
  };
}
