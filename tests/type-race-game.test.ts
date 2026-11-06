import { describe, expect, test } from "vitest";
import { createTypeRaceGame } from "../party/games/type-race/game";
import { COUNTDOWN, LIMIT, PASSAGES, pid, RESULTS, setupRace, WORDS_1 } from "./helpers/type-race";

const raceEnd = (t: ReturnType<typeof setupRace>, n: number) => t.of("raceEnd").find((r) => r.race === n)!;
const pts = (t: ReturnType<typeof setupRace>, n: number) => Object.fromEntries(raceEnd(t, n).results.map((r) => [r.id, r.points]));

describe("a full match", () => {
  test("3 races: finish order, timeout, and a tie, ending in standings", () => {
    const t = setupRace(2);
    t.settings({ races: 3 });
    t.start();
    expect(t.of("raceStart", "c1")).toHaveLength(1);

    // Race 1: P1 finishes at 5 s, P2 at 9 s.
    t.advance(COUNTDOWN + 5000);
    t.finish("c1");
    t.advance(4000);
    t.finish("c2");
    // everyone finished: the race ended at once
    expect(raceEnd(t, 1)).toBeDefined();
    expect(raceEnd(t, 1).results.map((r) => [r.id, r.placement, r.points])).toEqual([["pub1", 1, 5], ["pub2", 2, 4]]);
    expect(raceEnd(t, 1).results[0].timeMs).toBe(5000);

    // Race 2: P2 finishes, P1 does not and times out.
    t.advance(RESULTS);
    expect(t.of("raceStart", "c1")).toHaveLength(2);
    t.advance(COUNTDOWN + 8000);
    t.send("c2", { type: "progress", words: WORDS_1, keystrokes: 22, errors: 3 }); // race 2 text: "red fox runs far away" (5 words)
    t.send("c1", { type: "progress", words: 2, keystrokes: 8, errors: 0 });
    expect(t.of("raceEnd", "c1")).toHaveLength(1); // P1 still racing
    t.advance(LIMIT);
    expect(pts(t, 2)).toEqual({ pub2: 5, pub1: 0 });
    expect(raceEnd(t, 2).results.map((r) => r.id)).toEqual(["pub2", "pub1"]);
    expect(raceEnd(t, 2).results[1].placement).toBeNull();

    // Race 3: both finish in the same server millisecond: shared first place.
    t.advance(RESULTS);
    t.advance(COUNTDOWN + 6000);
    t.send("c1", { type: "progress", words: 5, keystrokes: 22, errors: 0 });
    t.send("c2", { type: "progress", words: 5, keystrokes: 22, errors: 0 });
    expect(raceEnd(t, 3).results.map((r) => [r.placement, r.points])).toEqual([[1, 5], [1, 5]]);

    t.advance(RESULTS);
    const [end] = t.of("matchEnd", "c1");
    expect(end.standings.map((s) => [s.id, s.points, s.rank])).toEqual([["pub2", 14, 1], ["pub1", 10, 2]]);
    expect(end.standings.find((s) => s.id === "pub1")!.bestWpm).toBeGreaterThan(0);
  });

  test("a solo race in a room (1 player) is allowed", () => {
    const t = setupRace(1);
    t.start();
    t.advance(COUNTDOWN + 4000);
    t.finish("c1");
    expect(raceEnd(t, 1).results).toHaveLength(1);
    expect(raceEnd(t, 1).results[0].points).toBe(5);
  });

  test("Play again returns to the lobby with settings kept and new passages", () => {
    const t = setupRace(1);
    t.settings({ races: 3, length: "medium" });
    t.start();
    for (let r = 0; r < 3; r++) t.advance(COUNTDOWN + LIMIT * 1.5 + RESULTS);
    expect(t.of("matchEnd")).toHaveLength(1);
    const before = t.log.length;
    t.send("c1", { type: "playAgain" });
    const lobby = t.log.slice(before).map((l) => l.message).find((m) => m.type === "lobby");
    expect(lobby).toMatchObject({ phase: "lobby", races: 3, length: "medium" });
  });
});

describe("early end and the time limit", () => {
  test("ends when every seated player finished (not before)", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + 3000);
    t.finish("c1");
    expect(t.of("raceEnd", "c1")).toHaveLength(0);
    t.finish("c2");
    expect(t.of("raceEnd", "c1")).toHaveLength(1);
  });

  test("a player in grace keeps the race open until the time limit", () => {
    const t = setupRace(2, {}, LIMIT * 2); // grace longer than the race
    t.start();
    t.advance(COUNTDOWN + 3000);
    t.collect(t.room.disconnect("c2"));
    t.finish("c1");
    expect(t.of("raceEnd", "c1")).toHaveLength(0);
    t.advance(LIMIT - 3000 - 1);
    expect(t.of("raceEnd", "c1")).toHaveLength(0);
    t.advance(2);
    expect(raceEnd(t, 1).results.map((r) => [r.id, r.points])).toEqual([["pub1", 5], ["pub2", 0]]);
  });

  test("the time limit ends an unfinished race with 0 points", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + LIMIT);
    expect(raceEnd(t, 1).results.every((r) => r.points === 0 && r.placement === null)).toBe(true);
  });
});

