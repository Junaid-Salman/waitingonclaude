import { describe, expect, test } from "vitest";
import { games, getGame } from "../party/games";

describe("game registry", () => {
  test("registers Woordle and Type Race", () => {
    expect(Object.keys(games)).toEqual(["woordle", "type-race"]);
    expect(getGame("type-race")?.id).toBe("type-race");
    expect(getGame("woordle")?.id).toBe("woordle");
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
