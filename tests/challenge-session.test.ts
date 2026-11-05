import { describe, expect, test } from "vitest";
import type { ChallengeServerMessage } from "../shared/protocol";
import { createChallengeSession, parseChallengeFrame } from "../party/challenge/session";
import { createFakeClock } from "./helpers/fake-clock";
import { WORDS, payload } from "./helpers/challenge";

const LIMIT = 180_000;
const REVEAL = 5000;
const WRONG = "about"; // a valid guess that is never one of WORDS

function setup(opts: { timeScale?: number; isWord?: (w: string) => boolean } = {}) {
  const clock = createFakeClock();
  const sent: ChallengeServerMessage[] = [];
  const session = createChallengeSession({ clock, send: (m) => sent.push(m), revealMs: REVEAL, ...opts });
  const of = <T extends ChallengeServerMessage["type"]>(type: T) =>
    sent.filter((m): m is Extract<ChallengeServerMessage, { type: T }> => m.type === type);
  return { clock, sent, session, of };
}

describe("challenge session", () => {
  test("start announces the run and begins round 1 on the clock", () => {
    const { session, sent, clock } = setup();
    const t0 = clock.now();
    session.start(payload());
    expect(sent).toEqual([
      { type: "challengeStart", totalRounds: 5, limitSec: 180 },
      { type: "roundStart", round: 1, totalRounds: 5, startedAt: t0, endsAt: t0 + LIMIT },
    ]);
  });

  test("a solve ends the round at once with a server-stamped time and cancels the timer", () => {
    const { session, clock, of } = setup();
    session.start(payload());
    clock.advance(7000);
    session.guess("crane");
    expect(of("guessResult")[0]).toMatchObject({ word: "crane", solvedMs: 7000 });
    expect(of("roundEnd")[0]).toMatchObject({ round: 1, answer: "crane", solvedMs: 7000, guesses: 1 });
    // Only the reveal timer is left, not the round timer.
    expect(clock.pending()).toBe(1);
  });

  test("a wrong guess keeps the round open and reports no solve time", () => {
    const { session, of } = setup();
    session.start(payload());
    session.guess(WRONG);
    expect(of("guessResult")[0].solvedMs).toBeNull();
    expect(of("roundEnd")).toHaveLength(0);
  });

  test("six wrong guesses end the round unsolved", () => {
    const { session, of, clock } = setup();
    session.start(payload());
    for (let i = 0; i < 6; i++) {
      session.guess(WRONG);
      clock.advance(500); // stay under 2 guesses per second
    }
    expect(of("roundEnd")[0]).toMatchObject({ answer: "crane", solvedMs: null, guesses: 6 });
  });

  test("the time limit ends the round with no solve", () => {
    const { session, clock, of } = setup();
    session.start(payload());
    clock.advance(LIMIT);
    expect(of("roundEnd")[0]).toMatchObject({ round: 1, answer: "crane", solvedMs: null, guesses: 0 });
  });

  test("the last millisecond before endsAt still counts, then the round is over", () => {
    const { session, clock, of, sent } = setup();
    session.start(payload());
    clock.advance(LIMIT - 1);
    session.guess(WRONG);
    expect(of("guessResult")).toHaveLength(1);
    clock.advance(1); // the timer fires and the round ends
    session.guess(WRONG);
    expect(sent.at(-1)).toEqual({ type: "guessRejected", reason: "round-over" });
  });

  test("a guess exactly at endsAt is rejected as late", () => {
    const sent: ChallengeServerMessage[] = [];
    const of = <T extends ChallengeServerMessage["type"]>(type: T) => sent.filter((m) => m.type === type);
    // A clock whose timers never fire models the gap between endsAt and the timer callback.
    let now = 1_000_000;
    const lateClock = { now: () => now, setTimer: () => () => {} };
    const s = createChallengeSession({ clock: lateClock, send: (m) => sent.push(m), revealMs: REVEAL });
    s.start(payload());
    now += LIMIT;
    s.guess(WRONG);
    expect(sent.at(-1)).toEqual({ type: "guessRejected", reason: "round-over" });
    expect(of("guessResult")).toHaveLength(0);
  });

  test("guesses during the reveal pause are round-over", () => {
    const { session, clock, sent } = setup();
    session.start(payload());
    session.guess("crane");
    clock.advance(1000);
    session.guess(WRONG);
    expect(sent.at(-1)).toEqual({ type: "guessRejected", reason: "round-over" });
  });

  test("a non-word is rejected and consumes no guess", () => {
    const { session, of, sent, clock } = setup();
    session.start(payload());
    session.guess("zzzzz");
    expect(sent.at(-1)).toEqual({ type: "guessRejected", reason: "not-a-word" });
    for (let i = 0; i < 5; i++) {
      clock.advance(500); // stay under 2 guesses per second
      session.guess(WRONG);
    }
    expect(of("guessResult")).toHaveLength(5);
    expect(of("roundEnd")).toHaveLength(0); // still 5 of 6 used
  });

  test("a guess before start is dropped silently", () => {
    const { session, sent } = setup();
    session.guess("crane");
    expect(sent).toEqual([]);
  });

  test("nextAt tells the client when the next round begins, and it does", () => {
    const { session, clock, of } = setup();
    session.start(payload());
    clock.advance(2000);
    session.guess("crane");
    const end = of("roundEnd")[0];
    expect(end.nextAt).toBe(clock.now() + REVEAL);
    clock.advance(REVEAL);
    expect(of("roundStart")[1]).toMatchObject({ round: 2, startedAt: end.nextAt });
  });

  test("a full run plays the five words in order and sums the summary", () => {
    const { session, clock, of } = setup();
    session.start(payload());
    // Solve rounds 1, 2 and 4; let 3 and 5 time out.
    const plan: (number | null)[] = [1000, 2000, null, 4000, null];
    plan.forEach((ms, i) => {
      if (ms === null) clock.advance(LIMIT);
      else {
        clock.advance(ms);
        session.guess(WORDS[i]);
      }
      clock.advance(REVEAL);
    });
    expect(of("roundEnd").map((r) => r.answer)).toEqual(WORDS);
    const end = of("challengeEnd")[0];
    expect(end.solved).toBe(3);
    expect(end.totalMs).toBe(1000 + 2000 + LIMIT + 4000 + LIMIT);
    expect(end.rounds.map((r) => r.solvedMs)).toEqual(plan);
    expect(clock.pending()).toBe(0);
  });

  test("nothing solved counts every round at the full limit", () => {
    const { session, clock, of } = setup();
    session.start(payload());
    for (let i = 0; i < 5; i++) clock.advance(LIMIT + REVEAL);
    expect(of("challengeEnd")[0]).toMatchObject({ solved: 0, totalMs: 5 * LIMIT });
  });

  test("start while a run is in progress is ignored", () => {
    const { session, of } = setup();
    session.start(payload());
    session.start(payload({ words: ["stone", "plane", "glove", "brick", "shark"] }));
    expect(of("challengeStart")).toHaveLength(1);
    expect(of("roundStart")).toHaveLength(1);
  });

  test("after the summary start replays from round 1 with clean state", () => {
    const { session, clock, of } = setup();
    session.start(payload());
    for (let i = 0; i < 5; i++) clock.advance(LIMIT + REVEAL);
    expect(of("challengeEnd")).toHaveLength(1);
    session.start(payload());
    expect(of("roundStart").at(-1)).toMatchObject({ round: 1 });
    session.guess("crane");
    expect(of("guessResult").at(-1)?.colours).toEqual(["green", "green", "green", "green", "green"]);
    clock.advance(REVEAL + LIMIT);
    for (let i = 0; i < 4; i++) clock.advance(LIMIT + REVEAL);
    expect(of("challengeEnd").at(-1)?.rounds).toHaveLength(5);
  });

  test("a word that left the guess list makes the link expire", () => {
    const { session, sent } = setup({ isWord: (w) => w !== "robot" });
    session.start(payload());
    expect(sent).toEqual([{ type: "error", code: "invalid-token" }]);
  });

  test("close cancels every timer", () => {
    const { session, clock } = setup();
    session.start(payload());
    session.close();
    expect(clock.pending()).toBe(0);
    session.close(); // idempotent
  });

  test("a stale round timer cannot end a later round", () => {
    const { session, clock, of } = setup();
    session.start(payload());
    session.guess("crane"); // round 1 ends early; its 180 s timer is cancelled
    clock.advance(REVEAL);
    clock.advance(LIMIT - 1); // would be round 1's old deadline
    expect(of("roundEnd")).toHaveLength(1);
  });

  test("a timer that could not be cancelled cannot end a later round (the round number guard)", () => {
    // Models a runtime where clearTimeout loses the race with a timer already queued to fire.
    let now = 1_000_000;
    const timers: { at: number; fn: () => void }[] = [];
    const clock = { now: () => now, setTimer: (ms: number, fn: () => void) => (timers.push({ at: now + ms, fn }), () => {}) };
    const sent: ChallengeServerMessage[] = [];
    const session = createChallengeSession({ clock, send: (m) => sent.push(m), revealMs: REVEAL });
    session.start(payload());
    session.guess("crane"); // round 1 ends early
    const staleRound1 = timers[0];
    now += REVEAL;
    timers[1].fn(); // the reveal timer: round 2 starts
    expect(sent.filter((m) => m.type === "roundStart")).toHaveLength(2);
    staleRound1.fn(); // round 1's old deadline fires during round 2
    expect(sent.filter((m) => m.type === "roundEnd")).toHaveLength(1);
  });

  test("timeScale shrinks the round limit but not the reveal pause", () => {
    const { session, clock, of } = setup({ timeScale: 0.01 });
    session.start(payload());
    expect(of("roundStart")[0].endsAt - of("roundStart")[0].startedAt).toBe(1800);
    clock.advance(1800);
    expect(of("roundEnd")[0].nextAt - clock.now()).toBe(REVEAL);
    expect(of("challengeStart")[0].limitSec).toBe(180);
  });

  test("production defaults: a 5000 ms pause and a real-length round", () => {
    const clock = createFakeClock();
    const sent: ChallengeServerMessage[] = [];
    const session = createChallengeSession({ clock, send: (m) => sent.push(m) });
    session.start(payload({ limitSec: 60 }));
    expect((sent[1] as { endsAt: number; startedAt: number }).endsAt - (sent[1] as { startedAt: number }).startedAt).toBe(60_000);
    clock.advance(60_000);
    const end = sent.find((m) => m.type === "roundEnd") as { nextAt: number };
    expect(end.nextAt - clock.now()).toBe(5000);
  });
});

