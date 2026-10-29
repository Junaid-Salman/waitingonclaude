import { describe, expect, test } from "vitest";
import { pickAnswer } from "../party/games/woordle/pick";

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
