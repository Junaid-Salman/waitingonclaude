import { describe, expect, test } from "vitest";
import { rankStandings } from "../party/games/type-race/standings";

const p = (id: string, points: number, races: [number, number][]) => ({ id, name: id.toUpperCase(), points, races: races.map(([wpm, accuracy]) => ({ wpm, accuracy })) });

describe("match standings", () => {
  test("points first", () => {
    const s = rankStandings([p("a", 8, [[90, 1]]), p("b", 12, [[40, 0.8]])]);
    expect(s.map((x) => [x.id, x.rank])).toEqual([["b", 1], ["a", 2]]);
  });

  test("equal points: higher average WPM wins", () => {
    const s = rankStandings([p("a", 10, [[40, 1], [60, 1]]), p("b", 10, [[70, 0.9], [50, 0.9]])]);
    expect(s.map((x) => x.id)).toEqual(["b", "a"]);
    expect(s[0].avgWpm).toBe(60);
  });

  test("equal points and WPM: higher average accuracy wins", () => {
    const s = rankStandings([p("a", 10, [[50, 0.9]]), p("b", 10, [[50, 0.97]])]);
    expect(s.map((x) => x.id)).toEqual(["b", "a"]);
  });

  test("a full tie shares a rank and the next rank is one higher (1, 1, 2)", () => {
    const s = rankStandings([p("a", 10, [[50, 1]]), p("b", 10, [[50, 1]]), p("c", 4, [[50, 1]])]);
    expect(s.map((x) => x.rank)).toEqual([1, 1, 2]);
    expect(s.map((x) => x.id)).toEqual(["a", "b", "c"]); // join order breaks the display tie
  });

  test("best WPM is the highest single race", () => {
    expect(rankStandings([p("a", 5, [[40, 1], [95.5, 1], [60, 1]])])[0].bestWpm).toBe(95.5);
  });

  test("a race after leaving counts 0 and 0 in the averages", () => {
    const [row] = rankStandings([p("a", 5, [[80, 1], [0, 0], [0, 0]])]);
    expect(row.avgWpm).toBeCloseTo(80 / 3, 10);
    expect(row.avgAccuracy).toBeCloseTo(1 / 3, 10);
  });

  test("no races gives zero averages, not NaN", () => {
    const [row] = rankStandings([p("a", 0, [])]);
    expect([row.avgWpm, row.avgAccuracy, row.bestWpm]).toEqual([0, 0, 0]);
  });
});
