import { describe, expect, test } from "vitest";
import { findLeaks, passageProbes, runsFor } from "../scripts/check-bundle.mjs";

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

describe("findLeaks: passages", () => {
  const passages = [
    { text: "The kettle clicked off, and the quiet of the kitchen settled over the table." },
    { text: "Rain tapped the window all morning, so we made soup and forgot the clock." },
    { text: 'He said "slow down" and typed each word the way you place a stone in a wall.' },
  ];

  test("the probe is the first 40 characters of the first, middle and last entry", () => {
    expect(passageProbes(passages)).toEqual([
      "The kettle clicked off, and the quiet of",
      "Rain tapped the window all morning, so w",
      'He said "slow down" and typed each word ',
    ]);
  });

  test("detects a passage embedded in a bundle", () => {
    expect(findLeaks(`var t="${passages[0].text}";`, {}, passages)).not.toEqual([]);
    expect(findLeaks(`var t="${passages[1].text}";`, {}, passages)).not.toEqual([]);
  });

  test("detects a passage with escaped quotes", () => {
    expect(findLeaks(`var t=${JSON.stringify(passages[2].text)};`, {}, passages)).not.toEqual([]);
  });

  test("ignores ordinary code and a bundle without passages", () => {
    expect(findLeaks("function kettle(){return 'the quiet'}", {}, passages)).toEqual([]);
    expect(findLeaks(passages[0].text, lists, [])).toEqual([]);
  });
});
