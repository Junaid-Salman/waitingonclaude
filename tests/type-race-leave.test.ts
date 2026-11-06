import { describe, expect, test } from "vitest";
import { needsRaceLeaveConfirm } from "../src/lib/type-race/leave";

describe("needsRaceLeaveConfirm", () => {
  test.each(["countdown", "racing", "results", "idle"] as const)("asks first while the match runs (%s)", (stage) => {
    expect(needsRaceLeaveConfirm({ status: "joined", phase: "match", stage })).toBe(true);
  });

  test("leaves at once on the final results", () => {
    expect(needsRaceLeaveConfirm({ status: "joined", phase: "match", stage: "finished" })).toBe(false);
  });

  test("leaves at once in the lobby, and when not joined", () => {
    expect(needsRaceLeaveConfirm({ status: "joined", phase: "lobby", stage: "idle" })).toBe(false);
    expect(needsRaceLeaveConfirm({ status: "connecting", phase: "match", stage: "racing" })).toBe(false);
    expect(needsRaceLeaveConfirm({ status: "error", phase: "match", stage: "racing" })).toBe(false);
  });
});
