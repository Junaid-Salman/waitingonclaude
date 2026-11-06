import { describe, expect, test } from "vitest";
import { bucketOf, normalisePassage, passageProblem } from "../shared/type-race/passage";
import { PASSAGE_LENGTHS } from "../shared/type-race-protocol";
import { passageById, passages, passagesByLength, pickPassage, pickPassageIds } from "../party/games/type-race/passages";

describe("the passage pool", () => {
  test.each(passages.map((p) => [p.id, p] as const))("%s is clean, normalised and in its bucket", (_id, p) => {
    expect(normalisePassage(p.text)).toBe(p.text);
    expect(passageProblem(p.text)).toBeNull();
    expect(bucketOf(p.text.length)).toBe(p.length);
  });

  test("ids are unique and shaped like s-001", () => {
    const ids = passages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[sml]-\d{3}$/);
  });

  test("every bucket has at least 7 passages (a 7-race match never repeats one)", () => {
    for (const length of PASSAGE_LENGTHS) expect(passagesByLength(length).length).toBeGreaterThanOrEqual(7);
  });

  test("texts are unique", () => {
    expect(new Set(passages.map((p) => p.text)).size).toBe(passages.length);
  });
});

describe("loader", () => {
  test("passageById finds an entry and nothing else", () => {
    const first = passages[0];
    expect(passageById(first.id)).toEqual(first);
    expect(passageById("nope")).toBeUndefined();
  });

  test("pickPassageIds returns distinct ids of one length", () => {
    const ids = pickPassageIds("short", 7);
    expect(new Set(ids).size).toBe(7);
    for (const id of ids) expect(passageById(id)?.length).toBe("short");
  });

  test("pickPassageIds throws when the bucket is too small", () => {
    expect(() => pickPassageIds("long", 500)).toThrow();
  });

  test("pickPassage skips excluded ids", () => {
    const all = passagesByLength("medium");
    const exclude = new Set(all.slice(1).map((p) => p.id));
    for (let i = 0; i < 5; i++) expect(pickPassage("medium", exclude).id).toBe(all[0].id);
  });

  test("pickPassage ignores an exclude list that covers the whole bucket", () => {
    const exclude = new Set(passagesByLength("long").map((p) => p.id));
    expect(pickPassage("long", exclude).length).toBe("long");
  });

  test("the draw is injectable", () => {
    const all = passagesByLength("short");
    expect(pickPassage("short", new Set(), () => 0).id).toBe(all[0].id);
    expect(pickPassage("short", new Set(), () => 0.999999).id).toBe(all[all.length - 1].id);
  });
});
