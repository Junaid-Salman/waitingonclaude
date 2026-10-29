import { describe, expect, test } from "vitest";
import type { RoomServerMessage } from "../shared/protocol";
import { createRoom, type Effect, type Room } from "../party/room/room";

const join = (playerId: string, name: string) => JSON.stringify({ type: "join", playerId, name });
const pid = (n: number) => `player-id-${n}-secret`;

function setup(options: Parameters<typeof createRoom>[0] = {}) {
  let n = 0;
  const room = createRoom({ newPublicId: () => `pub${++n}`, ...options });
  room.create();
  return room;
}

// Connects a socket and joins it; returns every effect produced.
function seat(room: Room, connId: string, playerId: string, name: string): Effect[] {
  return [...room.connect(connId), ...room.message(connId, join(playerId, name))];
}

const sentTo = (effects: Effect[], connId: string): RoomServerMessage[] =>
  effects.flatMap((e) => (e.kind === "send" && e.to === connId ? [e.message] : []));

const lastLobby = (effects: Effect[], connId: string) =>
  sentTo(effects, connId)
    .filter((m): m is Extract<RoomServerMessage, { type: "lobby" }> => m.type === "lobby")
    .at(-1);

const names = (effects: Effect[], connId: string) => lastLobby(effects, connId)?.players.map((p) => p.name);

describe("room creation and lookup", () => {
  test("create succeeds once, then reports the code as taken", () => {
    const room = createRoom();
    expect(room.create()).toBe(true);
    expect(room.create()).toBe(false);
  });

  test("a socket to a room that was never created gets room-not-found and is closed", () => {
    const effects = createRoom().connect("c1");
    expect(sentTo(effects, "c1")).toEqual([{ type: "error", code: "room-not-found" }]);
    expect(effects.some((e) => e.kind === "close" && e.connId === "c1")).toBe(true);
  });
});

describe("joining", () => {
  test("the first player is host and the list keeps join order", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    const effects = seat(room, "c2", pid(2), "Bo");
    const lobby = lastLobby(effects, "c2")!;
    expect(lobby.players.map((p) => [p.name, p.isHost])).toEqual([
      ["Ali", true],
      ["Bo", false],
    ]);
    expect(lobby.players.every((p) => p.connected)).toBe(true);
    expect(lobby.roundSeconds).toBe(180);
  });

  test("everyone already seated is told about a new player", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    const effects = seat(room, "c2", pid(2), "Bo");
    expect(names(effects, "c1")).toEqual(["Ali", "Bo"]);
    expect(names(effects, "c2")).toEqual(["Ali", "Bo"]);
  });

  test("the fifth player joins and the sixth gets room-full", () => {
    const room = setup();
    for (let i = 1; i <= 5; i++) seat(room, `c${i}`, pid(i), `P${i}`);
    const effects = seat(room, "c6", pid(6), "P6");
    expect(sentTo(effects, "c6")).toEqual([{ type: "error", code: "room-full" }]);
    expect(effects.some((e) => e.kind === "close" && e.connId === "c6")).toBe(true);
  });

  test("a seat opens again after someone leaves", () => {
    const room = setup();
    for (let i = 1; i <= 5; i++) seat(room, `c${i}`, pid(i), `P${i}`);
    room.disconnect("c3");
    expect(names(seat(room, "c6", pid(6), "P6"), "c6")).toEqual(["P1", "P2", "P4", "P5", "P6"]);
  });

  test("duplicate names are suffixed in join order", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    seat(room, "c2", pid(2), "Ali");
    const effects = seat(room, "c3", pid(3), "ali");
    expect(names(effects, "c3")).toEqual(["Ali", "Ali 2", "ali 3"]);
  });

  test("an unusable name gets invalid-name and the socket is closed", () => {
    const room = setup();
    const effects = seat(room, "c1", pid(1), "!!!");
    expect(sentTo(effects, "c1")).toEqual([{ type: "error", code: "invalid-name" }]);
    expect(effects.some((e) => e.kind === "close")).toBe(true);
  });

  test("a second join on the same socket is ignored", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    expect(room.message("c1", join(pid(2), "Mallory"))).toEqual([]);
  });
});