describe("challenge rate limit", () => {
  test("a third guess inside one second is rate-limited and consumes nothing", () => {
    const { session, sent, of } = setup();
    session.start(payload());
    session.guess(WRONG);
    session.guess(WRONG);
    session.guess(WRONG);
    expect(sent.at(-1)).toEqual({ type: "guessRejected", reason: "rate-limited" });
    expect(of("guessResult")).toHaveLength(2);
  });
});

describe("fairness", () => {
  test("no word reaches the client before the roundEnd that reveals it", () => {
    const { session, clock, sent } = setup();
    session.start(payload());
    // Solve round 1 only after wrong guesses; let the rest time out.
    session.guess(WRONG);
    session.guess("crane");
    for (let i = 0; i < 5; i++) {
      clock.advance(REVEAL);
      clock.advance(LIMIT);
    }
    sent.forEach((message, index) => {
      if (message.type === "roundEnd" || message.type === "challengeEnd") return;
      const text = JSON.stringify(message);
      // Words of rounds not yet revealed must not appear. Guessed words are the player's own.
      const revealedBefore = sent.slice(0, index).filter((m) => m.type === "roundEnd").length;
      WORDS.slice(revealedBefore).forEach((word) => {
        if (message.type === "guessResult" && message.word === word) return; // the player typed it
        expect(text).not.toContain(word);
      });
    });
  });

  test("challengeStart and roundStart never carry words", () => {
    const { session, of } = setup();
    session.start(payload());
    for (const m of [...of("challengeStart"), ...of("roundStart")]) {
      for (const w of WORDS) expect(JSON.stringify(m)).not.toContain(w);
    }
  });
});