describe("leaving", () => {
  test("a seat removed mid-race is DNF for that race and absent from later ones", () => {
    const t = setupRace(2);
    t.settings({ races: 3 });
    t.start();
    t.advance(COUNTDOWN + 3000);
    t.progress("c1", 2, 8);
    t.send("c1", { type: "leave" });
    t.finish("c2"); // the only one left finishes: race ends
    const r1 = raceEnd(t, 1);
    expect(r1.results.find((r) => r.id === "pub1")).toMatchObject({ placement: null, points: 0 });
    expect(r1.results.find((r) => r.id === "pub2")!.points).toBe(5);

    t.advance(RESULTS);
    const r2start = t.of("raceStart", "c2")[1];
    expect(r2start.players.map((p) => p.id)).toEqual(["pub2"]);

    t.advance(COUNTDOWN + LIMIT + RESULTS);
    t.advance(COUNTDOWN + LIMIT + RESULTS);
    const [end] = t.of("matchEnd", "c2");
    const gone = end.standings.find((s) => s.id === "pub1")!;
    expect(gone).toBeDefined(); // still listed
    expect(gone.points).toBe(0);
    // races after leaving count 0: average over 3 races, only race 1 had a WPM
    expect(gone.avgAccuracy).toBeLessThan(0.5);
  });

  test("a left player's progress is ignored", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + 3000);
    t.send("c1", { type: "leave" });
    const n = t.of("raceProgress").length;
    t.progress("c1", 2, 8);
    expect(t.of("raceProgress")).toHaveLength(n);
  });
});

describe("progress rules in a room", () => {
  test("progress before startAt is dropped (mutation-checked)", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN - 1);
    t.progress("c1", 1, 3);
    expect(t.of("raceProgress")).toHaveLength(0);
    t.advance(1);
    t.progress("c1", 1, 3);
    expect(t.of("raceProgress")).toHaveLength(2); // one copy per seat, the sender's is the ack
  });

  test("progress after the race ended is dropped (mutation-checked)", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + LIMIT); // time limit
    t.progress("c1", 3, 10);
    expect(t.of("raceProgress")).toHaveLength(0);
    // and in the results pause before the next countdown
    t.advance(1000);
    t.progress("c1", 3, 10);
    expect(t.of("raceProgress")).toHaveLength(0);
  });

  test("progress is broadcast to everyone with WPM computed by the server", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + 6000);
    t.progress("c1", 3, 10); // "go to the " = 10 chars in 6 s -> 20 wpm
    const [a] = t.of("raceProgress", "c2");
    expect(a).toMatchObject({ id: "pub1", words: 3, finishedMs: null });
    expect(a.wpm).toBeCloseTo(20, 6);
    expect(t.of("raceProgress", "c1")).toHaveLength(1);
  });

  test("a decreasing or impossible update is ignored and does not end the race", () => {
    const t = setupRace(1);
    t.start();
    t.advance(COUNTDOWN + 6000);
    t.progress("c1", 3, 10);
    t.progress("c1", 2, 10);
    t.progress("c1", 99, 10);
    t.send("c1", { type: "progress", words: "3", keystrokes: 10, errors: 0 });
    expect(t.of("raceProgress")).toHaveLength(1);
  });

  test("sending the whole passage at once is clamped by the speed cap but the final word still finishes", () => {
    const t = setupRace(1);
    t.start();
    t.advance(COUNTDOWN + 100);
    t.finish("c1");
    const [p] = t.of("raceProgress");
    expect(p.finishedMs).toBeGreaterThan(100); // earliest legal time, not 100 ms
  });

  test("over 5 progress messages in a second get progressRejected to the sender only", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + 2000);
    for (let i = 0; i < 5; i++) t.progress("c1", 1, 3 + i);
    expect(t.of("progressRejected")).toHaveLength(0);
    t.progress("c1", 1, 9);
    expect(t.of("progressRejected", "c1")).toHaveLength(1);
    expect(t.of("progressRejected", "c2")).toHaveLength(0);
    t.advance(1001);
    t.progress("c1", 2, 12);
    expect(t.of("progressRejected")).toHaveLength(1);
  });

  test("the 400 ms client gap fits the 5/s server limit", () => {
    const t = setupRace(1);
    t.start();
    t.advance(COUNTDOWN + 1000);
    for (let i = 0; i < 20; i++) {
      t.progress("c1", 1, 3 + i);
      t.advance(400);
    }
    expect(t.of("progressRejected")).toHaveLength(0);
  });
});

