import { describe, expect, test } from "vitest";
import { SYSTEM, type GameContext } from "../party/games/types";
import { createWoordleGame, type WoordleAction, type WoordleOptions, type WoordleState } from "../party/games/woordle/game";
import { answers } from "../party/games/woordle/words";
import type { RoomServerMessage, RoundSeconds } from "../shared/protocol";
import { createFakeClock } from "./helpers/fake-clock";
import { MATCH_ANSWERS } from "./helpers/game";

const LIMIT = 180_000;
const REVEAL = 5_000;
// Valid words that are not the answer of round 1 ("crane").
const WRONG = ["slate", "robot", "moist", "light", "about", "above"];

interface Sent {
  to: string;
  except?: string;
  message: RoomServerMessage;
}

function harness(opts: { options?: WoordleOptions; ids?: string[]; seconds?: RoundSeconds } = {}) {
  const game = createWoordleGame({ pickAnswers: () => [...MATCH_ANSWERS], ...opts.options });
  const clock = createFakeClock();
  const log: Sent[] = [];
  let lag = 0;
  let state!: WoordleState;
  const ctx: GameContext<WoordleAction> = {
    // `lag` simulates a timer that has not fired yet although the clock has passed endsAt.
    now: () => clock.now() + lag,
    schedule: (ms, action) =>
      clock.setTimer(ms, () => {
        state = game.onAction(state, SYSTEM, action, ctx);
      }),
    sendTo: (id, message) => void log.push({ to: id, message }),
    broadcast: (message) => void log.push({ to: "*", message }),
    broadcastExcept: (id, message) => void log.push({ to: "*", except: id, message }),
  };
  const ids = opts.ids ?? ["a", "b"];
  state = game.createState(
    ids.map((id) => ({ id, name: id.toUpperCase(), isHost: false, connected: true })),
    { roundSeconds: opts.seconds ?? 180 },
    ctx,
  );
  const sees = (id: string) => log.filter((e) => e.to === id || (e.to === "*" && e.except !== id)).map((e) => e.message);
  return {
    game,
    clock,
    log,
    get state() {
      return state;
    },
    guess: (id: string, word: string) => void (state = game.onAction(state, id, { type: "guess", word }, ctx)),
    system: (action: WoordleAction) => void (state = game.onAction(state, SYSTEM, action, ctx)),
    leave: (id: string) => void (state = game.onPlayerLeave(state, id, ctx)),
    setLag: (value: number) => void (lag = value),
    sees,
    ofType: <T extends RoomServerMessage["type"]>(id: string, type: T) =>
      sees(id).filter((m): m is Extract<RoomServerMessage, { type: T }> => m.type === type),
  };
}

