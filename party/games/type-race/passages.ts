import data from "../../data/passages.json";
import type { PassageLength } from "../../../shared/type-race-protocol";
import { cryptoRng, pickDistinct, type Rng } from "../woordle/pick";

// The passage pool (spec 5.6). Server-side only: the client gets one passage at a time over HTTP
// (Phase 8, Q33), and scripts/check-bundle.mjs fails the build if the pool reaches .next/static.
// Ids are stable and never reused or removed once shipped: Challenge links point at them (Q31).
export interface Passage {
  id: string;
  text: string;
  length: PassageLength;
  source?: string;
}

export const passages: readonly Passage[] = data as Passage[];

const byId = new Map(passages.map((p) => [p.id, p]));

export const passagesByLength = (length: PassageLength): Passage[] => passages.filter((p) => p.length === length);

export const passageById = (id: string): Passage | undefined => byId.get(id);

// `count` different passage ids of one length. Throws when the bucket is smaller than `count`.
export function pickPassageIds(length: PassageLength, count: number, rng: Rng = cryptoRng): string[] {
  return pickDistinct(
    passagesByLength(length).map((p) => p.id),
    count,
    rng,
  );
}

// One passage of `length` that is not in `exclude` (Practice's "next passage"). If the exclude list
// covers the whole bucket it is ignored rather than leaving nothing to serve.
export function pickPassage(length: PassageLength, exclude: ReadonlySet<string> = new Set(), rng: Rng = cryptoRng): Passage {
  const all = passagesByLength(length);
  const fresh = all.filter((p) => !exclude.has(p.id));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.floor(rng() * pool.length)];
}
