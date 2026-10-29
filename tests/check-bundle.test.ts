import { describe, expect, test } from "vitest";
import { findLeaks, runsFor } from "../scripts/check-bundle.mjs";

const lists = { answers: ["aback", "abate", "abbey", "abbot", "abhor", "abide", "abler"] };

describe("findLeaks", () => {
  test("detects a planted JSON-array run", () => {
    expect(findLeaks('var a=["abbey","abbot","abhor"];', lists)).not.toEqual([]);
  });

  test("detects a bare comma-joined run", () => {
    expect(findLeaks("x=`abhor,abide,abler`", lists)).not.toEqual([]);
  });

  test("detects the whole list embedded in a JSON.parse string", () => {
    expect(findLeaks(`JSON.parse('${JSON.stringify(lists.answers)}')`, lists)).not.toEqual([]);
  });

  test("ignores ordinary words in minified code", () => {
    expect(findLeaks('const about="aback";function abide(){return "abate"}', lists)).toEqual([]);
  });

  test("checks the first, middle and last runs", () => {
    expect(runsFor(lists.answers)).toEqual([
      ["aback", "abate", "abbey"],
      ["abbey", "abbot", "abhor"],
      ["abhor", "abide", "abler"],
    ]);
  });

  test("a leak of a chunk covering a sampled run is caught, a stray three-word fragment elsewhere is not", () => {
    // Documented limit: this is a leak detector for the lists as shipped, not a per-word scanner.
    expect(findLeaks('["abate","abbey"]', lists)).toEqual([]);
  });
});
