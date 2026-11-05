import { describe, expect, test } from "vitest";
import { isChallengeConfigured, openChallenge, sealChallenge } from "../party/challenge/token";
import { OTHER_KEY, TEST_KEY, flipBit, payload, sealRaw } from "./helpers/challenge";

const sealed = async () => (await sealChallenge(payload(), TEST_KEY)) as string;

describe("challenge token", () => {
  test("round-trips the words and the limit", async () => {
    const opened = await openChallenge(await sealed(), TEST_KEY);
    expect(opened).toEqual({ ok: true, payload: payload() });
  });

  test("a fresh IV makes two seals of one payload differ", async () => {
    expect(await sealed()).not.toBe(await sealed());
  });

  test("the token is URL-safe and the words are not readable in it", async () => {
    const token = await sealed();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    for (const w of payload().words) expect(token.toLowerCase()).not.toContain(w);
  });

  // Byte 0-11 is the IV, the rest ciphertext, the last 16 the tag.
  test.each([0, 5, 12, 20, -1])("a flipped bit at byte %i is rejected", async (index) => {
    const token = await sealed();
    const length = Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").length;
    expect(await openChallenge(flipBit(token, index < 0 ? length - 1 : index), TEST_KEY)).toEqual({ ok: false });
  });

  test("the wrong key is rejected", async () => {
    expect(await openChallenge(await sealed(), OTHER_KEY)).toEqual({ ok: false });
  });

  test.each([
    ["empty", ""],
    ["not base64url", "not a token!"],
    ["too short", "abc"],
    ["odd length", "A"],
    ["oversized", "A".repeat(513)],
  ])("a %s token is rejected without throwing", async (_label, token) => {
    expect(await openChallenge(token, TEST_KEY)).toEqual({ ok: false });
  });

  test("a truncated token is rejected", async () => {
    expect(await openChallenge((await sealed()).slice(0, -6), TEST_KEY)).toEqual({ ok: false });
  });

  // These are authentic tokens (right key) whose payload is wrong: GCM alone would accept them.
  test.each([
    ["version 2", { ...payload(), v: 2 }],
    ["four words", payload({ words: ["crane", "slate", "robot", "moist"] })],
    ["six words", payload({ words: [...payload().words, "stone"] })],
    ["a non-string word", payload({ words: ["crane", "slate", "robot", "moist", 5 as unknown as string] })],
    ["a 4-letter word", payload({ words: ["crane", "slate", "robot", "moist", "lit"] })],
    ["an uppercase word", payload({ words: ["CRANE", "slate", "robot", "moist", "light"] })],
    ["duplicate words", payload({ words: ["crane", "crane", "robot", "moist", "light"] })],
    ["a limit that is not offered", payload({ limitSec: 45 })],
    ["a string limit", payload({ limitSec: "180" as unknown as number })],
    ["null", null],
    ["a string", "crane"],
  ])("an authentic token with %s is rejected", async (_label, bad) => {
    expect(await openChallenge(await sealRaw(bad), TEST_KEY)).toEqual({ ok: false });
  });

  test("an authentic token with non-JSON plaintext is rejected", async () => {
    const key = await crypto.subtle.importKey("raw", Buffer.from(TEST_KEY, "base64"), "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("{oops")));
    const out = Buffer.concat([iv, ct]).toString("base64url");
    expect(await openChallenge(out, TEST_KEY)).toEqual({ ok: false });
  });

  describe("a bad key fails closed", () => {
    test.each([
      ["undefined", undefined],
      ["empty", ""],
      ["not base64", "%%%"],
      ["31 bytes", Buffer.alloc(31, 1).toString("base64")],
      ["33 bytes", Buffer.alloc(33, 1).toString("base64")],
      ["a number", 5],
    ])("%s", async (_label, key) => {
      expect(await isChallengeConfigured(key)).toBe(false);
      expect(await sealChallenge(payload(), key)).toBeNull();
      expect(await openChallenge(await sealed(), key)).toEqual({ ok: false });
    });
  });

  test("a good key is configured", async () => {
    expect(await isChallengeConfigured(TEST_KEY)).toBe(true);
  });

  test("sealing refuses a malformed payload", async () => {
    expect(await sealChallenge(payload({ limitSec: 7 }), TEST_KEY)).toBeNull();
  });

  test("the link stays under 200 characters on the production and fallback hosts", async () => {
    const token = await sealed();
    for (const host of ["waitingonclaude.vercel.app", "waitingonclaude-game.vercel.app"]) {
      const link = `https://${host}/woordle/challenge/${token}`;
      expect(link.length).toBeLessThan(200);
    }
  });

  test("the longest valid payload still fits", async () => {
    const token = (await sealChallenge(payload({ words: ["zzzzz", "yyyyy", "xxxxx", "wwwww", "vvvvv"], limitSec: 300 }), TEST_KEY)) as string;
    expect(`https://waitingonclaude-game.vercel.app/woordle/challenge/${token}`.length).toBeLessThan(200);
  });
});
