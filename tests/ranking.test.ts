import { describe, expect, test } from "vitest";
import { rankPlayers, type RankInput } from "../party/games/woordle/ranking";

const p = (id: string, roundsWon: number, totalMs: number): RankInput => ({ id, name: id.toUpperCase(), roundsWon, totalMs });
const ranks = (input: RankInput[]) => rankPlayers(input).map((r) => [r.id, r.rank]);

describe("rankPlayers", () => {
  test("most rounds won ranks first", () => {
    expect(ranks([p("a", 1, 10), p("b", 3, 99999), p("c", 2, 5)])).toEqual([["b", 1], ["c", 2], ["a", 3]]);
  });

  test("equal rounds are decided by the lower total time", () => {
    expect(ranks([p("a", 2, 9000), p("b", 2, 4000)])).toEqual([["b", 1], ["a", 2]]);
  });

  test("players equal on rounds and time share a rank, and the next rank follows (1, 1, 2)", () => {
    expect(ranks([p("a", 3, 1000), p("b", 3, 1000), p("c", 1, 500)])).toEqual([["a", 1], ["b", 1], ["c", 2]]);
  });

  test("a three-way tie is three first places", () => {
    expect(ranks([p("a", 0, 5), p("b", 0, 5), p("c", 0, 5)])).toEqual([["a", 1], ["b", 1], ["c", 1]]);
  });

  test("a tie below first place (1, 2, 2, 3)", () => {
    expect(ranks([p("a", 4, 1), p("b", 2, 7), p("c", 2, 7), p("d", 0, 7)])).toEqual([["a", 1], ["b", 2], ["c", 2], ["d", 3]]);
  });

  test("the same wins but different time are not a tie", () => {
    expect(ranks([p("a", 1, 100), p("b", 1, 101)])).toEqual([["a", 1], ["b", 2]]);
  });

  test("a single player is first", () => {
    expect(ranks([p("a", 0, 900000)])).toEqual([["a", 1]]);
  });

  test("ties keep input (join) order", () => {
    expect(rankPlayers([p("z", 1, 1), p("a", 1, 1)]).map((r) => r.id)).toEqual(["z", "a"]);
  });

  test("fills every field of the entry", () => {
    expect(rankPlayers([p("a", 2, 30)])).toEqual([{ id: "a", name: "A", roundsWon: 2, totalMs: 30, rank: 1 }]);
  });

  test("does not mutate its input", () => {
    const input = [p("a", 0, 5), p("b", 3, 1)];
    rankPlayers(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });

  test("property: ranks are dense, start at 1, never decrease, and match the ordering key", () => {
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 0x1_0000_0000;
    for (let run = 0; run < 300; run++) {
      const input = Array.from({ length: 1 + Math.floor(next() * 5) }, (_, i) =>
        p(`p${i}`, Math.floor(next() * 4), Math.floor(next() * 3) * 1000),
      );
      const out = rankPlayers(input);
      expect(out[0].rank).toBe(1);
      for (let i = 1; i < out.length; i++) {
        const same = out[i].roundsWon === out[i - 1].roundsWon && out[i].totalMs === out[i - 1].totalMs;
        expect(out[i].rank).toBe(same ? out[i - 1].rank : out[i - 1].rank + 1);
        const better = out[i].roundsWon > out[i - 1].roundsWon || (out[i].roundsWon === out[i - 1].roundsWon && out[i].totalMs < out[i - 1].totalMs);
        expect(better).toBe(false);
      }
    }
  });
});
