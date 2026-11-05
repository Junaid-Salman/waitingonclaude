import { describe, expect, test } from "vitest";
import { SYSTEM, type GameContext } from "../party/games/types";
import { createWoordleGame, type WoordleAction, type WoordleState } from "../party/games/woordle/game";
import type { MatchSnapshot, RoomServerMessage } from "../shared/protocol";
import { createFakeClock } from "./helpers/fake-clock";
import { MATCH_ANSWERS } from "./helpers/game";

const LIMIT = 180_000;
const REVEAL = 5_000;

function harness() {
  const game = createWoordleGame({ pickAnswers: () => [...MATCH_ANSWERS] });
  const clock = createFakeClock();
  const log: { to: string; message: RoomServerMessage }[] = [];
  let state!: WoordleState;
  const ctx: GameContext<WoordleAction> = {
    now: () => clock.now(),
    schedule: (ms, action) => clock.setTimer(ms, () => void (state = game.onAction(state, SYSTEM, action, ctx))),
    sendTo: (to, message) => void log.push({ to, message }),
    broadcast: (message) => void log.push({ to: "*", message }),
    broadcastExcept: (_id, message) => void log.push({ to: "*", message }),
  };
  state = game.createState(
    ["a", "b"].map((id) => ({ id, name: id.toUpperCase(), isHost: false, connected: true })),
    { roundSeconds: 180 },
    ctx,
  );
  const snapshot = (id: string): MatchSnapshot | undefined => {
    const before = log.length;
    state = game.onPlayerReturn(state, id, ctx);
    return log.slice(before).find((e) => e.to === id && e.message.type === "matchSnapshot")?.message as MatchSnapshot | undefined;
  };
  return {
    game,
    clock,
    snapshot,
    guess: (id: string, word: string) => void (state = game.onAction(state, id, { type: "guess", word }, ctx)),
    leave: (id: string) => void (state = game.onPlayerLeave(state, id, ctx)),
    get log() {
      return log;
    },
  };
}

describe("match snapshot", () => {
  test("while a round runs: own letters, opponents' colours only, times and roster, no answer", () => {
    const h = harness();
    h.guess("a", "slate");
    h.guess("b", "robot");
    h.clock.advance(4000);
    const snap = h.snapshot("b")!;
    expect(snap).toMatchObject({ stage: "playing", round: 1, totalRounds: 5, serverNow: h.clock.now(), roundEnd: null, ranking: null });
    expect(snap.endsAt - snap.startedAt).toBe(LIMIT);
    expect(snap.players).toEqual([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
    expect(snap.own.rows.map((r) => r.word)).toEqual(["robot"]);
    expect(snap.opponents).toEqual([{ id: "a", rows: [expect.any(Array)], solvedMs: null }]);
    const text = JSON.stringify(snap);
    expect(text).not.toContain("slate"); // the opponent's letters
    expect(text).not.toContain("crane"); // the answer
  });

  test("during the reveal: the answer, results and next-round time", () => {
    const h = harness();
    h.guess("a", "crane");
    h.clock.advance(LIMIT);
    const snap = h.snapshot("b")!;
    expect(snap.stage).toBe("reveal");
    expect(snap.roundEnd).toMatchObject({ answer: "crane", winnerId: "a" });
    expect(snap.roundEnd!.nextAt).toBeGreaterThan(snap.serverNow);
    expect(snap.roundEnd!.results.map((r) => r.id)).toEqual(["a", "b"]);
  });

  test("after the match: the final ranking", () => {
    const h = harness();
    for (let r = 0; r < 5; r++) h.clock.advance(LIMIT + REVEAL);
    const snap = h.snapshot("a")!;
    expect(snap.stage).toBe("finished");
    expect(snap.ranking).toHaveLength(2);
  });

  test("goes only to the returning player", () => {
    const h = harness();
    h.snapshot("a");
    expect(h.log.filter((e) => e.message.type === "matchSnapshot").map((e) => e.to)).toEqual(["a"]);
  });

  test("nobody outside the match gets one", () => {
    expect(harness().snapshot("stranger")).toBeUndefined();
  });

  test("no snapshot ever shows a round's answer before that round's reveal, across a whole match", () => {
    const h = harness();
    for (let r = 0; r < 5; r++) {
      h.guess("a", "slate");
      for (const id of ["a", "b"]) {
        const text = JSON.stringify(h.snapshot(id));
        for (const answer of MATCH_ANSWERS.slice(r)) {
          if (answer !== "slate") expect(text).not.toContain(answer);
        }
      }
      h.clock.advance(LIMIT + REVEAL);
    }
  });
});

describe("rate-limit reply", () => {
  test("a guess gets a rate-limited rejection; internal actions get nothing", () => {
    const game = createWoordleGame();
    expect(game.rateLimitedReply({ type: "guess", word: "crane" })).toEqual({ type: "guessRejected", reason: "rate-limited" });
    expect(game.rateLimitedReply({ type: "finish" })).toBeNull();
  });
});
