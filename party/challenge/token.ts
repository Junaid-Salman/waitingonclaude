import { CHALLENGE_ROUNDS, CHALLENGE_SECONDS_OPTIONS, MAX_TOKEN_CHARS, WORD_LENGTH } from "../../shared/protocol";

export interface ChallengePayload {
  v: 1;
  words: string[];
  limitSec: number;
}

// A failed open is deliberately one undifferentiated result: a rotated key, a truncated link and
// a tampered one must look identical, so a caller learns nothing about why.
export type OpenResult = { ok: true; payload: ChallengePayload } | { ok: false };

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array | null {
  if (input.length === 0 || input.length > MAX_TOKEN_CHARS || !/^[A-Za-z0-9_-]+$/.test(input)) return null;
  try {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// The key must be exactly 32 bytes of base64. There is no fallback key: a missing or malformed
// one makes sealing and opening fail instead of quietly encrypting under something weak.
async function importKey(base64Key: unknown): Promise<CryptoKey | null> {
  if (typeof base64Key !== "string") return null;
  try {
    const raw = Uint8Array.from(atob(base64Key.trim()), (c) => c.charCodeAt(0));
    if (raw.length !== KEY_BYTES) return null;
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

export function isChallengeConfigured(base64Key: unknown): Promise<boolean> {
  return importKey(base64Key).then((key) => key !== null);
}

// The shape every opened payload must have, whatever key sealed it.
export function isWellFormedPayload(value: unknown): value is ChallengePayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p.v !== 1 || typeof p.limitSec !== "number") return false;
  if (!(CHALLENGE_SECONDS_OPTIONS as readonly number[]).includes(p.limitSec)) return false;
  if (!Array.isArray(p.words) || p.words.length !== CHALLENGE_ROUNDS) return false;
  const pattern = new RegExp(`^[a-z]{${WORD_LENGTH}}$`);
  if (!p.words.every((w) => typeof w === "string" && pattern.test(w))) return false;
  return new Set(p.words).size === CHALLENGE_ROUNDS;
}

// Returns null when the key is unusable or the payload is not well formed.
export async function sealChallenge(payload: ChallengePayload, base64Key: unknown): Promise<string | null> {
  const key = await importKey(base64Key);
  if (!key || !isWellFormedPayload(payload)) return null;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload))),
  );
  const token = new Uint8Array(iv.length + ciphertext.length);
  token.set(iv, 0);
  token.set(ciphertext, iv.length);
  return toBase64Url(token);
}

export async function openChallenge(token: string, base64Key: unknown): Promise<OpenResult> {
  const bytes = typeof token === "string" ? fromBase64Url(token) : null;
  if (!bytes || bytes.length < IV_BYTES + TAG_BYTES + 1) return { ok: false };
  const key = await importKey(base64Key);
  if (!key) return { ok: false };
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) },
      key,
      bytes.slice(IV_BYTES),
    );
    const payload: unknown = JSON.parse(decoder.decode(plaintext));
    return isWellFormedPayload(payload) ? { ok: true, payload } : { ok: false };
  } catch {
    return { ok: false };
  }
}