describe("parseChallengeFrame", () => {
  test("accepts begin and guess", () => {
    expect(parseChallengeFrame('{"type":"begin","token":"abc"}')).toEqual({ type: "begin", token: "abc" });
    expect(parseChallengeFrame('{"type":"guess","word":"crane"}')).toEqual({ type: "guess", word: "crane" });
  });

  test("a begin whose token is at the cap fits in a frame, and one over the cap still reaches the opener", () => {
    for (const length of [512, 513, 540]) {
      const raw = JSON.stringify({ type: "begin", token: "A".repeat(length) });
      expect(parseChallengeFrame(raw)).toEqual({ type: "begin", token: "A".repeat(length) });
    }
  });

  test("a frame over the cap is dropped, whatever it says", () => {
    const frame = (length: number) => JSON.stringify({ type: "begin", token: "A".repeat(length) });
    expect(frame(576 - 27).length).toBe(576);
    expect(parseChallengeFrame(frame(576 - 27))).not.toBeNull();
    expect(parseChallengeFrame(frame(576 - 26))).toBeNull();
  });

  test.each([
    "not json",
    "null",
    "[]",
    '"x"',
    "{}",
    '{"type":"begin"}',
    '{"type":"begin","token":5}',
    '{"type":"guess","word":5}',
    '{"type":"nope"}',
    JSON.stringify({ type: "begin", token: "a".repeat(600) }),
    JSON.stringify({ type: "guess", word: "a".repeat(17) }),
    JSON.stringify({ type: "guess", word: "x", pad: "p".repeat(600) }),
  ])("drops %s", (raw) => {
    expect(parseChallengeFrame(raw)).toBeNull();
  });
});
