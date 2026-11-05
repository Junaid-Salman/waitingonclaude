import { describe, expect, test } from "vitest";
import { handleChallengeRequest, validateSeal } from "../party/challenge/seal";
import { openChallenge } from "../party/challenge/token";
import { TEST_KEY, WORDS } from "./helpers/challenge";

const everyWordValid = () => true;
const env = { CHALLENGE_KEY: TEST_KEY };

const post = (roomId: string, body: unknown, opts: { method?: string; env?: { CHALLENGE_KEY?: unknown }; isWord?: (w: string) => boolean } = {}) =>
  handleChallengeRequest(
    { method: opts.method ?? "POST", text: async () => (typeof body === "string" ? body : JSON.stringify(body)) },
    roomId,
    opts.env ?? env,
    opts.isWord ?? everyWordValid,
  );

describe("validateSeal", () => {
  test("accepts five distinct valid words and normalises them", () => {
    expect(validateSeal({ words: ["  CRANE ", "Slate", "robot", "moist", "light"], limitSec: 120 }, everyWordValid)).toEqual({
      ok: true,
      words: WORDS,
      limitSec: 120,
    });
  });

  test("marks a non-dictionary word by index", () => {
    const r = validateSeal({ words: ["crane", "slate", "zzzzz", "moist", "light"], limitSec: 60 }, (w) => w !== "zzzzz");
    expect(r).toEqual({ ok: false, error: { error: "invalid", words: [{ index: 2, reason: "not-a-word" }] } });
  });

  test("marks the repeated word, not its first occurrence", () => {
    const r = validateSeal({ words: ["crane", "slate", "Crane", "moist", "light"], limitSec: 60 }, everyWordValid);
    expect(r).toEqual({ ok: false, error: { error: "invalid", words: [{ index: 2, reason: "duplicate" }] } });
  });

  test.each([
    ["short", "cran"],
    ["long", "cranes"],
    ["digits", "cr4ne"],
    ["empty", ""],
    ["a number", 12345],
    ["null", null],
  ])("a %s word is bad-format", (_label, word) => {
    const r = validateSeal({ words: [word, "slate", "robot", "moist", "light"], limitSec: 60 }, everyWordValid);
    expect(r).toEqual({ ok: false, error: { error: "invalid", words: [{ index: 0, reason: "bad-format" }] } });
  });

  test("reports every problem at once, with the limit", () => {
    const r = validateSeal({ words: ["a", "slate", "slate", "moist", "light"], limitSec: 45 }, everyWordValid);
    expect(r).toEqual({
      ok: false,
      error: { error: "invalid", words: [{ index: 0, reason: "bad-format" }, { index: 2, reason: "duplicate" }], limit: true },
    });
  });

  test.each([30, 90, 0, -60, "180", null, undefined, Number.NaN])("rejects limit %j", (limitSec) => {
    const r = validateSeal({ words: WORDS, limitSec }, everyWordValid);
    expect(r).toEqual({ ok: false, error: { error: "invalid", limit: true } });
  });

  test.each([60, 120, 180, 300])("accepts limit %i", (limitSec) => {
    expect(validateSeal({ words: WORDS, limitSec }, everyWordValid).ok).toBe(true);
  });

  test.each([
    ["not an object", "x"],
    ["null", null],
    ["an array", []],
    ["no words", { limitSec: 60 }],
    ["words not an array", { words: "crane", limitSec: 60 }],
    ["four words", { words: WORDS.slice(0, 4), limitSec: 60 }],
    ["six words", { words: [...WORDS, "stone"], limitSec: 60 }],
    ["an extra field", { words: WORDS, limitSec: 60, admin: true }],
  ])("rejects %s", (_label, body) => {
    expect(validateSeal(body, everyWordValid)).toEqual({ ok: false, error: { error: "invalid" } });
  });
});

describe("seal endpoint", () => {
  test("returns a token that opens to the normalised words", async () => {
    const res = await post("seal", { words: ["CRANE", " slate", "robot", "moist", "light"], limitSec: 180 });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(await openChallenge(token, TEST_KEY)).toEqual({ ok: true, payload: { v: 1, words: WORDS, limitSec: 180 } });
  });

  test("answers the preflight with CORS headers", async () => {
    for (const room of ["seal", "check"]) {
      const res = await post(room, "", { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    }
  });

  test("every response carries the CORS origin header", async () => {
    const ok = await post("seal", { words: WORDS, limitSec: 60 });
    const bad = await post("seal", { words: [], limitSec: 60 });
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("rejects a non-dictionary word with its index and never echoes the words", async () => {
    const res = await post("seal", { words: ["crane", "slate", "zzzzz", "moist", "light"], limitSec: 60 }, { isWord: (w) => w !== "zzzzz" });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "invalid", words: [{ index: 2, reason: "not-a-word" }] });
    expect(text).not.toContain("zzzzz");
  });

  test("rejects invalid JSON and an oversized body", async () => {
    expect((await post("seal", "{nope")).status).toBe(400);
    expect((await post("seal", `{"words":["${"a".repeat(2000)}"],"limitSec":60}`)).status).toBe(400);
  });

  test.each(["GET", "PUT", "DELETE"])("405 for %s with an Allow header", async (method) => {
    const res = await post("seal", "", { method });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  test("404 for an unknown route", async () => {
    expect((await post("nope", {})).status).toBe(404);
  });

  test.each([undefined, "", "bad", Buffer.alloc(16).toString("base64")])("a missing or bad key (%j) answers 500 not-configured", async (key) => {
    const res = await post("seal", { words: WORDS, limitSec: 60 }, { env: { CHALLENGE_KEY: key } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "not-configured" });
  });
});

describe("check endpoint", () => {
  test("reports validity and normalises the word", async () => {
    const isWord = (w: string) => w === "crane";
    expect(await (await post("check", { word: " CRANE " }, { isWord })).json()).toEqual({ valid: true });
    expect(await (await post("check", { word: "zzzzz" }, { isWord })).json()).toEqual({ valid: false });
    expect(await (await post("check", { word: "cra" }, { isWord: () => true })).json()).toEqual({ valid: false });
  });

  test.each([{}, { word: 5 }, { word: "crane", extra: 1 }, [], "x"])("rejects %j", async (body) => {
    expect((await post("check", body)).status).toBe(400);
  });

  test("works without a key (it only reads the public guess list)", async () => {
    expect((await post("check", { word: "crane" }, { env: {} })).status).toBe(200);
  });
});
