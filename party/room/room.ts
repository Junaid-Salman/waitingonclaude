import {
  DEFAULT_ROUND_SECONDS,
  MAX_PLAYERS,
  ROUND_SECONDS_OPTIONS,
  type RoomErrorCode,
  type RoomServerMessage,
  type RoundSeconds,
} from "../../shared/protocol";
import { cleanName, uniqueName } from "./names";
import type { PlayerId, PublicId } from "./types";

// Pure room rules with no PartyKit imports, so they port to Cloudflare Workers and unit-test
// without sockets. The adapter in party/main.ts turns effects into real sends and closes.

export type Effect =
  | { kind: "send"; to: string; message: RoomServerMessage }
  | { kind: "close"; connId: string; code: number };

export const CLOSE_CODES = { rejected: 4000, replaced: 4001 } as const;

// Inbound frames are small ({"type":"join","playerId":"…","name":"…"}); anything bigger is hostile.
const MAX_FRAME_CHARS = 512;
const PLAYER_ID_PATTERN = /^[\w-]{8,64}$/;

interface Seat {
  playerId: PlayerId;
  publicId: PublicId;
  name: string;
  joinSeq: number;
  connId: string;
}

export interface RoomOptions {
  maxPlayers?: number;
  maxSockets?: number;
  newPublicId?: () => PublicId;
  // Accepts one extra message that flips the room phase. Only the e2e server turns this on.
  testHooks?: boolean;
}

export interface Room {
  create(): boolean;
  connect(connId: string): Effect[];
  message(connId: string, raw: string): Effect[];
  disconnect(connId: string): Effect[];
}

const randomPublicId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

export function createRoom(options: RoomOptions = {}): Room {
  const maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
  const maxSockets = options.maxSockets ?? 10;
  const newPublicId = options.newPublicId ?? randomPublicId;

  let created = false;
  // Interim until Phase 3 adds matches: only the e2e hook ever sets "match".
  let phase: "lobby" | "match" = "lobby";
  let roundSeconds: RoundSeconds = DEFAULT_ROUND_SECONDS;
  let nextJoinSeq = 0;

  // Every open socket; `playerId` is set once the socket holds a seat.
  const sockets = new Map<string, { playerId: PlayerId | null }>();
  const seats = new Map<PlayerId, Seat>();

  const send = (to: string, message: RoomServerMessage): Effect => ({ kind: "send", to, message });
  const reject = (connId: string, code: RoomErrorCode): Effect[] => {
    sockets.delete(connId);
    return [send(connId, { type: "error", code }), { kind: "close", connId, code: CLOSE_CODES.rejected }];
  };

  const ordered = () => [...seats.values()].sort((a, b) => a.joinSeq - b.joinSeq);
  const hostSeat = () => ordered()[0];

  // One lobby message per seat, because each carries that player's own `youId`.
  function broadcastLobby(): Effect[] {
    const host = hostSeat();
    const players = ordered().map((s) => ({
      id: s.publicId,
      name: s.name,
      isHost: s === host,
      connected: true,
    }));
    return ordered().map((s) => send(s.connId, { type: "lobby", players, roundSeconds, youId: s.publicId }));
  }

  function join(connId: string, playerId: PlayerId, rawName: string): Effect[] {
    const name = cleanName(rawName);
    if (!name) return reject(connId, "invalid-name");

    const existing = seats.get(playerId);
    if (existing) {
      // Newest connection wins. The old socket may be a refresh that has not closed yet, or a
      // duplicated tab sharing this sessionStorage.
      const effects: Effect[] = [];
      if (existing.connId !== connId) {
        const old = sockets.get(existing.connId);
        if (old) old.playerId = null;
        effects.push(
          send(existing.connId, { type: "error", code: "replaced" }),
          { kind: "close", connId: existing.connId, code: CLOSE_CODES.replaced },
        );
        existing.connId = connId;
      }
      sockets.get(connId)!.playerId = playerId;
      return [...effects, ...broadcastLobby()];
    }

    if (phase === "match") return reject(connId, "match-in-progress");
    if (seats.size >= maxPlayers) return reject(connId, "room-full");

    let publicId = newPublicId();
    while ([...seats.values()].some((s) => s.publicId === publicId)) publicId = newPublicId();
    seats.set(playerId, {
      playerId,
      publicId,
      name: uniqueName([...seats.values()].map((s) => s.name), name),
      joinSeq: nextJoinSeq++,
      connId,
    });
    sockets.get(connId)!.playerId = playerId;
    return broadcastLobby();
  }

  return {
    create() {
      if (created) return false;
      created = true;
      return true;
    },

    connect(connId) {
      if (!created) {
        return [
          send(connId, { type: "error", code: "room-not-found" }),
          { kind: "close", connId, code: CLOSE_CODES.rejected },
        ];
      }
      if (sockets.size >= maxSockets) {
        return [
          send(connId, { type: "error", code: "room-full" }),
          { kind: "close", connId, code: CLOSE_CODES.rejected },
        ];
      }
      sockets.set(connId, { playerId: null });
      return [];
    },

    message(connId, raw) {
      const socket = sockets.get(connId);
      if (!socket || raw.length > MAX_FRAME_CHARS) return [];

      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        return [];
      }
      if (typeof value !== "object" || value === null) return [];
      const msg = value as Record<string, unknown>;

      if (msg.type === "join") {
        if (socket.playerId) return []; // one seat per socket
        if (typeof msg.playerId !== "string" || !PLAYER_ID_PATTERN.test(msg.playerId)) return [];
        if (typeof msg.name !== "string") return [];
        return join(connId, msg.playerId, msg.name);
      }

      // Everything else needs a seat first.
      const seat = socket.playerId ? seats.get(socket.playerId) : undefined;

      if (options.testHooks && msg.type === "__setPhase" && (msg.phase === "lobby" || msg.phase === "match")) {
        phase = msg.phase;
        return [];
      }

      if (msg.type === "settings") {
        if (!seat || seat !== hostSeat() || phase !== "lobby") return [];
        if (!ROUND_SECONDS_OPTIONS.includes(msg.roundSeconds as RoundSeconds)) return [];
        roundSeconds = msg.roundSeconds as RoundSeconds;
        return broadcastLobby();
      }

      return [];
    },

    // Interim behaviour until Phase 5: a dropped player leaves at once and host passes to the
    // earliest-joined remaining player. Phase 5 replaces this with a 60 second seat hold.
    disconnect(connId) {
      const socket = sockets.get(connId);
      sockets.delete(connId);
      if (!socket?.playerId) return [];
      const seat = seats.get(socket.playerId);
      if (!seat || seat.connId !== connId) return []; // replaced earlier; the seat lives on
      seats.delete(socket.playerId);
      return broadcastLobby();
    },
  };
}
