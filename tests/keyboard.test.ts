import { describe, expect, test } from "vitest";
import { mergeKeyColours } from "../src/lib/woordle/keyboard";

describe("mergeKeyColours", () => {
  test("records a colour for each letter", () => {
    expect(mergeKeyColours({}, "crane", ["green", "yellow", "grey", "grey", "grey"])).toEqual({
      c: "green",
      r: "yellow",
      a: "grey",
      n: "grey",
      e: "grey",
    });
  });

  test("yellow upgrades to green", () => {
    expect(mergeKeyColours({ r: "yellow" }, "robot", ["green", "grey", "grey", "grey", "grey"]).r).toBe("green");
  });

  test("green is never downgraded", () => {
    expect(mergeKeyColours({ c: "green" }, "crane", ["grey", "grey", "grey", "grey", "grey"]).c).toBe("green");
    expect(mergeKeyColours({ c: "green" }, "crane", ["yellow", "grey", "grey", "grey", "grey"]).c).toBe("green");
  });

  test("grey never overrides yellow", () => {
    expect(mergeKeyColours({ a: "yellow" }, "crane", ["grey", "grey", "grey", "grey", "grey"]).a).toBe("yellow");
  });

  test("a repeated letter keeps its best colour within one word", () => {
    expect(mergeKeyColours({}, "eerie", ["yellow", "grey", "yellow", "grey", "green"]).e).toBe("green");
  });
});
