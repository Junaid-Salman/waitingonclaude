import { beforeEach, describe, expect, test } from "vitest";
import type { ChallengeServerMessage } from "../shared/protocol";
import { isDone, useChallenge } from "../src/lib/challenge/store";
import { challengeLink, isPlausibleToken } from "../src/lib/challenge/link";

const s = () => useChallenge.getState();
const GREY = ["grey", "grey", "grey", "grey", "grey"] as const;
const roundStart = (round = 1, startedAt = 10_000): ChallengeServerMessage => ({
  type: "roundStart",
  round,
  totalRounds: 5,
  startedAt,
  endsAt: startedAt + 60_000,
});
const result = (word: string, solvedMs: number | null = null): ChallengeServerMessage => ({
  type: "guessResult",
  word,
  colours: [...GREY],
  solvedMs,
});
const typeWord = (word: string) => [...word].forEach((l) => s().type(l));

beforeEach(() => s().reset());

describe("challenge store", () => {
  test("beginning shows the connecting state", () => {
    s().beginning();
    expect(s().stage).toBe("connecting");
  });

  test("challengeStart keeps the limit; roundStart opens the board and estimates the offset", () => {
    s().receive({ type: "challengeStart", totalRounds: 5, limitSec: 60 }, 0);
    s().receive(roundStart(1, 10_000), 9_400);
    expect(s()).toMatchObject({ stage: "playing", round: 1, totalRounds: 5, limitSec: 60, endsAt: 70_000, offset: 600 });
  });

  test("typing only accepts letters, up to five, while playing", () => {
    typeWord("crane");
    expect(s().input).toBe(""); // not playing yet
    s().receive(roundStart(), 0);
    typeWord("cr4aneX");
    expect(s().input).toBe("crane");
    s().backspace();
    expect(s().input).toBe("cran");
  });

  test("submit needs five letters, then waits for the server", () => {
    s().receive(roundStart(), 0);
    typeWord("cra");
    expect(s().submit()).toBeNull();
    expect(s().message).toBe("Not enough letters");
    typeWord("ne");
    expect(s().submit()).toBe("crane");
    expect(s().submit()).toBeNull(); // pending
  });

  test("a guessResult appends the server's colours and clears the input", () => {
    s().receive(roundStart(), 0);
    typeWord("crane");
    s().submit();
    s().receive(result("crane"), 0);
    expect(s().rows).toEqual([{ word: "crane", colours: [...GREY] }]);
    expect(s()).toMatchObject({ input: "", pending: false });
  });

  test("a solve locks the board", () => {
    s().receive(roundStart(), 0);
    s().receive(result("crane", 4000), 0);
    expect(isDone(s())).toBe(true);
    s().type("a");
    expect(s().input).toBe("");
  });

  test("a rejection keeps the word and shows a message", () => {
    s().receive(roundStart(), 0);
    typeWord("zzzzz");
    s().submit();
    s().receive({ type: "guessRejected", reason: "not-a-word" }, 0);
    expect(s()).toMatchObject({ input: "zzzzz", pending: false, message: "Not in word list" });
  });

  test("roundEnd reveals the answer; the next roundStart clears the board", () => {
    s().receive(roundStart(1), 0);
    s().receive({ type: "roundEnd", round: 1, answer: "crane", solvedMs: null, guesses: 0, nextAt: 99 }, 0);
    expect(s()).toMatchObject({ stage: "reveal", roundEnd: { answer: "crane", nextAt: 99 } });
    s().receive(roundStart(2), 0);
    expect(s()).toMatchObject({ stage: "playing", round: 2, rows: [], roundEnd: null });
  });

  test("challengeEnd stores the summary", () => {
    s().receive({ type: "challengeEnd", rounds: [], solved: 3, totalMs: 12_000 }, 0);
    expect(s()).toMatchObject({ stage: "finished", summary: { solved: 3, totalMs: 12_000 } });
  });

  test("an invalid-token error expires the link; unavailable is separate", () => {
    s().receive({ type: "error", code: "invalid-token" }, 0);
    expect(s().stage).toBe("expired");
    s().reset();
    s().receive({ type: "error", code: "unavailable" }, 0);
    expect(s().stage).toBe("unavailable");
  });

  test("a dropped socket mid-run returns to Start with a notice", () => {
    s().receive(roundStart(), 0);
    s().disconnected();
    expect(s()).toMatchObject({ stage: "idle", rows: [] });
    expect(s().message).toMatch(/Connection lost/);
  });

  test("a close after expiry or the summary changes nothing", () => {
    s().receive({ type: "error", code: "invalid-token" }, 0);
    s().disconnected();
    expect(s().stage).toBe("expired");
  });
});

describe("challenge store: refusing a run before it starts", () => {
  test("expire() shows the expired state without a server round trip", () => {
    s().expire();
    expect(s().stage).toBe("expired");
  });

  test("connectTimedOut() returns a stuck connect to Start with a message", () => {
    s().beginning();
    s().connectTimedOut();
    expect(s()).toMatchObject({ stage: "idle" });
    expect(s().message).toMatch(/Could not reach the server/);
  });

  test.each(["idle", "playing", "reveal", "finished", "expired"] as const)("connectTimedOut() does nothing from %s", (stage) => {
    if (stage === "playing") s().receive(roundStart(), 0);
    else if (stage === "reveal") s().receive({ type: "roundEnd", round: 1, answer: "crane", solvedMs: null, guesses: 0, nextAt: 9 }, 0);
    else if (stage === "finished") s().receive({ type: "challengeEnd", rounds: [], solved: 0, totalMs: 0 }, 0);
    else if (stage === "expired") s().expire();
    const before = s().stage;
    s().connectTimedOut();
    expect(s().stage).toBe(before);
  });
});

describe("challengeLink", () => {
  test("joins the origin and the token without exposing anything else", () => {
    expect(challengeLink("https://x.test", "abc_-")).toBe("https://x.test/woordle/challenge/abc_-");
  });
});

describe("isPlausibleToken", () => {
  test("accepts a real-length token and the largest allowed one", () => {
    expect(isPlausibleToken("A".repeat(134))).toBe(true);
    expect(isPlausibleToken("a-Z_9".repeat(100).slice(0, 512))).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["over the cap", "A".repeat(513)],
    ["a space", "abc def"],
    ["a plus sign", "ab+cd"],
    ["a slash", "ab/cd"],
    ["padding", "abcd=="],
    ["a percent escape", "ab%20cd"],
    ["non-ascii", "abcé"],
  ])("rejects %s", (_label, token) => {
    expect(isPlausibleToken(token)).toBe(false);
  });
});
