import type { RacePlayerResult } from "../../../shared/type-race-protocol";

export interface PlacementInput {
  id: string;
  // Milliseconds from the start to the last word; null = did not finish.
  finishedMs: number | null;
  progress: number;
  wpm: number;
  accuracy: number;
}

// 5, 4, 3, 2, 1 for placements 1 to 5; a non-finisher scores 0 (spec 6).
export const pointsFor = (placement: number | null): number => (placement === null ? 0 : Math.max(0, 6 - placement));

// Finishers by finish time, equal times sharing a placement and the next one skipped (1, 1, 3).
// Then those who did not finish, by progress and then WPM, with no placement and 0 points. The
// result list is in display order. Ties keep input (join) order because the sort is stable.
export function placeRace(entries: readonly PlacementInput[]): RacePlayerResult[] {
  const finished = entries.filter((e) => e.finishedMs !== null).sort((a, b) => a.finishedMs! - b.finishedMs!);
  const unfinished = entries.filter((e) => e.finishedMs === null).sort((a, b) => b.progress - a.progress || b.wpm - a.wpm);

  const out: RacePlayerResult[] = [];
  let placement = 0;
  finished.forEach((e, i) => {
    if (i === 0 || finished[i - 1].finishedMs !== e.finishedMs) placement = i + 1;
    out.push({ id: e.id, placement, wpm: e.wpm, accuracy: e.accuracy, timeMs: e.finishedMs, progress: e.progress, points: pointsFor(placement) });
  });
  for (const e of unfinished) {
    out.push({ id: e.id, placement: null, wpm: e.wpm, accuracy: e.accuracy, timeMs: null, progress: e.progress, points: 0 });
  }
  return out;
}
