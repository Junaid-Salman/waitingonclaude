import { describe, expect, test } from "vitest";
import { parseJoinInput } from "../src/lib/room/join-code";

describe("join by code", () => {
  test.each([
    ["KQXF", "KQXF"],
    ["kqxf", "KQXF"],
    ["  K Q X F ", "KQXF"],
    ["https://waitingonclaude.vercel.app/woordle/room/KQXF", "KQXF"],
    ["http://localhost:3000/woordle/room/kqxf/", "KQXF"],
    ["/woordle/room/ABCD?x=1", "ABCD"],
  ])("%s opens room %s", (input, code) => {
    expect(parseJoinInput(input)).toEqual({ ok: true, code, href: `/woordle/room/${code}` });
  });

  test("an empty box is empty, not invalid", () => {
    expect(parseJoinInput("   ")).toEqual({ ok: false, reason: "empty" });
  });

  test.each(["KQX", "KQXFF", "KQ7F", "KQIF", "KQOF", "KQLF", "https://example.com/woordle/room/KQ", "room KQXF please"])("%s is not a room code", (input) => {
    expect(parseJoinInput(input)).toEqual({ ok: false, reason: "invalid" });
  });
});
