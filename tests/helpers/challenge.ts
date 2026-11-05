import type { ChallengePayload } from "../../party/challenge/token";

// A fixed 32-byte test key (base64). Never the owner's CHALLENGE_KEY.
export const TEST_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
export const OTHER_KEY = "HR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw=";

export const WORDS = ["crane", "slate", "robot", "moist", "light"];

export const payload = (over: Partial<ChallengePayload> = {}): ChallengePayload => ({
  v: 1,
  words: WORDS,
  limitSec: 180,
  ...over,
});

const toB64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Encrypts any JSON under the key, bypassing sealChallenge's own validation, so tests can build
// tokens that are authentic but carry a malformed payload.
export async function sealRaw(value: unknown, base64Key = TEST_KEY): Promise<string> {
  const key = await crypto.subtle.importKey("raw", Buffer.from(base64Key, "base64"), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value))),
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return toB64Url(out);
}

export function flipBit(token: string, byteIndex: number): string {
  const bytes = Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  bytes[byteIndex] ^= 1;
  return toB64Url(bytes);
}
