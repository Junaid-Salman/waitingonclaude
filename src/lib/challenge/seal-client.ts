import type { CheckResponse, SealError, SealResponse, WordProblem } from "../../../shared/protocol";
import { partyHost, partyHttpUrl } from "../party-host";

const base = () => `${partyHttpUrl(partyHost())}/parties/challenge`;

export type SealOutcome =
  | { ok: true; token: string }
  | { ok: false; kind: "invalid"; words: { index: number; reason: WordProblem }[]; limit: boolean }
  | { ok: false; kind: "unavailable" };

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${base()}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The words go to the server over the request body only; they are never put in a URL.
export async function sealWords(words: string[], limitSec: number): Promise<SealOutcome> {
  try {
    const res = await postJson("seal", { words, limitSec });
    if (res.ok) return { ok: true, token: ((await res.json()) as SealResponse).token };
    if (res.status === 400) {
      const err = (await res.json()) as SealError;
      return { ok: false, kind: "invalid", words: err.words ?? [], limit: err.limit === true };
    }
  } catch {
    // Network failure falls through to "unavailable".
  }
  return { ok: false, kind: "unavailable" };
}

// null means "could not tell" (network), which the form treats as unchecked rather than invalid.
export async function checkWord(word: string): Promise<boolean | null> {
  try {
    const res = await postJson("check", { word });
    if (!res.ok) return null;
    return ((await res.json()) as CheckResponse).valid;
  } catch {
    return null;
  }
}
