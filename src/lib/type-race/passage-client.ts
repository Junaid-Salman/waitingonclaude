import { isPassageLength, MAX_EXCLUDE_IDS, type PassageLength, type PassageResponse } from "../../../shared/type-race-protocol";
import { partyHost, partyHttpUrl } from "../party-host";

export type PassageResult =
  | { ok: true; passage: PassageResponse }
  // unreachable: no answer (offline, server down); rate-limited: 429; bad-response: anything else.
  | { ok: false; reason: "unreachable" | "rate-limited" | "bad-response" };

export interface PassageFetchOptions {
  host?: string;
  fetchImpl?: typeof fetch;
}

function isPassage(value: unknown): value is PassageResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.text === "string" && v.text.length > 0 && isPassageLength(v.length);
}

// Practice asks the server for one passage at a time: the pool never ships in the page (Q33).
export async function fetchPassage(length: PassageLength, exclude: readonly string[] = [], options: PassageFetchOptions = {}): Promise<PassageResult> {
  const base = partyHttpUrl(options.host ?? partyHost());
  const query = new URLSearchParams({ length });
  const ids = exclude.slice(-MAX_EXCLUDE_IDS);
  if (ids.length > 0) query.set("exclude", ids.join(","));
  try {
    const res = await (options.fetchImpl ?? fetch)(`${base}/parties/type-race-solo/passage?${query}`, { cache: "no-store" });
    if (res.status === 429) return { ok: false, reason: "rate-limited" };
    if (!res.ok) return { ok: false, reason: "bad-response" };
    const body: unknown = await res.json();
    return isPassage(body) ? { ok: true, passage: body } : { ok: false, reason: "bad-response" };
  } catch (error) {
    // fetch rejects when the server can't be reached; a body that isn't JSON throws a SyntaxError.
    return { ok: false, reason: error instanceof SyntaxError ? "bad-response" : "unreachable" };
  }
}
