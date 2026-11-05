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
): Promise<Response> {
  if (roomId !== "seal" && roomId !== "check") return reply(404, "not found");
  if (req.method === "OPTIONS") return reply(204, null);
  if (req.method !== "POST") return reply(405, "method not allowed", { Allow: "POST, OPTIONS" });

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
