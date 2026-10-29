import { describe, expect, test } from "vitest";
import type { RoomServerMessage } from "../shared/protocol";
import { createRoom, type Effect, type Room } from "../party/room/room";
import { createFakeClock } from "./helpers/fake-clock";
import { MATCH_ANSWERS, testGame } from "./helpers/game";

const LIMIT = 180_000;
const REVEAL = 5_000;
const pid = (n: number) => `player-id-${n}-secret`;
const send = (room: Room, connId: string, message: unknown) => room.message(connId, JSON.stringify(message));

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
  for (let i = 1; i <= players; i++) {
    room.connect(`c${i}`);
    room.message(`c${i}`, JSON.stringify({ type: "join", playerId: pid(i), name: `P${i}` }));
  }
  const to = (effects: Effect[], connId: string) =>
    effects.flatMap((e) => (e.kind === "send" && e.to === connId ? [e.message] : []));
  const ofType = <T extends RoomServerMessage["type"]>(effects: Effect[], connId: string, type: T) =>
    to(effects, connId).filter((m): m is Extract<RoomServerMessage, { type: T }> => m.type === type);
  return { room, clock, emitted, to, ofType, start: () => send(room, "c1", { type: "start" }) };
}

// Plays every round to its time limit, returning everything emitted by timers.
const playOut = (t: ReturnType<typeof setup>) => {
  for (let round = 0; round < 5; round++) t.clock.advance(LIMIT + REVEAL);
};

describe("start", () => {
  test("only the host can start, and only from the lobby", () => {
    const t = setup(2);
    expect(send(t.room, "c2", { type: "start" })).toEqual([]);
    const first = t.start();
    expect(t.ofType(first, "c1", "roundStart")).toHaveLength(1);
    expect(t.start()).toEqual([]); // already in a match
  });

  test("a one-player room can start", () => {
    const t = setup(1);
    expect(t.ofType(t.start(), "c1", "roundStart")).toHaveLength(1);
  });

  test("everyone gets the match-phase lobby first, then roundStart", () => {
    const t = setup(2);
    const effects = t.start();
    for (const conn of ["c1", "c2"]) {
      const types = t.to(effects, conn).map((m) => m.type);
      expect(types).toEqual(["lobby", "roundStart"]);
      expect(t.ofType(effects, conn, "lobby")[0].phase).toBe("match");
    }
  });

  test("the roster uses the same public ids as the lobby", () => {
    const t = setup(2);
    const effects = t.start();
    const lobbyIds = t.ofType(effects, "c1", "lobby")[0].players.map((p) => p.id);
    expect(t.ofType(effects, "c1", "roundStart")[0].players.map((p) => p.id)).toEqual(lobbyIds);
  });

  test("start is not accepted before a seat is held", () => {
    const t = setup(1);
    t.room.connect("lurker");
    expect(send(t.room, "lurker", { type: "start" })).toEqual([]);
  });
});

describe("joining during a match", () => {
  test("a new player is blocked while rounds are running", () => {
    const t = setup(2);
    t.start();
    t.room.connect("late");
    const effects = t.room.message("late", JSON.stringify({ type: "join", playerId: pid(9), name: "Late" }));
    expect(t.to(effects, "late")).toEqual([{ type: "error", code: "match-in-progress" }]);
  });

  test("a new player is still blocked on the results screen", () => {
    const t = setup(2);
    t.start();
    playOut(t);
    expect(t.ofType(t.emitted, "c1", "matchEnd")).toHaveLength(1);
    t.room.connect("late");
    const effects = t.room.message("late", JSON.stringify({ type: "join", playerId: pid(9), name: "Late" }));
    expect(t.to(effects, "late")).toEqual([{ type: "error", code: "match-in-progress" }]);
  });
});

