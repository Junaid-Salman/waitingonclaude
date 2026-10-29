import { describe, expect, test } from "vitest";
import { pickAnswer, pickDistinct } from "../party/games/woordle/pick";

describe("pickAnswer", () => {
  const list = ["aaaaa", "bbbbb", "ccccc"];

  test("never repeats until the list is exhausted, then resets", () => {
    const used = new Set<string>();
    const seen = [pickAnswer(list, used, () => 0), pickAnswer(list, used, () => 0), pickAnswer(list, used, () => 0)];
    expect(new Set(seen).size).toBe(3);
    expect(pickAnswer(list, used, () => 0)).toBe("aaaaa");
    expect(used.size).toBe(1);
  });

  test("honours the injected rng", () => {
    expect(pickAnswer(list, new Set(), () => 0.99)).toBe("ccccc");
    expect(pickAnswer(list, new Set(), () => 0)).toBe("aaaaa");
  });
});

describe("pickDistinct", () => {
  const list = ["aaaaa", "bbbbb", "ccccc", "ddddd", "eeeee", "fffff"];

  test("returns the requested number of different words from the list", () => {
    for (let run = 0; run < 50; run++) {
      const picked = pickDistinct(list, 5);
      expect(picked).toHaveLength(5);
      expect(new Set(picked).size).toBe(5);
      for (const word of picked) expect(list).toContain(word);
    }
  });

  test("the injected rng decides the draw", () => {
    expect(pickDistinct(list, 3, () => 0)).toEqual(["aaaaa", "bbbbb", "ccccc"]);
    // i=0 swaps index 0 with 5, then i=1 swaps index 1 with the (new) last: f, a.
    expect(pickDistinct(list, 2, () => 0.999)).toEqual(["fffff", "aaaaa"]);
  });

  test("does not mutate the source list", () => {
    const copy = [...list];
    pickDistinct(list, 4);
    expect(list).toEqual(copy);
  });

  test("asking for more than exist is an error", () => {
    expect(() => pickDistinct(list, 7)).toThrow();
  });

  test("covers the whole list over many draws", () => {
    const seen = new Set<string>();
    for (let run = 0; run < 200; run++) pickDistinct(list, 2).forEach((w) => seen.add(w));
    expect(seen.size).toBe(list.length);
  });
});
