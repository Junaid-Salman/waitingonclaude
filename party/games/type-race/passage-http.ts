import { isPassageLength, MAX_EXCLUDE_IDS, type PassageError, type PassageLength, type PassageResponse } from "../../../shared/type-race-protocol";
import { reply, replyJson } from "../../http-cors";
import { ipKey } from "../../challenge/seal";
import type { WindowLimiter } from "../../rate-limit";
import { pickPassage, type Passage } from "./passages";

// Practice asks for one passage at a time. 60 requests per 10 s per address is sized for an office
// behind one address, like the Challenge routes (Phase 5.1, Q7).
export const PASSAGE_LIMIT = { limit: 60, windowMs: 10_000 } as const;

export type PassagePicker = (length: PassageLength, exclude: ReadonlySet<string>) => Passage;

export interface PassageRequest {
  method: string;
  url: string;
  headers?: { get(name: string): string | null };
}

// A GET from the browser is a "simple" request, but the preflight still answers with the right verbs.
const GET_CORS = { "Access-Control-Allow-Methods": "GET, OPTIONS" };

// GET /parties/type-race-solo/passage?length=short&exclude=s-001,s-002  ->  {id, text, length}
// The room id in the URL is the route ("passage"), so the same party can serve solver sockets later.
// Pure: the limiter and picker are injected. Nothing about the caller is stored or echoed back.
export function handlePassageRequest(
  req: PassageRequest,
  roomId: string,
  limiter?: Pick<WindowLimiter, "allow">,
  pick: PassagePicker = pickPassage,
): Response {
  if (roomId !== "passage") return reply(404, "not found");
  if (req.method === "OPTIONS") return reply(204, null, GET_CORS);
  if (req.method !== "GET") return reply(405, "method not allowed", { ...GET_CORS, Allow: "GET, OPTIONS" });
  // Cloudflare sets this header; without it (local dev) every caller shares one bucket.
  if (limiter && !limiter.allow(ipKey(req.headers?.get("cf-connecting-ip")))) {
    return replyJson(429, { error: "rate-limited" } satisfies PassageError, {
      ...GET_CORS,
      "Retry-After": String(Math.ceil(PASSAGE_LIMIT.windowMs / 1000)),
    });
  }

  let params: URLSearchParams;
  try {
    params = new URL(req.url, "http://placeholder.invalid").searchParams;
  } catch {
    return replyJson(400, { error: "invalid" } satisfies PassageError, GET_CORS);
  }
  const length = params.get("length");
  if (!isPassageLength(length)) return replyJson(400, { error: "invalid" } satisfies PassageError, GET_CORS);

  // Extra ids are ignored rather than refused: a stale client should still get a passage.
  const exclude = new Set((params.get("exclude") ?? "").split(",").filter(Boolean).slice(0, MAX_EXCLUDE_IDS));
  const passage = pick(length, exclude);
  const body: PassageResponse = {
    id: passage.id,
    text: passage.text,
    length: passage.length,
    ...(passage.source ? { source: passage.source } : {}),
  };
  // Every request must draw a fresh passage, so nothing may cache it.
  return replyJson(200, body, { ...GET_CORS, "Cache-Control": "no-store" });
}