describe("play again", () => {
  const finished = () => {
    const t = setup(2);
    t.start();
    playOut(t);
    return t;
  };

  test("is ignored while rounds are still running", () => {
    const t = setup(2);
    t.start();
    expect(send(t.room, "c1", { type: "playAgain" })).toEqual([]);
    t.clock.advance(LIMIT + REVEAL * 5);
    expect(send(t.room, "c1", { type: "playAgain" })).toEqual([]); // still before round 5 ends
  });

  test("is ignored in the lobby", () => {
    expect(send(setup(2).room, "c1", { type: "playAgain" })).toEqual([]);
  });

  test("only the host can use it", () => {
    const t = finished();
    expect(send(t.room, "c2", { type: "playAgain" })).toEqual([]);
  });

  test("returns everyone to the lobby with the same players", () => {
    const t = finished();
    const effects = send(t.room, "c1", { type: "playAgain" });
    for (const conn of ["c1", "c2"]) {
      const lobby = t.ofType(effects, conn, "lobby")[0];
      expect(lobby.phase).toBe("lobby");
      expect(lobby.players.map((p) => p.name)).toEqual(["P1", "P2"]);
    }
  });

  test("a turned-away player can join once the room is back in the lobby", () => {
    const t = finished();
    send(t.room, "c1", { type: "playAgain" });
    t.room.connect("late");
    const effects = t.room.message("late", JSON.stringify({ type: "join", playerId: pid(9), name: "Late" }));
    expect(t.ofType(effects, "late", "lobby")[0].players.map((p) => p.name)).toEqual(["P1", "P2", "Late"]);
  });

  test("a second match can start and leaves no timers behind from the first", () => {
    const t = finished();
    expect(t.clock.pending()).toBe(0);
    send(t.room, "c1", { type: "playAgain" });
    const effects = t.start();
    expect(t.ofType(effects, "c2", "roundStart")).toHaveLength(1);
    expect(t.clock.pending()).toBe(1); // just the new round's timer
  });

  test("round length can be changed again in the lobby after a match", () => {
    const t = finished();
    send(t.room, "c1", { type: "playAgain" });
    const effects = send(t.room, "c1", { type: "settings", roundSeconds: 120 });
    expect(t.ofType(effects, "c2", "lobby")[0].roundSeconds).toBe(120);
  });

  test("if the host leaves on the results screen, the next host can send it", () => {
    const t = finished();
    t.room.disconnect("c1");
    const effects = send(t.room, "c2", { type: "playAgain" });
    expect(t.ofType(effects, "c2", "lobby")[0]).toMatchObject({ phase: "lobby" });
  });
});

describe("forwarding to the game", () => {
  test("a guess from a seated player reaches the game and the reply goes to that connection", () => {
    const t = setup(2);
    t.start();
    const effects = send(t.room, "c1", { type: "guess", word: "slate" });
    expect(t.ofType(effects, "c1", "guessResult")).toHaveLength(1);
    expect(t.ofType(effects, "c2", "guessResult")).toHaveLength(0);
    expect(t.ofType(effects, "c2", "opponentProgress")).toHaveLength(1);
    expect(t.ofType(effects, "c1", "opponentProgress")).toHaveLength(0);
  });

  test("opponentProgress identifies the player by public id, never the secret", () => {
    const t = setup(2);
    t.start();
    const effects = send(t.room, "c1", { type: "guess", word: "slate" });
    expect(t.ofType(effects, "c2", "opponentProgress")[0].id).toBe("pub1");
    expect(JSON.stringify(effects)).not.toContain(pid(1));
  });

  test("a guess in the lobby is ignored", () => {
    const t = setup(2);
    expect(send(t.room, "c1", { type: "guess", word: "crane" })).toEqual([]);
  });

  test("a guess from a socket without a seat is ignored", () => {
    const t = setup(1);
    t.start();
    t.room.connect("lurker");
    expect(send(t.room, "lurker", { type: "guess", word: "crane" })).toEqual([]);
  });

  test.each([
    ["an unknown type", { type: "kick", id: "pub2" }],
    ["a spoofed endRound", { type: "endRound", round: 1 }],
    ["a spoofed nextRound", { type: "nextRound", round: 1 }],
    ["a spoofed finish", { type: "finish" }],
    ["a numeric word", { type: "guess", word: 5 }],
    ["an oversize word", { type: "guess", word: "a".repeat(40) }],
  ])("drops %s without touching the match", (_name, payload) => {
    const t = setup(2);
    t.start();
    expect(send(t.room, "c1", payload)).toEqual([]);
    t.clock.advance(LIMIT - 1); // the round is still running: nothing ended it early
    expect(t.ofType(t.emitted, "c1", "roundEnd")).toHaveLength(0);
  });
});