describe("match phase", () => {
  const hooked = () => setup({ testHooks: true });
  const setPhase = (room: Room, connId: string, phase: string) =>
    room.message(connId, JSON.stringify({ type: "__setPhase", phase }));

  test("a new player is blocked with match-in-progress", () => {
    const room = hooked();
    seat(room, "c1", pid(1), "Ali");
    setPhase(room, "c1", "match");
    const effects = seat(room, "c2", pid(2), "Bo");
    expect(sentTo(effects, "c2")).toEqual([{ type: "error", code: "match-in-progress" }]);
  });

  test("a player who already holds a seat is not turned away", () => {
    const room = hooked();
    seat(room, "c1", pid(1), "Ali");
    setPhase(room, "c1", "match");
    const effects = seat(room, "c1b", pid(1), "Ali");
    expect(lastLobby(effects, "c1b")?.players).toHaveLength(1);
  });

  test("after the room returns to the lobby a retry succeeds", () => {
    const room = hooked();
    seat(room, "c1", pid(1), "Ali");
    setPhase(room, "c1", "match");
    seat(room, "c2", pid(2), "Bo");
    setPhase(room, "c1", "lobby");
    expect(names(seat(room, "c3", pid(2), "Bo"), "c3")).toEqual(["Ali", "Bo"]);
  });

  test("the hook does nothing unless testHooks is on", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    room.message("c1", JSON.stringify({ type: "__setPhase", phase: "match" }));
    expect(names(seat(room, "c2", pid(2), "Bo"), "c2")).toEqual(["Ali", "Bo"]);
  });
});

describe("takeover by the same playerId", () => {
  test("the new connection keeps the seat, name, host flag and order", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    seat(room, "c2", pid(2), "Bo");
    const effects = seat(room, "c1b", pid(1), "Ali");
    const lobby = lastLobby(effects, "c1b")!;
    expect(lobby.players.map((p) => [p.name, p.isHost])).toEqual([
      ["Ali", true],
      ["Bo", false],
    ]);
  });

  test("the old connection is told it was replaced and is closed", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    const effects = seat(room, "c1b", pid(1), "Ali");
    expect(sentTo(effects, "c1")).toEqual([{ type: "error", code: "replaced" }]);
    expect(effects.some((e) => e.kind === "close" && e.connId === "c1")).toBe(true);
  });

  test("a late close from the replaced connection changes nothing", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    seat(room, "c2", pid(2), "Bo");
    seat(room, "c1b", pid(1), "Ali");
    expect(room.disconnect("c1")).toEqual([]);
    const lobby = lastLobby(seat(room, "c3", pid(3), "Cy"), "c3")!;
    expect(lobby.players.map((p) => p.name)).toEqual(["Ali", "Bo", "Cy"]);
    expect(lobby.players[0].isHost).toBe(true);
  });

  test("takeover works even when the room is full", () => {
    const room = setup();
    for (let i = 1; i <= 5; i++) seat(room, `c${i}`, pid(i), `P${i}`);
    expect(lastLobby(seat(room, "c1b", pid(1), "P1"), "c1b")?.players).toHaveLength(5);
  });
});

describe("leaving and host", () => {
  test("host passes to the earliest-joined remaining player", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    seat(room, "c2", pid(2), "Bo");
    seat(room, "c3", pid(3), "Cy");
    const effects = room.disconnect("c1");
    expect(lastLobby(effects, "c2")?.players.map((p) => [p.name, p.isHost])).toEqual([
      ["Bo", true],
      ["Cy", false],
    ]);
  });

  test("a non-host leaving leaves the host alone", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    seat(room, "c2", pid(2), "Bo");
    expect(lastLobby(room.disconnect("c2"), "c1")?.players).toEqual([
      { id: "pub1", name: "Ali", isHost: true, connected: true },
    ]);
  });

  test("the last player leaving produces nothing to send", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    expect(room.disconnect("c1")).toEqual([]);
  });

  test("a socket that never joined can close without effect", () => {
    const room = setup();
    room.connect("c1");
    expect(room.disconnect("c1")).toEqual([]);
  });
});

