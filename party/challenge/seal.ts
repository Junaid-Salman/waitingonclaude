import {
  CHALLENGE_ROUNDS,
  CHALLENGE_SECONDS_OPTIONS,
  WORD_LENGTH,
  type CheckResponse,
  type SealError,
  type SealResponse,
  type WordProblem,
} from "../../shared/protocol";
import { reply, replyJson } from "../http-cors";
import { isValidGuess, normalise } from "../games/woordle/words";
import { createWindowLimiter } from "../rate-limit";
import { sealChallenge, isChallengeConfigured } from "./token";

// Five short words and a number fit in well under this; anything bigger is hostile.
const MAX_BODY_CHARS = 1024;
const WORD_PATTERN = new RegExp(`^[a-z]{${WORD_LENGTH}}$`);

export type WordCheck = (word: string) => boolean;

export type SealValidation =
  | { ok: true; words: string[]; limitSec: number }
  | { ok: false; error: SealError };

const invalid = (extra: Partial<SealError> = {}): { ok: false; error: SealError } => ({
  ok: false,
  error: { error: "invalid", ...extra },
});

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((k) => keys.includes(k));
}

// Pure so the rules are unit-tested without a request. Words are normalised exactly as guesses are.
export function validateSeal(body: unknown, isWord: WordCheck = isValidGuess): SealValidation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return invalid();
  const { words, limitSec } = body as Record<string, unknown>;
  if (!hasOnlyKeys(body as Record<string, unknown>, ["words", "limitSec"])) return invalid();
  if (!Array.isArray(words) || words.length !== CHALLENGE_ROUNDS) return invalid();

  const limitOk = typeof limitSec === "number" && (CHALLENGE_SECONDS_OPTIONS as readonly number[]).includes(limitSec);
  const problems: { index: number; reason: WordProblem }[] = [];
  const normalised: string[] = [];
  const seen = new Set<string>();

  words.forEach((raw, index) => {
    const word = typeof raw === "string" ? normalise(raw) : "";
    normalised.push(word);
    if (!WORD_PATTERN.test(word)) problems.push({ index, reason: "bad-format" });
    else if (seen.has(word)) problems.push({ index, reason: "duplicate" });
    else if (!isWord(word)) problems.push({ index, reason: "not-a-word" });
    if (word) seen.add(word);
  });

  if (problems.length > 0 || !limitOk) {
    return invalid({ ...(problems.length > 0 ? { words: problems } : {}), ...(limitOk ? {} : { limit: true }) });
  }
  return { ok: true, words: normalised, limitSec: limitSec as number };
}

export type ChallengeRoute = "seal" | "check";

export interface RequestLimiter {
  allow(route: ChallengeRoute, key: string): boolean;
  // Seconds a refused caller should wait at most: the route's window.
  retryAfter(route: ChallengeRoute): number;
}

export interface RequestLimits {
  check: { limit: number; windowMs: number };
  seal: { limit: number; windowMs: number };
}

// A creator's form checks up to 5 words per link, so `check` gets more room than `seal`. Both are
// sized for one office behind a shared address, not for one person (Phase 5.1, Q7).
export const REQUEST_LIMITS: RequestLimits = {
  check: { limit: 60, windowMs: 10_000 },
  seal: { limit: 20, windowMs: 60_000 },
};

// Per-IP limits held only in this instance's memory, for at most two windows after an address's
// last request (rate-limit.ts). The address is never logged, stored or sent anywhere; this is the
// one place the app reads it (Spec 2.9).
export function createRequestLimiter(
  now: () => number,
  limits: RequestLimits = REQUEST_LIMITS,
  setTimer?: (ms: number, fn: () => void) => unknown,
): RequestLimiter {
  const byRoute = {
    check: createWindowLimiter({ ...limits.check, now, setTimer }),
    seal: createWindowLimiter({ ...limits.seal, now, setTimer }),
  };
  return {
    allow: (route, key) => byRoute[route].allow(key),
    retryAfter: (route) => Math.ceil(limits[route].windowMs / 1000),
  };
}

// The bucket for an address. One IPv6 subscriber usually holds a whole /64, so keying by the full
// address would hand one caller unlimited buckets. IPv4, and IPv4 written as IPv6 (::ffff:a.b.c.d),
// key by the address itself. Anything unparseable shares one bucket: over-limiting, never a leak.
export function ipKey(raw: string | null | undefined): string {
  const ip = (raw ?? "").trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];
  const groups = expandIpv6(ip);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : "unknown";
}

// Expands "::" so every address has eight groups; null when the text is not plain IPv6 (a zone
// id, an embedded IPv4 tail other than the mapped form, or junk).
function expandIpv6(ip: string): string[] | null {
  if (!/^[0-9a-f:]+$/.test(ip) || ip.length > 39) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const part = (s: string) => (s === "" ? [] : s.split(":"));
  const head = part(halves[0]);
  const tail = halves.length === 2 ? part(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.replace(/^0+(?=.)/, ""));
}

export interface ChallengeRequest {
  method: string;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}

async function readJson(req: ChallengeRequest): Promise<unknown> {
  // Refuse a declared oversize body before reading any of it. Four bytes per char covers UTF-8.
  const declared = Number(req.headers?.get("content-length") ?? 0);
  if (declared > MAX_BODY_CHARS * 4) return undefined;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// POST /parties/challenge/seal   {words, limitSec} -> {token}
// POST /parties/challenge/check  {word}            -> {valid}
// The room id in the URL is the route, so the same party also serves solver sockets (random ids).
export async function handleChallengeRequest(
  req: ChallengeRequest,
  roomId: string,
  env: { CHALLENGE_KEY?: unknown },
  isWord: WordCheck = isValidGuess,
  limiter?: RequestLimiter,
): Promise<Response> {
  if (roomId !== "seal" && roomId !== "check") return reply(404, "not found");
  if (req.method === "OPTIONS") return reply(204, null);
  if (req.method !== "POST") return reply(405, "method not allowed", { Allow: "POST, OPTIONS" });
  // Cloudflare sets this header; without it (local dev) every caller shares one bucket.
  if (limiter && !limiter.allow(roomId, ipKey(req.headers?.get("cf-connecting-ip")))) {
    return replyJson(429, { error: "rate-limited" } satisfies SealError, { "Retry-After": String(limiter.retryAfter(roomId)) });
  }

  const body = await readJson(req);

  if (roomId === "check") {
    if (typeof body !== "object" || body === null || !hasOnlyKeys(body as Record<string, unknown>, ["word"])) {
      return replyJson(400, { error: "invalid" });
    }
    const raw = (body as { word?: unknown }).word;
    if (typeof raw !== "string") return replyJson(400, { error: "invalid" });
    const word = normalise(raw);
    const result: CheckResponse = { valid: WORD_PATTERN.test(word) && isWord(word) };
    return replyJson(200, result);
  }

  if (!(await isChallengeConfigured(env.CHALLENGE_KEY))) {
    return replyJson(500, { error: "not-configured" } satisfies SealError);
  }
  const checked = validateSeal(body, isWord);
  if (!checked.ok) return replyJson(400, checked.error);
  const token = await sealChallenge({ v: 1, words: checked.words, limitSec: checked.limitSec }, env.CHALLENGE_KEY);
  if (!token) return replyJson(500, { error: "not-configured" } satisfies SealError);
  return replyJson(200, { token } satisfies SealResponse);
}