describe("timers", () => {
  test("the round end reaches every seat through emit", () => {
    const t = setup(3);
    t.start();
    t.clock.advance(LIMIT);
    for (const conn of ["c1", "c2", "c3"]) {
      expect(t.ofType(t.emitted, conn, "roundEnd")).toHaveLength(1);
    }
  });

  test("the next round starts after the reveal", () => {
    const t = setup(2);
    t.start();
    t.clock.advance(LIMIT + REVEAL);
    expect(t.ofType(t.emitted, "c2", "roundStart").map((m) => m.round)).toEqual([2]);
  });

  test("a full match ends with matchEnd for everyone", () => {
    const t = setup(2);
    t.start();
    playOut(t);
    for (const conn of ["c1", "c2"]) expect(t.ofType(t.emitted, conn, "matchEnd")).toHaveLength(1);
  });

  test("the answer is not sent to anyone before the round ends", () => {
    const t = setup(2);
    const effects = [...t.start(), ...send(t.room, "c1", { type: "guess", word: "slate" })];
    expect(JSON.stringify(effects)).not.toContain(`"${MATCH_ANSWERS[0]}"`);
  });
});

describe("leaving", () => {
  test("a player leaving mid-match shows as gone in the lobby and the match goes on", () => {
    const t = setup(3);
    t.start();
    const effects = t.room.disconnect("c3");
    expect(t.ofType(effects, "c1", "lobby")[0].players.map((p) => p.name)).toEqual(["P1", "P2"]);
    t.clock.advance(LIMIT);
    expect(t.ofType(t.emitted, "c1", "roundEnd")).toHaveLength(1);
    expect(t.ofType(t.emitted, "c3", "roundEnd")).toHaveLength(0);
  });

  test("when the last unfinished player leaves, the round ends early", () => {
    const t = setup(2);
    t.start();
    send(t.room, "c1", { type: "guess", word: MATCH_ANSWERS[0] });
    const effects = t.room.disconnect("c2");
    expect(t.ofType(effects, "c1", "roundEnd")).toHaveLength(1);
  });

  test("a leaver stays in the final ranking", () => {
    const t = setup(2);
    t.start();
    t.room.disconnect("c2");
    playOut(t);
    const ranking = t.ofType(t.emitted, "c1", "matchEnd")[0].ranking;
    expect(ranking.map((r) => r.name).sort()).toEqual(["P1", "P2"]);
  });

  test("host passes to the next player mid-match", () => {
    const t = setup(2);
    t.start();
    const effects = t.room.disconnect("c1");
    expect(t.ofType(effects, "c2", "lobby")[0].players[0]).toMatchObject({ name: "P2", isHost: true });
  });

  test("when everyone leaves, the room goes back to the lobby and cancels its timers", () => {
    const t = setup(2);
    t.start();
    t.room.disconnect("c1");
    t.room.disconnect("c2");
    expect(t.clock.pending()).toBe(0);
    const before = t.emitted.length;
    t.clock.advance(LIMIT * 6);
    expect(t.emitted.length).toBe(before);
    // The code is reusable: a newcomer finds a lobby, not a stale match.
    t.room.connect("new");
    const effects = t.room.message("new", JSON.stringify({ type: "join", playerId: pid(7), name: "New" }));
    expect(t.ofType(effects, "new", "lobby")[0]).toMatchObject({ phase: "lobby" });
  });

  test("a stale round timer from an abandoned match cannot end the next match's round", () => {
    const t = setup(1);
    t.start();
    t.room.disconnect("c1");
    t.room.connect("c9");
    t.room.message("c9", JSON.stringify({ type: "join", playerId: pid(9), name: "New" }));
    send(t.room, "c9", { type: "start" });
    t.clock.advance(LIMIT - 1);
    expect(t.ofType(t.emitted, "c9", "roundEnd")).toHaveLength(0);
  });
});

describe("secrets", () => {
  test("no message in a whole match contains a secret playerId", () => {
    const t = setup(3);
    const all: Effect[] = [...t.start(), ...send(t.room, "c1", { type: "guess", word: "slate" }), ...t.room.disconnect("c3")];
    playOut(t);
    all.push(...t.emitted, ...send(t.room, "c1", { type: "playAgain" }));
    const text = JSON.stringify(all);
    for (let i = 1; i <= 3; i++) expect(text).not.toContain(pid(i));
  });
});
