import { describe, expect, test } from "vitest";
import { games, getGame } from "../party/games";

describe("game registry", () => {
  test("is empty until Phase 3 registers Woordle", () => {
    expect(Object.keys(games)).toEqual([]);
  });

  test("an unknown id is undefined", () => {
    expect(getGame("nope")).toBeUndefined();
  });

  test("inherited object keys are not games", () => {
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(getGame(key), key).toBeUndefined();
    }
  });
});
