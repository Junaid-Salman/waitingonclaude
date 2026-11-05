import { beforeEach, describe, expect, test } from "vitest";
import { isDone, useMatch, type MatchMessage } from "../src/lib/room/match-store";

const roundStart = (round = 1, startedAt = 10_000): MatchMessage => ({
  type: "roundStart",
  round,
  totalRounds: 5,
  startedAt,
  endsAt: startedAt + 180_000,
  players: [{ id: "me", name: "Me" }, { id: "op", name: "Op" }],
});
const GREY = ["grey", "grey", "grey", "grey", "grey"] as const;
const result = (word: string, solvedMs: number | null = null): MatchMessage => ({
  type: "guessResult",
  word,
  colours: [...GREY],
  solvedMs,
});
const typeWord = (word: string) => [...word].forEach((l) => useMatch.getState().type(l));
const s = () => useMatch.getState();

beforeEach(() => s().reset());

describe("match store: a round", () => {
  test("roundStart opens the board and estimates the clock offset", () => {
    s().receive(roundStart(1, 10_000), 9_400);
    expect(s()).toMatchObject({ stage: "playing", round: 1, totalRounds: 5, endsAt: 190_000, offset: 600 });
    expect(s().roster.map((p) => p.name)).toEqual(["Me", "Op"]);
  });

  test("each round starts clean", () => {
    s().receive(roundStart(1), 0);
    typeWord("cra");
    s().receive(result("slate"), 0);
    s().receive({ type: "opponentProgress", id: "op", rows: [[...GREY]], solvedMs: null }, 0);
    s().receive(roundStart(2, 20_000), 0);
    expect(s()).toMatchObject({ round: 2, rows: [], input: "", opponents: {}, keyColours: {}, solvedMs: null, roundEnd: null });
  });

  test("ignores typing before a round has started", () => {
    typeWord("crane");
    expect(s().input).toBe("");
  });

  test("types up to five letters and ignores anything else", () => {
    s().receive(roundStart(), 0);
    typeWord("cranex1");
    expect(s().input).toBe("crane");
  });

  test("backspace removes a letter", () => {
    s().receive(roundStart(), 0);
    typeWord("cr");
    s().backspace();
    expect(s().input).toBe("c");
  });

  test("submit needs five letters, then blocks input until the server replies", () => {
    s().receive(roundStart(), 0);
    expect(s().submit()).toBeNull();
    expect(s().message).toBe("Not enough letters");
    typeWord("crane");
    expect(s().submit()).toBe("crane");
    typeWord("x");
    expect(s().input).toBe("crane");
    expect(s().submit()).toBeNull();
  });

  test("a result adds a row, merges key colours and clears the input", () => {
    s().receive(roundStart(), 0);
    typeWord("slate");
    s().submit();
    s().receive({ type: "guessResult", word: "slate", colours: ["green", "grey", "yellow", "grey", "grey"], solvedMs: null }, 0);
    expect(s()).toMatchObject({ input: "", pending: false });
    expect(s().rows).toHaveLength(1);
    expect(s().keyColours).toMatchObject({ s: "green", a: "yellow" });
  });

  test("a rejection keeps the input, unblocks typing and explains why", () => {
    s().receive(roundStart(), 0);
    typeWord("zzzzz");
    s().submit();
    s().receive({ type: "guessRejected", reason: "not-a-word" }, 0);
    expect(s()).toMatchObject({ input: "zzzzz", pending: false, message: "Not in word list" });
  });

  test.each([
    ["round-over", "That round is over"],
    ["no-guesses-left", "No guesses left"],
    ["rate-limited", "Slow down"],
  ] as const)("rejection %s has a message", (reason, text) => {
    s().receive(roundStart(), 0);
    s().receive({ type: "guessRejected", reason }, 0);
    expect(s().message).toBe(text);
  });

  test("solving locks the board", () => {
    s().receive(roundStart(), 0);
    s().receive(result("crane", 4200), 0);
    expect(s().solvedMs).toBe(4200);
    expect(isDone(s())).toBe(true);
    typeWord("a");
    expect(s().input).toBe("");
    expect(s().submit()).toBeNull();
  });

  test("six guesses lock the board", () => {
    s().receive(roundStart(), 0);
    for (let i = 0; i < 6; i++) s().receive(result("slate"), 0);
    expect(isDone(s())).toBe(true);
    expect(s().solvedMs).toBeNull();
  });

  test("a later guessResult without a solve time keeps an earlier one", () => {
    s().receive(roundStart(), 0);
    s().receive(result("crane", 100), 0);
    s().receive(result("slate"), 0);
    expect(s().solvedMs).toBe(100);
  });
});

