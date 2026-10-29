import { describe, expect, test } from "vitest";
import { cleanName, uniqueName } from "../party/room/names";

describe("cleanName", () => {
  test("trims and collapses whitespace", () => {
    expect(cleanName("  Ali \t  Khan\n")).toBe("Ali Khan");
  });

  test("strips control and invisible characters", () => {
    expect(cleanName("A\u0000l​i‮")).toBe("Ali");
  });

  test("caps at 20 characters", () => {
    expect(cleanName("a".repeat(50))).toBe("a".repeat(20));
  });

  test("does not split a surrogate pair at the cap", () => {
    const name = cleanName("😀".repeat(30));
    expect(Array.from(name ?? "")).toHaveLength(20);
    expect(name).toBe("😀".repeat(20));
  });

  test.each(["", "   ", "!!!", "​​", "---"])("rejects %j", (raw) => {
    expect(cleanName(raw)).toBeNull();
  });

  test("accepts an emoji-only name", () => {
    expect(cleanName("😀")).toBe("😀");
  });

  test("keeps letters from any script and digits", () => {
    expect(cleanName("علی")).toBe("علی");
    expect(cleanName("007")).toBe("007");
  });
});

describe("uniqueName", () => {
  test("a free name is unchanged", () => {
    expect(uniqueName(["Bo"], "Ali")).toBe("Ali");
  });

  test("suffixes in join order", () => {
    const names: string[] = [];
    for (let i = 0; i < 3; i++) names.push(uniqueName(names, "Ali"));
    expect(names).toEqual(["Ali", "Ali 2", "Ali 3"]);
  });

  test("matches ignoring case", () => {
    expect(uniqueName(["ali"], "ALI")).toBe("ALI 2");
  });

  test("skips a suffix another player already holds", () => {
    expect(uniqueName(["Ali", "Ali 2"], "Ali")).toBe("Ali 3");
    expect(uniqueName(["Ali 2"], "Ali 2")).toBe("Ali 2 2");
  });
});