describe("match start", () => {
  test("round 1 starts immediately with server-stamped times and the roster", () => {
    const h = harness();
    const [start] = h.ofType("a", "roundStart");
    expect(start).toMatchObject({ round: 1, totalRounds: 5, startedAt: h.clock.now(), endsAt: h.clock.now() + LIMIT });
    expect(start.players).toEqual([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
  });

  test("the round start message never contains the answer", () => {
    expect(JSON.stringify(harness().log)).not.toContain("crane");
  });

  test("picks five different answers by default", () => {
    for (let run = 0; run < 30; run++) {
      const game = createWoordleGame();
      const ctx: GameContext<WoordleAction> = {
        now: () => 0,
        schedule: () => () => {},
        sendTo: () => {},
        broadcast: () => {},
        broadcastExcept: () => {},
      };
      const state = game.createState([{ id: "a", name: "A", isHost: true, connected: true }], { roundSeconds: 180 }, ctx);
      expect(new Set(state.answers).size).toBe(5);
      for (const word of state.answers) expect(answers).toContain(word);
    }
  });

  test("timeScale shrinks the round limit but not the pause between rounds", () => {
    const h = harness({ options: { timeScale: 0.01, revealMs: 300 } });
    const [start] = h.ofType("a", "roundStart");
    expect(start.endsAt - start.startedAt).toBe(1800);
    h.clock.advance(1800);
    const [end] = h.ofType("a", "roundEnd");
    expect(end.nextAt - h.clock.now()).toBe(300);
    h.clock.advance(299);
    expect(h.ofType("a", "roundStart")).toHaveLength(1);
    h.clock.advance(1);
    expect(h.ofType("a", "roundStart")).toHaveLength(2);
  });

  test("the defaults are the real durations: the limit as chosen and a 5 s pause", () => {
    const h = harness();
    const [start] = h.ofType("a", "roundStart");
    expect(start.endsAt - start.startedAt).toBe(180_000);
    h.clock.advance(180_000);
    expect(h.ofType("a", "roundEnd")[0].nextAt - h.clock.now()).toBe(5000);
  });

  test("validateSettings accepts 120, 180 and 300 only", () => {
    const { game } = harness();
    for (const roundSeconds of [120, 180, 300]) expect(game.validateSettings({ roundSeconds })).toEqual({ roundSeconds });
    for (const bad of [0, 60, 181, "180", null, undefined]) expect(() => game.validateSettings({ roundSeconds: bad })).toThrow();
    expect(() => game.validateSettings(null)).toThrow();
  });
});

describe("parseAction", () => {
  const { game } = harness();

  test("accepts a guess", () => {
    expect(game.parseAction({ type: "guess", word: "crane" })).toEqual({ type: "guess", word: "crane" });
  });

  test.each([
    ["an internal endRound", { type: "endRound", round: 1 }],
    ["an internal nextRound", { type: "nextRound", round: 1 }],
    ["an internal finish", { type: "finish" }],
    ["a non-string word", { type: "guess", word: 5 }],
    ["a missing word", { type: "guess" }],
    ["an oversize word", { type: "guess", word: "a".repeat(17) }],
    ["null", null],
    ["a string", "guess"],
    ["an unknown type", { type: "cheat" }],
  ])("drops %s", (_name, input) => {
    expect(game.parseAction(input)).toBeNull();
  });
});

describe("guessing", () => {
  test("the sender gets guessResult, the others get colours only, and the sender gets no opponentProgress", () => {
    const h = harness();
    h.guess("a", "slate");
    const [mine] = h.ofType("a", "guessResult");
    expect(mine).toMatchObject({ word: "slate", solvedMs: null });
    expect(mine.colours).toHaveLength(5);
    expect(h.ofType("a", "opponentProgress")).toHaveLength(0);
    const [seen] = h.ofType("b", "opponentProgress");
    expect(seen).toMatchObject({ id: "a", solvedMs: null });
    expect(seen.rows).toEqual([mine.colours]);
    expect(JSON.stringify(seen)).not.toContain("slate");
    expect(h.ofType("b", "guessResult")).toHaveLength(0);
  });

  test("opponentProgress carries every row so far", () => {
    const h = harness();
    h.guess("a", "slate");
    h.guess("a", "robot");
    const progress = h.ofType("b", "opponentProgress");
    expect(progress.at(-1)?.rows).toHaveLength(2);
  });

  test("a word outside the list is rejected and consumes no guess", () => {
    const h = harness();
    h.guess("a", "zzzzz");
    expect(h.ofType("a", "guessRejected")).toEqual([{ type: "guessRejected", reason: "not-a-word" }]);
    expect(h.ofType("b", "opponentProgress")).toHaveLength(0);
    for (const word of WRONG) h.guess("a", word);
    expect(h.ofType("a", "guessResult")).toHaveLength(6);
  });

  test("input is trimmed and lowercased", () => {
    const h = harness();
    h.guess("a", "  CRANE ");
    expect(h.ofType("a", "guessResult")[0]).toMatchObject({ word: "crane" });
  });

  test("a seventh guess gets no-guesses-left", () => {
    const h = harness();
    for (const word of WRONG) h.guess("a", word);
    h.guess("a", "again");
    expect(h.ofType("a", "guessRejected").at(-1)).toEqual({ type: "guessRejected", reason: "no-guesses-left" });
  });

  test("a guess after solving is round-over", () => {
    const h = harness();
    h.guess("a", "crane");
    h.guess("a", "slate");
    expect(h.ofType("a", "guessRejected").at(-1)).toEqual({ type: "guessRejected", reason: "round-over" });
  });

  test("a guess from someone who is not in the match is ignored", () => {
    const h = harness();
    h.guess("stranger", "crane");
    expect(h.log.filter((e) => e.to === "stranger")).toEqual([]);
  });

  test("the SYSTEM sender cannot guess", () => {
    const h = harness();
    const before = h.log.length;
    h.system({ type: "guess", word: "crane" });
    expect(h.log.length).toBe(before);
  });
});

describe("winning a round", () => {
  test("the solve time is the server time since the round started", () => {
    const h = harness();
    h.clock.advance(4200);
    h.guess("a", "crane");
    expect(h.ofType("a", "guessResult")[0].solvedMs).toBe(4200);
    expect(h.ofType("b", "opponentProgress")[0].solvedMs).toBe(4200);
  });

  test("the first solver wins and a later solver does not", () => {
    const h = harness();
    h.guess("a", "crane");
    h.clock.advance(1000);
    h.guess("b", "crane");
    const [end] = h.ofType("a", "roundEnd");
    expect(end.winnerId).toBe("a");
    expect(end.results).toEqual([
      { id: "a", solvedMs: 0, guesses: 1 },
      { id: "b", solvedMs: 1000, guesses: 1 },
    ]);
  });

  test("two solves in the same millisecond go to whichever message came first", () => {
    const first = harness();
    first.guess("b", "crane");
    first.guess("a", "crane");
    expect(first.ofType("a", "roundEnd")[0].winnerId).toBe("b");
    const second = harness();
    second.guess("a", "crane");
    second.guess("b", "crane");
    expect(second.ofType("a", "roundEnd")[0].winnerId).toBe("a");
  });

  test("solvedMs is only set on the solving guess", () => {
    const h = harness();
    h.guess("a", "slate");
    h.guess("a", "crane");
    expect(h.ofType("a", "guessResult").map((m) => m.solvedMs)).toEqual([null, 0]);
  });
});

describe("ending a round", () => {
  test("it ends at once when every player has solved, and cancels the round timer", () => {
    const h = harness();
    h.guess("a", "crane");
    expect(h.ofType("a", "roundEnd")).toHaveLength(0); // b is still playing
    h.clock.advance(2000);
    h.guess("b", "crane");
    const [end] = h.ofType("b", "roundEnd");
    expect(end.round).toBe(1);
    expect(end.nextAt).toBe(h.clock.now() + REVEAL);
    expect(h.clock.pending()).toBe(1); // only the pause before round 2
    h.clock.advance(LIMIT); // the cancelled endRound must not fire again
    expect(h.ofType("a", "roundEnd").filter((m) => m.round === 1)).toHaveLength(1);
  });

  test("a player who used all six guesses counts as done", () => {
    const h = harness();
    h.guess("a", "crane");
    for (const word of WRONG) h.guess("b", word);
    expect(h.ofType("a", "roundEnd")).toHaveLength(1);
    expect(h.ofType("a", "roundEnd")[0].winnerId).toBe("a");
  });

  test("it does not end while any connected player is still playing", () => {
    const h = harness();
    h.guess("a", "crane");
    h.guess("b", "slate");
    expect(h.ofType("a", "roundEnd")).toHaveLength(0);
  });

  test("it ends at the time limit when nobody solved, with no winner", () => {
    const h = harness();
    h.clock.advance(LIMIT - 1);
    expect(h.ofType("a", "roundEnd")).toHaveLength(0);
    h.clock.advance(1);
    const [end] = h.ofType("a", "roundEnd");
    expect(end.winnerId).toBeNull();
    expect(end.results.every((r) => r.solvedMs === null)).toBe(true);
    expect(end.answer).toBe("crane");
  });

  test("a guess at endsAt is round-over even if the timer has not fired yet", () => {
    const h = harness();
    h.clock.advance(LIMIT - 1);
    h.setLag(1); // now == endsAt, timer still pending
    h.guess("a", "crane");
    expect(h.ofType("a", "guessRejected")).toEqual([{ type: "guessRejected", reason: "round-over" }]);
    expect(h.ofType("a", "guessResult")).toHaveLength(0);
  });

  test("a guess just before endsAt is accepted", () => {
    const h = harness();
    h.clock.advance(LIMIT - 1);
    h.guess("a", "crane");
    expect(h.ofType("a", "guessResult")[0].solvedMs).toBe(LIMIT - 1);
  });

  test("guesses during the reveal are round-over", () => {
    const h = harness();
    h.clock.advance(LIMIT);
    h.guess("a", "crane");
    expect(h.ofType("a", "guessRejected").at(-1)).toEqual({ type: "guessRejected", reason: "round-over" });
  });

  test("the answer is sent only in roundEnd", () => {
    const h = harness();
    h.guess("a", "slate");
    h.clock.advance(LIMIT - 1);
    expect(JSON.stringify(h.log)).not.toContain("crane");
    h.clock.advance(1);
    expect(JSON.stringify(h.ofType("a", "roundEnd"))).toContain("crane");
  });
});

describe("rounds and the match", () => {
  test("round 2 starts after the reveal with a new answer and fresh boards", () => {
    const h = harness();
    h.guess("a", "slate");
    h.clock.advance(LIMIT + REVEAL);
    const starts = h.ofType("a", "roundStart");
    expect(starts.map((s) => s.round)).toEqual([1, 2]);
    expect(starts[1].startedAt).toBe(h.clock.now());
    h.guess("a", "slate"); // the answer of round 2: solves
    expect(h.ofType("a", "guessResult").at(-1)?.solvedMs).toBe(0);
  });

  test("a stale endRound from an earlier round is ignored", () => {
    const h = harness();
    h.clock.advance(LIMIT + REVEAL);
    h.system({ type: "endRound", round: 1 });
    expect(h.ofType("a", "roundEnd")).toHaveLength(1);
  });

  test("a nextRound while a round is running is ignored", () => {
    const h = harness();
    h.system({ type: "nextRound", round: 1 });
    expect(h.ofType("a", "roundStart")).toHaveLength(1);
  });

  test("after round 5 and the reveal, matchEnd carries the ranking", () => {
    const h = harness();
    h.guess("a", "crane"); // a wins round 1
    for (let round = 0; round < 5; round++) h.clock.advance(LIMIT + REVEAL);
    const [end] = h.ofType("b", "matchEnd");
    expect(end.ranking.map((r) => [r.id, r.roundsWon, r.rank])).toEqual([["a", 1, 1], ["b", 0, 2]]);
    expect(h.game.isFinished(h.state)).toBe(true);
    expect(h.ofType("a", "roundStart")).toHaveLength(5);
    expect(h.clock.pending()).toBe(0);
  });

  test("matchEnd waits for the reveal after round 5", () => {
    const h = harness();
    for (let round = 0; round < 4; round++) h.clock.advance(LIMIT + REVEAL);
    h.clock.advance(LIMIT);
    expect(h.ofType("a", "roundEnd")).toHaveLength(5);
    expect(h.ofType("a", "matchEnd")).toHaveLength(0);
    h.clock.advance(REVEAL);
    expect(h.ofType("a", "matchEnd")).toHaveLength(1);
  });

  test("an unsolved round counts as the full limit, a solved one as the solve time", () => {
    const h = harness();
    h.clock.advance(3000);
    h.guess("a", "crane"); // 3 s
    for (let round = 0; round < 5; round++) h.clock.advance(LIMIT + REVEAL);
    const ranking = h.ofType("a", "matchEnd")[0].ranking;
    expect(ranking.find((r) => r.id === "a")?.totalMs).toBe(3000 + 4 * LIMIT);
    expect(ranking.find((r) => r.id === "b")?.totalMs).toBe(5 * LIMIT);
  });

  test("all-idle players tie exactly and share first place", () => {
    const h = harness();
    for (let round = 0; round < 5; round++) h.clock.advance(LIMIT + REVEAL);
    expect(h.ofType("a", "matchEnd")[0].ranking.map((r) => r.rank)).toEqual([1, 1]);
  });

  test("equal rounds are broken by cumulative time", () => {
    const h = harness();
    h.guess("a", "crane"); // round 1: a wins at 0 ms
    h.clock.advance(LIMIT + REVEAL);
    h.clock.advance(5000);
    h.guess("b", "slate"); // round 2: b wins at 5 s
    for (let round = 0; round < 4; round++) h.clock.advance(LIMIT + REVEAL);
    const ranking = h.ofType("a", "matchEnd")[0].ranking;
    expect(ranking.map((r) => [r.id, r.roundsWon, r.rank])).toEqual([["a", 1, 1], ["b", 1, 2]]);
  });

  test("a one-player match works", () => {
    const h = harness({ ids: ["solo"] });
    h.guess("solo", "crane");
    expect(h.ofType("solo", "roundEnd")).toHaveLength(1);
    for (let round = 0; round < 5; round++) h.clock.advance(LIMIT + REVEAL);
    expect(h.ofType("solo", "matchEnd")[0].ranking[0]).toMatchObject({ id: "solo", roundsWon: 1, rank: 1 });
  });

  test("messages after the match ends do nothing", () => {
    const h = harness();
    for (let round = 0; round < 5; round++) h.clock.advance(LIMIT + REVEAL);
    const before = h.log.length;
    h.guess("a", "crane");
    h.system({ type: "finish" });
    expect(h.ofType("a", "matchEnd")).toHaveLength(1);
    expect(h.log.length).toBe(before + 1); // only the round-over rejection
  });
});

describe("players leaving", () => {
  test("a leaver keeps their record and still ranks, with later rounds at the full limit", () => {
    const h = harness({ ids: ["a", "b", "c"] });
    h.guess("c", "crane");
    h.leave("c");
    h.guess("a", "crane");
    h.guess("b", "crane");
    for (let round = 0; round < 5; round++) h.clock.advance(LIMIT + REVEAL);
    const ranking = h.ofType("a", "matchEnd")[0].ranking;
    expect(ranking.map((r) => r.id)).toContain("c");
    expect(ranking.find((r) => r.id === "c")).toMatchObject({ name: "C", roundsWon: 1 });
    expect(ranking.find((r) => r.id === "c")!.totalMs).toBe(4 * LIMIT);
  });

  test("the round ends early when the last unfinished player leaves", () => {
    const h = harness();
    h.guess("a", "crane");
    expect(h.ofType("a", "roundEnd")).toHaveLength(0);
    h.leave("b");
    expect(h.ofType("a", "roundEnd")).toHaveLength(1);
  });

  test("the round keeps going while someone still playing remains", () => {
    const h = harness({ ids: ["a", "b", "c"] });
    h.guess("a", "crane");
    h.leave("b");
    expect(h.ofType("a", "roundEnd")).toHaveLength(0);
  });

  test("a leaver is counted as unsolved in the round they left", () => {
    const h = harness();
    h.leave("b");
    h.guess("a", "crane");
    const [end] = h.ofType("a", "roundEnd");
    expect(end.results.find((r) => r.id === "b")?.solvedMs).toBeNull();
  });

  test("when everyone has left the round does not end by itself", () => {
    const h = harness();
    h.leave("a");
    h.leave("b");
    expect(h.ofType("a", "roundEnd")).toHaveLength(0);
  });

  test("the roster still lists a player who left before the next round", () => {
    const h = harness();
    h.leave("b");
    h.clock.advance(LIMIT + REVEAL);
    expect(h.ofType("a", "roundStart")[1].players.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("fairness", () => {
  test("nothing b learns from others before a round ends contains that round's answer, across a whole match", () => {
    const h = harness();
    // b only ever guesses wrong; a solves each round. b must learn each answer only from roundEnd.
    for (let round = 0; round < 5; round++) {
      const answer = MATCH_ANSWERS[round];
      const mark = h.sees("b").length;
      h.guess("b", WRONG.find((w) => w !== answer)!);
      h.guess("a", answer);
      // b's own guessResult echoes b's own word, so it is not a vector; everything else is.
      const received = h
        .sees("b")
        .slice(mark)
        .filter((m) => m.type !== "guessResult" && m.type !== "roundEnd" && m.type !== "matchEnd");
      expect(JSON.stringify(received).includes(`"${answer}"`), `round ${round + 1} answer leaked`).toBe(false);
      expect(received.some((m) => m.type === "opponentProgress")).toBe(true); // the scan saw real traffic
      h.clock.advance(LIMIT + REVEAL);
    }
  });

  test("viewFor shows own letters, opponents' colours only, and hides the answer while a round runs", () => {
    const h = harness();
    h.guess("a", "slate");
    h.guess("b", "robot");
    const view = h.game.viewFor(h.state, "b") as {
      own: { rows: { word: string }[] };
      opponents: { id: string; rows: unknown[] }[];
      answer: string | null;
    };
    expect(view.own.rows[0].word).toBe("robot");
    expect(view.opponents).toHaveLength(1);
    expect(JSON.stringify(view.opponents)).not.toContain("slate");
    expect(JSON.stringify(view.opponents)).not.toContain("word");
    expect(view.answer).toBeNull();
  });

  test("viewFor reveals the answer once the round is over, and not before for any player", () => {
    const h = harness();
    expect((h.game.viewFor(h.state, "a") as { answer: string | null }).answer).toBeNull();
    h.clock.advance(LIMIT);
    expect((h.game.viewFor(h.state, "a") as { answer: string | null }).answer).toBe("crane");
  });

  test("viewFor is empty for someone who is not in the match", () => {
    const view = harness().game.viewFor(harness().state, "stranger") as { own: unknown };
    expect(view.own).toBeNull();
  });
});
