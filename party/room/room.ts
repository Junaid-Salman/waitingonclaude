import {
  DEFAULT_ROUND_SECONDS,
  MAX_PLAYERS,
  RECONNECT_GRACE_MS,
  ROUND_SECONDS_OPTIONS,
  type RoomErrorCode,
  type RoomPhase,
  type RoomServerMessage,
  type RoundSeconds,
} from "../../shared/protocol";
import { SYSTEM, type GameContext, type GameDefinition, type Sender } from "../games/types";
import { createWindowLimiter, LIMITS } from "../rate-limit";
import { cleanName, uniqueName } from "./names";
import type { PlayerId, PublicId } from "./types";

// Pure room rules with no PartyKit imports, so they port to Cloudflare Workers and unit-test
// without sockets. The adapter in party/main.ts turns effects into real sends and closes.
// The room owns players, host, phases and timers; the game owns what happens inside a match.

export type Effect =
  | { kind: "send"; to: string; message: RoomServerMessage }
  | { kind: "close"; connId: string; code: number };

export const CLOSE_CODES = { rejected: 4000, replaced: 4001 } as const;

// Inbound frames are small ({"type":"join","playerId":"…","name":"…"}); anything bigger is hostile.
const MAX_FRAME_CHARS = 512;
const PLAYER_ID_PATTERN = /^[\w-]{8,64}$/;