describe("match store: opponents", () => {
  test("opponent boards hold colours and a solve time, replaced each update", () => {
    s().receive(roundStart(), 0);
    s().receive({ type: "opponentProgress", id: "op", rows: [[...GREY]], solvedMs: null }, 0);
    s().receive({ type: "opponentProgress", id: "op", rows: [[...GREY], [...GREY]], solvedMs: 9000 }, 0);
    expect(s().opponents.op).toEqual({ rows: [[...GREY], [...GREY]], solvedMs: 9000 });
  });
});

describe("match store: ending", () => {
  test("roundEnd shows the reveal and unlocks nothing", () => {
    s().receive(roundStart(), 0);
    typeWord("cra");
    s().receive({ type: "roundEnd", round: 1, answer: "crane", winnerId: "op", results: [], nextAt: 99 }, 0);
    expect(s()).toMatchObject({ stage: "reveal", input: "", pending: false });
    expect(s().roundEnd).toMatchObject({ answer: "crane", winnerId: "op", nextAt: 99 });
    typeWord("a");
    expect(s().input).toBe("");
  });

  test("matchEnd stores the ranking", () => {
    s().receive({ type: "matchEnd", ranking: [{ id: "me", name: "Me", roundsWon: 2, totalMs: 5, rank: 1 }] }, 0);
    expect(s()).toMatchObject({ stage: "finished" });
    expect(s().ranking?.[0].rank).toBe(1);
  });

  test("reset forgets everything", () => {
    s().receive(roundStart(), 0);
    s().reset();
    expect(s()).toMatchObject({ stage: "idle", round: 0, roster: [] });
  });
});

describe("match store: snapshot after a refresh or reconnect", () => {
  const snapshot = (over: Partial<Extract<MatchMessage, { type: "matchSnapshot" }>> = {}): MatchMessage => ({
    type: "matchSnapshot",
    serverNow: 50_000,
    stage: "playing",
    round: 2,
    totalRounds: 5,
    startedAt: 40_000,
    endsAt: 220_000,
    players: [{ id: "me", name: "Me" }, { id: "op", name: "Op" }],
    own: { rows: [{ word: "slate", colours: ["grey", "green", "grey", "grey", "yellow"] }], solvedMs: null },
    opponents: [{ id: "op", rows: [["grey", "grey", "grey", "grey", "grey"]], solvedMs: null }],
    roundEnd: null,
    ranking: null,
    ...over,
  });

  test("a running round restores own rows, key colours, opponents, timer and the clock offset", () => {
    s().receive(snapshot(), 49_000);
    expect(s()).toMatchObject({ stage: "playing", round: 2, endsAt: 220_000, offset: 1000 });
    expect(s().rows.map((r) => r.word)).toEqual(["slate"]);
    expect(s().keyColours).toMatchObject({ l: "green", e: "yellow", s: "grey" });
    expect(s().opponents.op.rows).toHaveLength(1);
    expect(s().roster.map((p) => p.name)).toEqual(["Me", "Op"]);
    typeWord("crane");
    expect(s().input).toBe("crane"); // the board is playable again
  });

  test("a snapshot during the reveal lands on the round summary with its countdown", () => {
    s().receive(snapshot({ stage: "reveal", roundEnd: { answer: "robot", winnerId: "op", results: [], nextAt: 55_000 } }), 50_000);
    expect(s()).toMatchObject({ stage: "reveal", roundEnd: { round: 2, answer: "robot", nextAt: 55_000 } });
  });

  test("a snapshot after the match lands on the results", () => {
    const ranking = [{ id: "me", name: "Me", roundsWon: 3, totalMs: 1, rank: 1 }];
    s().receive(snapshot({ stage: "finished", ranking }), 50_000);
    expect(s()).toMatchObject({ stage: "finished", ranking });
  });

  test("a solved board stays locked after the snapshot", () => {
    s().receive(snapshot({ own: { rows: [{ word: "robot", colours: Array(5).fill("green") }], solvedMs: 3000 } }), 50_000);
    expect(isDone(s())).toBe(true);
  });

  test("a snapshot replaces whatever the tab showed before the drop", () => {
    s().receive(roundStart(1), 0);
    s().receive(result("about"), 0);
    s().receive(snapshot(), 50_000);
    expect(s().rows.map((r) => r.word)).toEqual(["slate"]);
  });

  test("every refused guess bumps the rejection counter (it drives the shake)", () => {
    s().receive(roundStart(), 0);
    typeWord("cra");
    s().submit();
    s().receive({ type: "guessRejected", reason: "rate-limited" }, 0);
    expect(s().rejections).toBe(2);
    expect(s().message).toBe("Slow down");
  });
});
