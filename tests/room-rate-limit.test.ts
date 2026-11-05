import { describe, expect, test } from "vitest";
import type { RoomServerMessage } from "../shared/protocol";
import { createRoom, type Effect } from "../party/room/room";
import { createFakeClock } from "./helpers/fake-clock";
import { testGame } from "./helpers/game";

const pid = (n: number) => `player-id-${n}-secret`;
// Valid guesses that are not round 1's answer ("crane"), so the round stays open.
const WRONG = ["slate", "robot", "moist", "light", "about", "above", "adore", "after", "again", "agent"];

function setup() {
  const clock = createFakeClock();
  let n = 0;
  const room = createRoom({ game: testGame(), clock, newPublicId: () => `pub${++n}` });
  room.create();
  const send = (connId: string, message: unknown) => room.message(connId, JSON.stringify(message));
  for (const i of [1, 2]) {
    room.connect(`c${i}`);
    send(`c${i}`, { type: "join", playerId: pid(i), name: `P${i}` });
  }
  const ofType = <T extends RoomServerMessage["type"]>(effects: Effect[], connId: string, type: T) =>
    effects.flatMap((e) => (e.kind === "send" && e.to === connId && e.message.type === type ? [e.message as Extract<RoomServerMessage, { type: T }>] : []));
  return { room, clock, send, ofType };
}

describe("per-player guess limit (2 per second)", () => {
  test("10 rapid guesses give 2 results and 8 rate-limited rejections", () => {
    const t = setup();
    t.send("c1", { type: "start" });
    const effects = WRONG.flatMap((word) => t.send("c1", { type: "guess", word }));
    expect(t.ofType(effects, "c1", "guessResult")).toHaveLength(2);
    expect(t.ofType(effects, "c1", "guessRejected")).toEqual(Array(8).fill({ type: "guessRejected", reason: "rate-limited" }));
  });

  test("a refused guess is not recorded, so it does not shrink the next window", () => {
    const t = setup();
    t.send("c1", { type: "start" });
    t.send("c1", { type: "guess", word: WRONG[0] });
    t.send("c1", { type: "guess", word: WRONG[1] }); // t=0: the budget is spent
    t.clock.advance(600);
    expect(t.ofType(t.send("c1", { type: "guess", word: WRONG[2] }), "c1", "guessRejected")).toEqual([
      { type: "guessRejected", reason: "rate-limited" },
    ]);
    t.clock.advance(400); // t=1000: the t=0 guesses have left the window. Had the refused t=600
    // guess been recorded, only one more would fit.
    const later = WRONG.slice(3, 6).flatMap((word) => t.send("c1", { type: "guess", word }));
    expect(t.ofType(later, "c1", "guessResult")).toHaveLength(2);
  });

  test("each player has their own budget", () => {
    const t = setup();
    t.send("c1", { type: "start" });
    for (const word of WRONG.slice(0, 3)) t.send("c1", { type: "guess", word });
    expect(t.ofType(t.send("c2", { type: "guess", word: "slate" }), "c2", "guessResult")).toHaveLength(1);
  });

  test("a takeover from a second tab does not reset the budget", () => {
    const t = setup();
    t.send("c1", { type: "start" });
    t.send("c1", { type: "guess", word: WRONG[0] });
    t.send("c1", { type: "guess", word: WRONG[1] });
    t.room.connect("c1-dup");
    t.send("c1-dup", { type: "join", playerId: pid(1), name: "P1" });
    expect(t.ofType(t.send("c1-dup", { type: "guess", word: WRONG[2] }), "c1-dup", "guessRejected")).toEqual([
      { type: "guessRejected", reason: "rate-limited" },
    ]);
  });
});

describe("per-connection frame limit (30 per 10 seconds)", () => {
  test("the 31st frame in 10 seconds is dropped, whatever it is, and the window recovers", () => {
    const t = setup();
    // 29 more frames after the join: junk counts toward the budget too.
    for (let i = 0; i < 29; i++) t.room.message("c1", "not json");
    expect(t.send("c1", { type: "settings", roundSeconds: 300 })).toEqual([]);
    t.clock.advance(10_000);
    expect(t.ofType(t.send("c1", { type: "settings", roundSeconds: 300 }), "c1", "lobby")).toHaveLength(1);
  });

  test("oversized frames count too", () => {
    const t = setup();
    for (let i = 0; i < 29; i++) t.room.message("c1", "x".repeat(600));
    expect(t.send("c1", { type: "settings", roundSeconds: 300 })).toEqual([]);
  });

  test("a new connection gets a fresh budget", () => {
    const t = setup();
    for (let i = 0; i < 40; i++) t.room.message("c1", "{}");
    expect(t.ofType(t.send("c2", { type: "settings", roundSeconds: 300 }), "c2", "lobby")).toHaveLength(0); // c2 is not host
    t.room.connect("c3");
    expect(t.ofType(t.send("c3", { type: "join", playerId: pid(3), name: "P3" }), "c3", "lobby")).toHaveLength(1);
  });
});
