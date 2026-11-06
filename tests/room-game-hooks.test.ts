import { describe, expect, test } from "vitest";
import type { RoomServerMessage } from "../shared/protocol";
import type { GameDefinition } from "../party/games/types";
import { createRoom, type Effect, type Room } from "../party/room/room";
import { createFakeClock } from "./helpers/fake-clock";

// A stub game with its own settings, lobby field and action limit: the room must route all three
// through the game's hooks (Phase 8.2.1) and keep its own defaults for a game without them.
interface Settings {
  level: number;
}

const stub = (extra: Partial<GameDefinition<number, Settings, { type: "ping" }>> = {}): GameDefinition<number, Settings, { type: "ping" }> => ({
  id: "stub",
  defaultSettings: { level: 1 },
  validateSettings(input) {
    const level = (input as { level?: unknown })?.level;
    if (typeof level !== "number") throw new Error("bad");
    return { level };
  },
  settingsUpdate(current, msg) {
    return typeof msg.level === "number" && msg.level >= 1 && msg.level <= 3 ? { level: msg.level } : null;
  },
  lobbyFields: ({ level }) => ({ level }),
  parseAction: (input) => ((input as { type?: unknown })?.type === "ping" ? { type: "ping" } : null),
  createState: () => 0,
  onAction(count, sender, _action, ctx) {
    ctx.broadcast({ type: "guessRejected", reason: "not-a-word" });
    return count + 1;
  },
  onPlayerLeave: (s) => s,
  onPlayerReturn: (s) => s,
  rateLimitedReply: () => ({ type: "guessRejected", reason: "rate-limited" }),
  viewFor: () => null,
  isFinished: () => false,
  ...extra,
});

function setup(game: GameDefinition<number, Settings, { type: "ping" }> = stub()) {
  const clock = createFakeClock();
  let n = 0;
  const room = createRoom({ game: game as unknown as GameDefinition<unknown, unknown, unknown>, clock, newPublicId: () => `pub${++n}` });
  room.create();
  room.connect("c1");
  room.message("c1", JSON.stringify({ type: "join", playerId: "player-id-1-secret", name: "Ali" }));
  room.connect("c2");
  room.message("c2", JSON.stringify({ type: "join", playerId: "player-id-2-secret", name: "Bo" }));
  const send = (room: Room, conn: string, msg: unknown) => room.message(conn, JSON.stringify(msg));
  return { room, clock, send };
}

const lobbies = (effects: Effect[], conn: string) =>
  effects.flatMap((e) => (e.kind === "send" && e.to === conn && e.message.type === "lobby" ? [e.message as unknown as Record<string, unknown>] : []));
const pings = (effects: Effect[]) => effects.filter((e) => e.kind === "send" && (e.message as RoomServerMessage).type === "guessRejected" && (e.message as { reason: string }).reason === "not-a-word");

describe("settings go through the game", () => {
  test("a valid update is applied and every seat's lobby carries the game's field", () => {
    const { room, send } = setup();
    const effects = send(room, "c1", { type: "settings", level: 3 });
    expect(lobbies(effects, "c1")[0].level).toBe(3);
    expect(lobbies(effects, "c2")[0].level).toBe(3);
  });

  test("the lobby starts with the game's default settings", () => {
    const { room, send } = setup();
    const effects = send(room, "c1", { type: "settings", level: 1 });
    expect(lobbies(effects, "c1")[0].level).toBe(1);
  });

  test.each([{ level: 9 }, { level: "2" }, { roundSeconds: 300 }, {}])("an update the game refuses is dropped: %j", (body) => {
    const { room, send } = setup();
    expect(send(room, "c1", { type: "settings", ...body })).toEqual([]);
  });

  test("an unknown key alone changes nothing and sends nothing", () => {
    const { room, send } = setup();
    expect(send(room, "c1", { type: "settings", colour: "red" })).toEqual([]);
  });

  test("a hook that throws is a dropped message, not a crash", () => {
    const { room, send } = setup(stub({ settingsUpdate: () => { throw new Error("boom"); } }));
    expect(send(room, "c1", { type: "settings", level: 2 })).toEqual([]);
  });

  test("a game without settingsUpdate has no settings to change", () => {
    const { room, send } = setup(stub({ settingsUpdate: undefined }));
    expect(send(room, "c1", { type: "settings", level: 2 })).toEqual([]);
  });

  test("only the host may change settings, and only in the lobby", () => {
    const { room, send } = setup();
    expect(send(room, "c2", { type: "settings", level: 2 })).toEqual([]);
    send(room, "c1", { type: "start" });
    expect(send(room, "c1", { type: "settings", level: 2 })).toEqual([]);
  });

  test("start hands the stored settings to the game", () => {
    let seen: unknown;
    const { room, send } = setup(stub({ createState: (_p, settings) => { seen = settings; return 0; } }));
    send(room, "c1", { type: "settings", level: 2 });
    send(room, "c1", { type: "start" });
    expect(seen).toEqual({ level: 2 });
  });

  test("a game without lobbyFields sends a lobby with only the room's fields", () => {
    const { room, send } = setup(stub({ lobbyFields: undefined }));
    const l = lobbies(send(room, "c1", { type: "settings", level: 2 }), "c1")[0];
    expect(Object.keys(l)).toEqual(["type", "players", "youId", "phase"]);
  });
});

describe("the per-game action limit", () => {
  const play = (t: ReturnType<typeof setup>) => {
    t.send(t.room, "c1", { type: "start" });
    return () => t.send(t.room, "c1", { type: "ping" });
  };

  test("a game's own limit is honoured: 5 per second", () => {
    const t = setup(stub({ actionLimit: { limit: 5, windowMs: 1000 } }));
    const ping = play(t);
    for (let i = 0; i < 5; i++) expect(pings(ping())).toHaveLength(2); // broadcast reaches both seats
    const sixth = ping();
    expect(pings(sixth)).toHaveLength(0);
    expect(sixth).toHaveLength(1); // the game's rateLimitedReply
    t.clock.advance(1001);
    expect(pings(ping())).toHaveLength(2);
  });

  test("without actionLimit the default stays 2 per second", () => {
    const t = setup();
    const ping = play(t);
    expect(pings(ping())).toHaveLength(2);
    expect(pings(ping())).toHaveLength(2);
    expect(pings(ping())).toHaveLength(0);
  });
});
