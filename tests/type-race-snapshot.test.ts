import { describe, expect, test } from "vitest";
import { COUNTDOWN, LIMIT, PASSAGES, RESULTS, setupRace } from "./helpers/type-race";

// A returning player gets `lobby`, then `raceSnapshot` built from the game's view (grace rules are
// the room's; tests/room-grace.test.ts).
function dropAndReturn(t: ReturnType<typeof setupRace>, conn = "c2", i = 2) {
  t.collect(t.room.disconnect(conn));
  const before = t.log.length;
  t.joinAs(`${conn}b`, i);
  const fresh = t.log.slice(before).filter((l) => l.to === `${conn}b`).map((l) => l.message);
  return fresh;
}

describe("raceSnapshot", () => {
  test("mid-race: own word count and keystrokes come back, the race clock keeps running", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + 6000);
    t.send("c2", { type: "progress", words: 3, keystrokes: 14, errors: 2 });
    t.advance(1000);
    const msgs = dropAndReturn(t);
    expect(msgs.map((m) => m.type)).toEqual(["lobby", "raceSnapshot"]);
    const snap = msgs[1];
    if (snap.type !== "raceSnapshot") throw new Error("no snapshot");
    expect(snap.stage).toBe("racing");
    expect(snap.own).toEqual({ words: 3, keystrokes: 14, errors: 2, finishedMs: null });
    expect(snap.passage.text).toBe(PASSAGES[0].text);
    const start = t.of("raceStart", "c1")[0];
    expect(snap.startAt).toBe(start.startAt);
    expect(snap.endAt).toBe(start.endAt);
    expect(snap.serverNow).toBeGreaterThan(start.startAt);
    expect(snap.progress.find((p) => p.id === "pub2")!.words).toBe(3);
    expect(snap.raceEnd).toBeNull();
    expect(snap.standings).toBeNull();
  });

  test("mid-countdown: the passage and start time are there, the stage is countdown", () => {
    const t = setupRace(2);
    t.start();
    t.advance(1000);
    const snap = dropAndReturn(t)[1];
    if (snap.type !== "raceSnapshot") throw new Error("no snapshot");
    expect(snap.stage).toBe("countdown");
    expect(snap.startAt - snap.serverNow).toBe(COUNTDOWN - 1000);
    expect(snap.passage.text).toBe(PASSAGES[0].text);
  });

  test("a finished player comes back finished", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + 5000);
    t.finish("c2");
    const snap = dropAndReturn(t)[1];
    if (snap.type !== "raceSnapshot") throw new Error("no snapshot");
    expect(snap.own.finishedMs).toBe(5000);
  });

  test("during the results pause the snapshot carries the results and nextAt", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + LIMIT);
    t.advance(1000);
    const snap = dropAndReturn(t)[1];
    if (snap.type !== "raceSnapshot") throw new Error("no snapshot");
    expect(snap.stage).toBe("results");
    expect(snap.raceEnd?.results).toHaveLength(2);
    expect(snap.raceEnd!.nextAt - snap.serverNow).toBe(RESULTS - 1000);
  });

  test("after the match the snapshot carries the standings", () => {
    const t = setupRace(2);
    t.settings({ races: 3 });
    t.start();
    for (let i = 0; i < 3; i++) t.advance(COUNTDOWN + LIMIT + RESULTS);
    const snap = dropAndReturn(t)[1];
    if (snap.type !== "raceSnapshot") throw new Error("no snapshot");
    expect(snap.stage).toBe("finished");
    expect(snap.standings).toHaveLength(2);
  });

  test("it never carries a later race's passage or a playerId", () => {
    const t = setupRace(2);
    t.start();
    t.advance(COUNTDOWN + 1000);
    const text = JSON.stringify(dropAndReturn(t));
    expect(text).not.toContain(PASSAGES[1].text);
    expect(text).not.toContain("player-id-");
  });
});
