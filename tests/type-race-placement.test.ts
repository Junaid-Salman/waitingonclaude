import { describe, expect, test } from "vitest";
import { placeRace, pointsFor, type PlacementInput } from "../party/games/type-race/placement";

const e = (id: string, finishedMs: number | null, progress = finishedMs === null ? 0.5 : 1, wpm = 50): PlacementInput => ({ id, finishedMs, progress, wpm, accuracy: 1 });
const summary = (entries: PlacementInput[]) => placeRace(entries).map((r) => [r.id, r.placement, r.points]);

describe("points", () => {
  test("5, 4, 3, 2, 1, then 0; unfinished 0", () => {
    expect([1, 2, 3, 4, 5, 6].map(pointsFor)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(pointsFor(null)).toBe(0);
  });
});

describe("placement", () => {
  test("finishers are ordered by finish time", () => {
    expect(summary([e("a", 30_000), e("b", 20_000), e("c", 25_000)])).toEqual([["b", 1, 5], ["c", 2, 4], ["a", 3, 3]]);
  });

  test("equal finish times share a placement and the next is skipped (1, 1, 3)", () => {
    expect(summary([e("a", 20_000), e("b", 20_000), e("c", 30_000)])).toEqual([["a", 1, 5], ["b", 1, 5], ["c", 3, 3]]);
  });

  test("unfinished players rank below every finisher, by progress then WPM, with 0 points", () => {
    const out = summary([e("slow", null, 0.2, 10), e("late", 59_000), e("far", null, 0.9, 20), e("tie", null, 0.9, 40)]);
    expect(out).toEqual([["late", 1, 5], ["tie", null, 0], ["far", null, 0], ["slow", null, 0]]);
  });

  test("a race nobody finished has no placements", () => {
    expect(summary([e("a", null, 0.3), e("b", null, 0.6)])).toEqual([["b", null, 0], ["a", null, 0]]);
  });

  test("a single player who finishes wins the race", () => {
    expect(summary([e("a", 12_000)])).toEqual([["a", 1, 5]]);
  });

  test("finishers carry their time; the unfinished have null", () => {
    const [a, b] = placeRace([e("a", 12_345), e("b", null)]);
    expect(a.timeMs).toBe(12_345);
    expect(b.timeMs).toBeNull();
  });
});
