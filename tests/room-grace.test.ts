import { describe, expect, test } from "vitest";
import type { RoomServerMessage } from "../shared/protocol";
import { createRoom, type Effect } from "../party/room/room";
import { createFakeClock } from "./helpers/fake-clock";
import { MATCH_ANSWERS, testGame } from "./helpers/game";

const GRACE = 60_000;
const LIMIT = 180_000;
const REVEAL = 5_000;
const pid = (n: number) => `player-id-${n}-secret`;

function setup(players = 2) {
  const clock = createFakeClock();
  const emitted: Effect[] = [];
  let n = 0;
  const room = createRoom({
    game: testGame(),
    clock,
    emit: (effects) => void emitted.push(...effects),
    newPublicId: () => `pub${++n}`,
  });
  room.create();
  const send = (connId: string, message: unknown) => room.message(connId, JSON.stringify(message));
  const join = (connId: string, i: number, name = `P${i}`) => [...room.connect(connId), ...send(connId, { type: "join", playerId: pid(i), name })];
  for (let i = 1; i <= players; i++) join(`c${i}`, i);
  const to = (effects: Effect[], connId: string) => effects.flatMap((e) => (e.kind === "send" && e.to === connId ? [e.message] : []));
  const ofType = <T extends RoomServerMessage["type"]>(effects: Effect[], connId: string, type: T) =>
    to(effects, connId).filter((m): m is Extract<RoomServerMessage, { type: T }> => m.type === type);
  const lobby = (effects: Effect[], connId: string) => ofType(effects, connId, "lobby").at(-1);
  return { room, clock, emitted, send, join, to, ofType, lobby, start: () => send("c1", { type: "start" }) };
}

const roster = (l: Extract<RoomServerMessage, { type: "lobby" }> | undefined) => l?.players.map((p) => [p.name, p.isHost, p.connected]);

describe("reconnect grace in the lobby", () => {
  test("a drop keeps the seat, marked as not connected", () => {
    const t = setup(2);
    const effects = t.room.disconnect("c2");
    expect(roster(t.lobby(effects, "c1"))).toEqual([
      ["P1", true, true],
      ["P2", false, false],
    ]);
  });

  test("coming back within the grace restores the same seat, name and join order", () => {
    const t = setup(3);
    t.room.disconnect("c2");
    t.clock.advance(GRACE - 1);
    const effects = t.join("c2b", 2, "Someone else");
    const l = t.lobby(effects, "c2b");
    expect(l?.youId).toBe("pub2");
    expect(roster(l)).toEqual([
      ["P1", true, true],
      ["P2", false, true],
      ["P3", false, true],
    ]);
    // The grace timer was cancelled: nothing happens when it would have run out.
    t.clock.advance(GRACE);
    expect(t.emitted).toEqual([]);
  });

  test("the seat is removed when the grace runs out", () => {
    const t = setup(2);
    t.room.disconnect("c2");
    t.clock.advance(GRACE);
    expect(roster(t.lobby(t.emitted, "c1"))).toEqual([["P1", true, true]]);
  });

  test("a held seat still counts toward the 5-player cap", () => {
    const t = setup(5);
    t.room.disconnect("c3");
    expect(t.ofType(t.join("c6", 6), "c6", "error")).toEqual([{ type: "error", code: "room-full" }]);
    t.clock.advance(GRACE);
    expect(t.ofType(t.join("c7", 7), "c7", "lobby")).toHaveLength(1);
  });

  test("a held seat gets no messages while it is away", () => {
    const t = setup(2);
    t.room.disconnect("c2");
    const effects = t.send("c1", { type: "settings", roundSeconds: 300 });
    expect(t.to(effects, "c2")).toEqual([]);
  });
});

describe("host handover", () => {
  test("a host in grace stays host, and Start is still theirs", () => {
    const t = setup(2);
    const effects = t.room.disconnect("c1");
    expect(roster(t.lobby(effects, "c2"))?.[0]).toEqual(["P1", true, false]);
    expect(t.send("c2", { type: "start" })).toEqual([]);
  });

  test("when the host's grace runs out, host passes to the earliest-joined connected player", () => {
    const t = setup(3);
    t.room.disconnect("c2"); // the next in join order is away too
    t.room.disconnect("c1");
    t.clock.advance(GRACE);
    // P2's grace ran out at the same time (it dropped first), so P3 is the only one left.
    expect(roster(t.lobby(t.emitted, "c3"))).toEqual([["P3", true, true]]);
  });

  test("host skips a held seat and goes to a connected one", () => {
    const t = setup(3);
    t.room.disconnect("c1");
    t.clock.advance(30_000);
    t.room.disconnect("c2"); // P2 drops later, so its grace outlives P1's
    t.clock.advance(30_000); // P1's grace expires; P2 is still held
    expect(roster(t.lobby(t.emitted, "c3"))).toEqual([
      ["P2", false, false],
      ["P3", true, true],
    ]);
  });

  test("if every remaining seat is held, host goes to the earliest held one", () => {
    const t = setup(3);
    t.room.disconnect("c1"); // host drops first
    t.clock.advance(1);
    t.room.disconnect("c2");
    t.send("c3", { type: "leave" }); // nobody is connected now
    t.clock.advance(GRACE - 1); // P1's grace runs out; P2 is still held
    const back = t.join("c2b", 2);
    expect(roster(t.lobby(back, "c2b"))).toEqual([["P2", true, true]]);
  });

  test("Leave passes host at once, with no grace", () => {
    const t = setup(2);
    const effects = t.send("c1", { type: "leave" });
    expect(roster(t.lobby(effects, "c2"))).toEqual([["P2", true, true]]);
  });

  test("a returning host keeps the host role", () => {
    const t = setup(2);
    t.room.disconnect("c1");
    const effects = t.join("c1b", 1);
    expect(roster(t.lobby(effects, "c2"))?.[0]).toEqual(["P1", true, true]);
  });
});