export interface Clock {
  now(): number;
  // Runs `fn` after `ms`; the returned function cancels it.
  setTimer(ms: number, fn: () => void): () => void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimer(ms, fn) {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
};

interface Seat {
  playerId: PlayerId;
  publicId: PublicId;
  name: string;
  joinSeq: number;
  connId: string;
  // False while the seat is held for a player who dropped; `cancelGrace` stops that hold.
  connected: boolean;
  cancelGrace: (() => void) | null;
}

export interface RoomOptions {
  game: GameDefinition<unknown, unknown, unknown>;
  clock?: Clock;
  // Receives effects produced outside a message handler, such as a round timer firing.
  emit?: (effects: Effect[]) => void;
  maxPlayers?: number;
  maxSockets?: number;
  newPublicId?: () => PublicId;
  // How long a dropped seated player keeps their seat. The e2e server shrinks it.
  graceMs?: number;
}

export interface Room {
  create(): boolean;
  connect(connId: string): Effect[];
  message(connId: string, raw: string): Effect[];
  disconnect(connId: string): Effect[];
}

const randomPublicId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

export function createRoom(options: RoomOptions): Room {
  const { game } = options;
  const maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
  const maxSockets = options.maxSockets ?? 10;
  const newPublicId = options.newPublicId ?? randomPublicId;
  const clock = options.clock ?? realClock;
  const emit = options.emit ?? (() => {});
  const graceMs = options.graceMs ?? RECONNECT_GRACE_MS;
  // Frames per socket (counted before parsing, so junk counts) and game actions per seat (so a
  // takeover from a second tab does not reset it).
  const frameLimiter = createWindowLimiter({ ...LIMITS.frames, now: () => clock.now() });
  const actionLimiter = createWindowLimiter({ ...LIMITS.guesses, now: () => clock.now() });

  let created = false;
  // "match" lasts from Start until the host sends Play again, results screen included.
  let phase: RoomPhase = "lobby";
  let matchState: unknown = null;
  let roundSeconds: RoundSeconds = DEFAULT_ROUND_SECONDS;
  let nextJoinSeq = 0;
  // Explicit, not derived from join order: a host in their reconnect grace stays host.
  let hostPlayerId: PlayerId | null = null;

  // Every open socket; `playerId` is set once the socket holds a seat.
  const sockets = new Map<string, { playerId: PlayerId | null }>();
  const seats = new Map<PlayerId, Seat>();
  // Cancel functions for the game's pending timers, so abandoning a match leaves none behind.
  const timers = new Set<() => void>();

  const send = (to: string, message: RoomServerMessage): Effect => ({ kind: "send", to, message });
  const reject = (connId: string, code: RoomErrorCode): Effect[] => {
    sockets.delete(connId);
    return [send(connId, { type: "error", code }), { kind: "close", connId, code: CLOSE_CODES.rejected }];
  };

  const ordered = () => [...seats.values()].sort((a, b) => a.joinSeq - b.joinSeq);
  const present = () => ordered().filter((s) => s.connected);
  const hostSeat = () => (hostPlayerId ? seats.get(hostPlayerId) : undefined);

  // Host passes to the earliest-joined connected seat; if everyone is in grace, the earliest held one.
  function passHost() {
    hostPlayerId = (present()[0] ?? ordered()[0])?.playerId ?? null;
  }

  // One lobby message per connected seat, because each carries that player's own `youId`.
  function broadcastLobby(): Effect[] {
    const host = hostSeat();
    const players = ordered().map((s) => ({
      id: s.publicId,
      name: s.name,
      isHost: s === host,
      connected: s.connected,
    }));
    return present().map((s) => send(s.connId, { type: "lobby", players, roundSeconds, youId: s.publicId, phase }));
  }

  function cancelTimers() {
    for (const cancel of [...timers]) cancel();
    timers.clear();
  }

  function backToLobby() {
    cancelTimers();
    phase = "lobby";
    matchState = null;
  }

  // What the room lends the game. Games only ever see public ids.
  function makeContext(out: Effect[]): GameContext<unknown> {
    // A held seat has no live socket; it gets the state back in a snapshot when it returns.
    const sendToSeats = (skip: PublicId | null, message: RoomServerMessage) => {
      for (const s of present()) if (s.publicId !== skip) out.push(send(s.connId, message));
    };
    return {
      now: () => clock.now(),
      schedule(delayMs, action) {
        let stop: () => void = () => {};
        const cancel = () => {
          stop();
          timers.delete(cancel);
        };
        stop = clock.setTimer(delayMs, () => {
          timers.delete(cancel);
          emit(act(SYSTEM, action));
        });
        timers.add(cancel);
        return cancel;
      },
      sendTo(id, message) {
        const seat = present().find((s) => s.publicId === id);
        if (seat) out.push(send(seat.connId, message));
      },
      broadcast: (message) => sendToSeats(null, message),
      broadcastExcept: (id, message) => sendToSeats(id, message),
    };
  }

  // Delivers one action to the running match and returns what the game wanted to send.
  function act(sender: Sender, action: unknown): Effect[] {
    if (phase !== "match" || matchState === null) return [];
    const out: Effect[] = [];
    matchState = game.onAction(matchState, sender, action, makeContext(out));
    return out;
  }

  // The seat is gone for good: grace expired or the player pressed Leave. Only now does the game
  // hear about it, so a player who merely dropped keeps the round open.
  function removeSeat(playerId: PlayerId): Effect[] {
    const seat = seats.get(playerId);
    if (!seat) return [];
    seat.cancelGrace?.();
    seats.delete(playerId);
    actionLimiter.forget(playerId);
    if (hostPlayerId === playerId) passHost();

    // Nobody left at all: drop the match so the next arrival finds a lobby, not a stale one.
    if (seats.size === 0) {
      backToLobby();
      return [];
    }
    const out = broadcastLobby();
    if (phase === "match" && matchState !== null) matchState = game.onPlayerLeave(matchState, seat.publicId, makeContext(out));
    return out;
  }

  function join(connId: string, playerId: PlayerId, rawName: string): Effect[] {
    const name = cleanName(rawName);
    if (!name) return reject(connId, "invalid-name");

    const existing = seats.get(playerId);
    if (existing) {
      // Newest connection wins. The old socket may be a refresh that has not closed yet, or a
      // duplicated tab sharing this sessionStorage. A seat in its grace has no socket to replace.
      const effects: Effect[] = [];
      if (existing.connected && existing.connId !== connId) {
        const old = sockets.get(existing.connId);
        if (old) old.playerId = null;
        effects.push(
          send(existing.connId, { type: "error", code: "replaced" }),
          { kind: "close", connId: existing.connId, code: CLOSE_CODES.replaced },
        );
      }
      existing.cancelGrace?.();
      existing.cancelGrace = null;
      existing.connected = true;
      existing.connId = connId;
      sockets.get(connId)!.playerId = playerId;
      effects.push(...broadcastLobby());
      // Back in a running match: the game redraws it for this player (lobby first, then snapshot).
      if (phase === "match" && matchState !== null) {
        matchState = game.onPlayerReturn(matchState, existing.publicId, makeContext(effects));
      }
      return effects;
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
      connected: true,
      cancelGrace: null,
    });
    if (hostPlayerId === null) hostPlayerId = playerId;
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
      if (!socket) return [];
      // Counted before anything else, so oversized or malformed frames still use up the budget.
      if (!frameLimiter.allow(connId)) return [];
      if (raw.length > MAX_FRAME_CHARS) return [];

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
      if (!seat) return [];
      const isHost = seat === hostSeat();

      if (msg.type === "settings") {
        if (!isHost || phase !== "lobby") return [];
        if (!ROUND_SECONDS_OPTIONS.includes(msg.roundSeconds as RoundSeconds)) return [];
        roundSeconds = msg.roundSeconds as RoundSeconds;
        return broadcastLobby();
      }

      if (msg.type === "start") {
        if (!isHost || phase !== "lobby") return [];
        const players = ordered().map((s) => ({ id: s.publicId, name: s.name, isHost: s === seat, connected: true }));
        let settings: unknown;
        try {
          settings = game.validateSettings({ roundSeconds });
        } catch {
          return [];
        }
        phase = "match";
        // The lobby message flips every client to the match view before the game's first message.
        const out = broadcastLobby();
        matchState = game.createState(players, settings, makeContext(out));
        return out;
      }

      if (msg.type === "leave") {
        socket.playerId = null;
        return removeSeat(seat.playerId);
      }

      if (msg.type === "playAgain") {
        if (!isHost || phase !== "match" || matchState === null || !game.isFinished(matchState)) return [];
        backToLobby();
        return broadcastLobby();
      }

      // Anything else is the game's business, and the game decides whether it is valid.
      if (phase !== "match") return [];
      let action: unknown;
      try {
        action = game.parseAction(msg);
      } catch {
        action = null;
      }
      if (action === null) return [];
      if (!actionLimiter.allow(seat.playerId)) {
        const reply = game.rateLimitedReply(action);
        return reply ? [send(connId, reply)] : [];
      }
      return act(seat.publicId, action);
    },

    // A dropped seated player keeps the seat for `graceMs`, in the lobby or mid-match: it still
    // counts toward the cap, the host stays host, and a round waits for them. Coming back with the
    // same playerId restores everything; otherwise the seat is removed when the hold runs out.
    disconnect(connId) {
      const socket = sockets.get(connId);
      sockets.delete(connId);
      frameLimiter.forget(connId);
      if (!socket?.playerId) return [];
      const seat = seats.get(socket.playerId);
      if (!seat || seat.connId !== connId) return []; // replaced earlier; the seat lives on
      seat.connected = false;
      const playerId = seat.playerId;
      seat.cancelGrace = clock.setTimer(graceMs, () => {
        seat.cancelGrace = null;
        emit(removeSeat(playerId));
      });
      return broadcastLobby();
    },
  };
}