describe("parseAction", () => {
  const game = createTypeRaceGame();
  test("accepts a well-formed progress message", () => {
    expect(game.parseAction({ type: "progress", words: 1, keystrokes: 4, errors: 0 })).toEqual({ type: "progress", words: 1, keystrokes: 4, errors: 0 });
  });

  test.each([
    { type: "go", race: 1 },
    { type: "endRace", race: 1 },
    { type: "nextRace", race: 1 },
    { type: "finish" },
    { type: "progress", words: 1 },
    { type: "progress", words: -1, keystrokes: 1, errors: 0 },
    { type: "progress", words: 1.2, keystrokes: 1, errors: 0 },
    { type: "progress", words: "1", keystrokes: 1, errors: 0 },
    { type: "progress", words: 1, keystrokes: 1e12, errors: 0 },
    null,
    "progress",
    [],
  ])("drops %j (internal actions are never parseable)", (input) => {
    expect(game.parseAction(input)).toBeNull();
  });
});

describe("settings", () => {
  const game = createTypeRaceGame();
  const cur = { races: 5, length: "short" } as const;
  test("races and length, one or both", () => {
    expect(game.settingsUpdate!(cur, { races: 7 })).toEqual({ races: 7, length: "short" });
    expect(game.settingsUpdate!(cur, { length: "long" })).toEqual({ races: 5, length: "long" });
    expect(game.settingsUpdate!(cur, { races: 3, length: "medium" })).toEqual({ races: 3, length: "medium" });
  });

  test.each([{}, { races: 4 }, { races: "3" }, { length: "huge" }, { races: 3, length: "x" }, { roundSeconds: 120 }])("drops %j", (msg) => {
    expect(game.settingsUpdate!(cur, msg)).toBeNull();
  });

  test("the lobby carries races and length, and the limit follows the length", () => {
    const t = setupRace(1);
    t.settings({ races: 7, length: "long" });
    const lobby = t.of("lobby", "c1").at(-1)!;
    expect(lobby).toMatchObject({ races: 7, length: "long", phase: "lobby" });
    expect(Object.keys(lobby)).not.toContain("roundSeconds");
    t.start();
    t.advance(0);
    expect(t.of("raceStart", "c1")[0]).toMatchObject({ totalRaces: 7, endAt: t.of("raceStart", "c1")[0].startAt + 120_000 });
  });

  test("the time limit is 60/90/120 s for short/medium/long", () => {
    for (const [length, ms] of [["short", 60_000], ["medium", 90_000], ["long", 120_000]] as const) {
      const t = setupRace(1);
      t.settings({ length });
      t.start();
      const s = t.of("raceStart", "c1")[0];
      expect(s.endAt - s.startAt).toBe(ms);
    }
  });
});

describe("what leaves the server", () => {
  test("no future passage before its race, and no playerId anywhere", () => {
    const t = setupRace(2);
    t.settings({ races: 3 });
    t.start();
    t.advance(COUNTDOWN + 3000);
    t.finish("c1");
    t.finish("c2");
    let seen = JSON.stringify(t.log);
    expect(seen).toContain(PASSAGES[0].text);
    expect(seen).not.toContain(PASSAGES[1].text);
    expect(seen).not.toContain(PASSAGES[2].text);

    t.advance(RESULTS); // race 2 countdown begins
    seen = JSON.stringify(t.log);
    expect(seen).toContain(PASSAGES[1].text);
    expect(seen).not.toContain(PASSAGES[2].text);

    t.collect(t.room.disconnect("c2"));
    t.joinAs("c2b", 2);
    seen = JSON.stringify(t.log);
    expect(seen).not.toContain(PASSAGES[2].text); // the snapshot carries only the current race
    for (const i of [1, 2]) expect(seen).not.toContain(pid(i));
  });

  test("the passage is sent once per race, to everyone, with one startAt", () => {
    const t = setupRace(3);
    t.start();
    const starts = t.of("raceStart");
    expect(starts).toHaveLength(3);
    expect(new Set(starts.map((s) => s.startAt)).size).toBe(1);
    expect(new Set(starts.map((s) => s.passage.text)).size).toBe(1);
    expect(starts[0].startAt - starts[0].serverNow).toBe(COUNTDOWN);
  });

  test("the same passage never repeats inside a match", () => {
    const t = setupRace(1);
    t.settings({ races: 3 });
    t.start();
    for (let i = 0; i < 3; i++) t.advance(COUNTDOWN + LIMIT + RESULTS);
    const texts = t.of("raceStart", "c1").map((s) => s.passage.text);
    expect(new Set(texts).size).toBe(3);
  });
});
