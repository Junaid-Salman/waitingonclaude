import { describe, expect, test } from "vitest";
import { createRequestLimiter, handleChallengeRequest, ipKey, validateSeal } from "../party/challenge/seal";
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

describe("per-IP request limits", () => {
  const call = (route: "seal" | "check", ip: string | null, limiter: ReturnType<typeof createRequestLimiter>, body: unknown) =>
    handleChallengeRequest(
      { method: "POST", headers: { get: (h) => (h === "cf-connecting-ip" ? ip : null) }, text: async () => JSON.stringify(body) },
      route,
      env,
      everyWordValid,
      limiter,
    );

  test("check allows 60 per 10 s per IP, then 429 with CORS, Retry-After and no address in the body", async () => {
    let t = 0;
    const limiter = createRequestLimiter(() => t);
    for (let i = 0; i < 60; i++) expect((await call("check", "203.0.113.7", limiter, { word: "crane" })).status).toBe(200);
    const blocked = await call("check", "203.0.113.7", limiter, { word: "crane" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(blocked.headers.get("Retry-After")).toBe("10");
    const text = await blocked.text();
    expect(JSON.parse(text)).toEqual({ error: "rate-limited" });
    expect(text).not.toContain("203.0.113.7");
    t = 10_000;
    expect((await call("check", "203.0.113.7", limiter, { word: "crane" })).status).toBe(200);
  });

  test("seal allows 20 per minute per IP, and its 429 says retry within 60 s", async () => {
    const limiter = createRequestLimiter(() => 0);
    const body = { words: WORDS, limitSec: 60 };
    for (let i = 0; i < 20; i++) expect((await call("seal", "198.51.100.1", limiter, body)).status).toBe(200);
    const blocked = await call("seal", "198.51.100.1", limiter, body);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
  });

  test("IPv6 callers in one /64 share a bucket; another /64 has its own", async () => {
    const limiter = createRequestLimiter(() => 0);
    const body = { words: WORDS, limitSec: 60 };
    for (let i = 0; i < 20; i++) await call("seal", `2001:db8:1:2::${(i + 1).toString(16)}`, limiter, body);
    expect((await call("seal", "2001:db8:1:2:ffff:ffff:ffff:ffff", limiter, body)).status).toBe(429);
    expect((await call("seal", "2001:db8:1:3::1", limiter, body)).status).toBe(200);
  });

  test("addresses are independent, and seal and check have separate budgets", async () => {
    const limiter = createRequestLimiter(() => 0);
    for (let i = 0; i < 20; i++) await call("seal", "198.51.100.1", limiter, { words: WORDS, limitSec: 60 });
    expect((await call("seal", "198.51.100.2", limiter, { words: WORDS, limitSec: 60 })).status).toBe(200);
    expect((await call("check", "198.51.100.1", limiter, { word: "crane" })).status).toBe(200);
  });

  test("without the Cloudflare header every caller shares one bucket", async () => {
    const limiter = createRequestLimiter(() => 0);
    for (let i = 0; i < 20; i++) await call("seal", null, limiter, { words: WORDS, limitSec: 60 });
    expect((await call("seal", null, limiter, { words: WORDS, limitSec: 60 })).status).toBe(429);
  });

  test("the preflight is never limited", async () => {
    const limiter = createRequestLimiter(() => 0);
    for (let i = 0; i < 70; i++) await call("check", "203.0.113.9", limiter, { word: "crane" });
    const res = await handleChallengeRequest({ method: "OPTIONS", text: async () => "" }, "check", env, everyWordValid, limiter);
    expect(res.status).toBe(204);
  });
});

describe("ipKey", () => {
  test.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["::FFFF:203.0.113.7", "203.0.113.7"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["2001:db8:0:0:1:2:3:4", "2001:db8:0:0::/64"],
    ["2001:0db8:0000:0000:abcd:0000:0000:0001", "2001:db8:0:0::/64"],
    ["2001:DB8:aa:bb::", "2001:db8:aa:bb::/64"],
    ["2001:db8:aa:bb:cc::1", "2001:db8:aa:bb::/64"],
    ["::1", "0:0:0:0::/64"],
    ["::", "0:0:0:0::/64"],
    ["fe80::1:2:3:4", "fe80:0:0:0::/64"],
    ["1:2:3:4:5:6:7::", "1:2:3:4::/64"],
  ])("%s keys as %s", (raw, key) => {
    expect(ipKey(raw)).toBe(key);
  });

  test("a naive split would be wrong: compressed and expanded forms of one /64 match", () => {
    expect(ipKey("2001:db8::1")).toBe(ipKey("2001:db8:0:0:ffff::9"));
    expect(ipKey("2001:db8::1")).not.toBe(ipKey("2001:db8:0:1::1"));
  });

  test.each([null, undefined, "", "junk", "1:2:3:4:5:6:7:8:9", "1::2::3", "12345::1", "fe80::1%eth0", "2001:db8::g"])(
    "%s shares the unknown bucket",
    (raw) => {
      expect(ipKey(raw)).toBe("unknown");
    },
  );
});