describe("leave", () => {
  test("frees the seat at once, and the socket can no longer act for it", () => {
    const t = setup(5);
    t.send("c3", { type: "leave" });
    expect(t.ofType(t.join("c6", 6), "c6", "lobby")).toHaveLength(1);
    expect(t.send("c3", { type: "settings", roundSeconds: 300 })).toEqual([]);
  });

  test("before join, or a second time, does nothing", () => {
    const t = setup(1);
    t.room.connect("x");
    expect(t.send("x", { type: "leave" })).toEqual([]);
    t.send("c1", { type: "leave" });
    expect(t.send("c1", { type: "leave" })).toEqual([]);
  });

  test("its socket closing afterwards changes nothing", () => {
    const t = setup(2);
    t.send("c2", { type: "leave" });
    expect(t.room.disconnect("c2")).toEqual([]);
    t.clock.advance(GRACE);
    expect(t.emitted).toEqual([]);
  });
});

describe("reconnect grace in a match", () => {
  test("a drop does not end the round early: a player in grace still counts as playing", () => {
    const t = setup(2);
    t.start();
    t.room.disconnect("c2");
    const effects = t.send("c1", { type: "guess", word: MATCH_ANSWERS[0] });
    expect(t.ofType(effects, "c1", "roundEnd")).toHaveLength(0);
  });

  test("once the grace runs out the seat is removed and the round ends early if the rest are done", () => {
    const t = setup(2);
    t.start();
    t.send("c1", { type: "guess", word: MATCH_ANSWERS[0] });
    t.room.disconnect("c2");
    t.clock.advance(GRACE);
    expect(t.ofType(t.emitted, "c1", "roundEnd")).toHaveLength(1);
  });

  test("coming back gets the match lobby, then a snapshot of the running round", () => {
    const t = setup(2);
    t.start();
    t.send("c2", { type: "guess", word: "slate" });
    t.room.disconnect("c2");
    t.clock.advance(10_000);
    const effects = t.join("c2b", 2);
    expect(t.to(effects, "c2b").map((m) => m.type)).toEqual(["lobby", "matchSnapshot"]);
    const snap = t.ofType(effects, "c2b", "matchSnapshot")[0];
    expect(snap).toMatchObject({ stage: "playing", round: 1, serverNow: t.clock.now() });
    expect(snap.own.rows.map((r) => r.word)).toEqual(["slate"]);
    expect(JSON.stringify(snap)).not.toContain(MATCH_ANSWERS[0]);
  });

  test("a player in grace receives nothing while away, and misses no state when back", () => {
    const t = setup(2);
    t.start();
    t.room.disconnect("c2");
    const effects = t.send("c1", { type: "guess", word: "slate" });
    expect(t.to(effects, "c2")).toEqual([]);
    const snap = t.ofType(t.join("c2b", 2), "c2b", "matchSnapshot")[0];
    expect(snap.opponents[0].rows).toHaveLength(1);
  });

  test("after the grace runs out, the same player is new and gets match-in-progress", () => {
    const t = setup(2);
    t.start();
    t.room.disconnect("c2");
    t.clock.advance(GRACE);
    expect(t.ofType(t.join("c2b", 2), "c2b", "error")).toEqual([{ type: "error", code: "match-in-progress" }]);
  });

  test("a removed player stays in the final ranking with unsolved rounds at the full limit", () => {
    const t = setup(2);
    t.start();
    t.room.disconnect("c2");
    for (let r = 0; r < 5; r++) t.clock.advance(LIMIT + REVEAL);
    const ranking = t.ofType(t.emitted, "c1", "matchEnd")[0].ranking;
    expect(ranking.find((r) => r.name === "P2")).toMatchObject({ roundsWon: 0, totalMs: 5 * LIMIT });
  });

  test("with every seat held the match keeps running, so a solo refresh restores it", () => {
    const t = setup(1);
    t.start();
    t.room.disconnect("c1");
    t.clock.advance(GRACE - 1);
    expect(t.ofType(t.join("c1b", 1), "c1b", "matchSnapshot")).toHaveLength(1);
  });

  test("when the last seat is removed, the room resets to the lobby and cancels every timer", () => {
    const t = setup(2);
    t.start();
    t.room.disconnect("c1");
    t.room.disconnect("c2");
    t.clock.advance(GRACE);
    expect(t.clock.pending()).toBe(0);
    expect(t.ofType(t.join("new", 7), "new", "lobby")[0]).toMatchObject({ phase: "lobby" });
  });

  test("a takeover from another tab gets a snapshot too, and the old tab is replaced", () => {
    const t = setup(2);
    t.start();
    const effects = t.join("c2-dup", 2);
    expect(t.ofType(effects, "c2", "error")).toEqual([{ type: "error", code: "replaced" }]);
    expect(t.ofType(effects, "c2-dup", "matchSnapshot")).toHaveLength(1);
    // The replaced socket closing later does not start a grace on the live seat.
    const after = t.room.disconnect("c2");
    expect(after).toEqual([]);
    t.clock.advance(GRACE);
    expect(t.ofType(t.emitted, "c1", "lobby")).toHaveLength(0);
  });

  test("no message across a drop, a return and an expiry contains a secret playerId", () => {
    const t = setup(3);
    const all: Effect[] = [...t.start(), ...t.room.disconnect("c2"), ...t.join("c2b", 2), ...t.room.disconnect("c3")];
    t.clock.advance(GRACE);
    all.push(...t.emitted);
    const text = JSON.stringify(all);
    for (let i = 1; i <= 3; i++) expect(text).not.toContain(pid(i));
  });
});