describe("settings", () => {
  const lobbySeconds = (effects: Effect[], connId: string) => lastLobby(effects, connId)?.roundSeconds;
  const set = (room: Room, connId: string, roundSeconds: unknown) =>
    room.message(connId, JSON.stringify({ type: "settings", roundSeconds }));

  test("the host can pick 120, 180 or 300 and everyone sees it", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    seat(room, "c2", pid(2), "Bo");
    const effects = set(room, "c1", 300);
    expect(lobbySeconds(effects, "c1")).toBe(300);
    expect(lobbySeconds(effects, "c2")).toBe(300);
  });

  test("a non-host cannot change settings", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    seat(room, "c2", pid(2), "Bo");
    expect(set(room, "c2", 300)).toEqual([]);
  });

  test.each([60, 121, "180", null, 0, -1, 1e9])("rejects %j", (value) => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    expect(set(room, "c1", value)).toEqual([]);
  });

  test("settings are ignored during a match", () => {
    const room = setup({ testHooks: true });
    seat(room, "c1", pid(1), "Ali");
    room.message("c1", JSON.stringify({ type: "__setPhase", phase: "match" }));
    expect(set(room, "c1", 300)).toEqual([]);
  });
});

describe("ids and secrets", () => {
  test("no outbound message ever contains a playerId", () => {
    const room = setup({ testHooks: true });
    const all: Effect[] = [];
    for (let i = 1; i <= 5; i++) all.push(...seat(room, `c${i}`, pid(i), `P${i}`));
    all.push(...seat(room, "c1b", pid(1), "P1")); // takeover
    all.push(...room.message("c1b", JSON.stringify({ type: "settings", roundSeconds: 120 })));
    all.push(...room.disconnect("c3"));
    all.push(...seat(room, "c6", pid(6), "P6"));
    all.push(...seat(room, "c7", pid(7), "P7")); // room-full
    const text = JSON.stringify(all);
    for (let i = 1; i <= 7; i++) expect(text).not.toContain(pid(i));
  });

  test("youId is each recipient's own public id", () => {
    const room = setup();
    seat(room, "c1", pid(1), "Ali");
    const effects = seat(room, "c2", pid(2), "Bo");
    const toAli = lastLobby(effects, "c1")!;
    const toBo = lastLobby(effects, "c2")!;
    expect(toAli.youId).not.toBe(toBo.youId);
    expect(toAli.players.find((p) => p.id === toAli.youId)?.name).toBe("Ali");
    expect(toBo.players.find((p) => p.id === toBo.youId)?.name).toBe("Bo");
  });

  test("a colliding public id is regenerated", () => {
    const ids = ["same", "same", "other"];
    const room = createRoom({ newPublicId: () => ids.shift() ?? "fallback" });
    room.create();
    seat(room, "c1", pid(1), "Ali");
    const lobby = lastLobby(seat(room, "c2", pid(2), "Bo"), "c2")!;
    expect(new Set(lobby.players.map((p) => p.id)).size).toBe(2);
  });
});

describe("hostile input", () => {
  test.each([
    ["non-JSON", "{nope"],
    ["a number", "42"],
    ["null", "null"],
    ["an array", "[]"],
    ["an unknown type", JSON.stringify({ type: "kick", id: "x" })],
    ["a join with a numeric name", JSON.stringify({ type: "join", playerId: pid(1), name: 5 })],
    ["a join with a short playerId", JSON.stringify({ type: "join", playerId: "x", name: "Ali" })],
    ["a join with a bad-character playerId", JSON.stringify({ type: "join", playerId: "bad id with spaces!", name: "Ali" })],
    ["an oversize frame", JSON.stringify({ type: "join", playerId: pid(1), name: "a".repeat(1000) })],
  ])("drops %s without throwing", (_label, raw) => {
    const room = setup();
    room.connect("c1");
    expect(room.message("c1", raw)).toEqual([]);
  });

  test("a settings message before joining is ignored", () => {
    const room = setup();
    room.connect("c1");
    expect(room.message("c1", JSON.stringify({ type: "settings", roundSeconds: 300 }))).toEqual([]);
  });

  test("a message from an unknown socket is ignored", () => {
    expect(setup().message("ghost", join(pid(1), "Ali"))).toEqual([]);
  });

  test("the 11th open socket is turned away, joined or not", () => {
    const room = setup();
    for (let i = 1; i <= 10; i++) room.connect(`c${i}`);
    const effects = room.connect("c11");
    expect(sentTo(effects, "c11")).toEqual([{ type: "error", code: "room-full" }]);
  });
});
