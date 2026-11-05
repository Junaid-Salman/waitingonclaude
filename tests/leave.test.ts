import { describe, expect, test } from "vitest";
import { isPlainClick, needsLeaveConfirm } from "../src/lib/room/leave";

// Owner decision Q13: ask before leaving only while a round is being played or revealed.
describe("leaving asks first only mid-match", () => {
  test.each([
    ["joined", "lobby", "idle", false],
    ["joined", "match", "playing", true],
    ["joined", "match", "reveal", true],
    ["joined", "match", "idle", true], // rejoining: the round is still running
    ["joined", "match", "finished", false], // final results: nothing left to lose
    ["connecting", "match", "playing", false],
    ["error", "match", "playing", false],
  ] as const)("status %s, phase %s, stage %s -> %s", (status, phase, stage, expected) => {
    expect(needsLeaveConfirm({ status, phase, stage })).toBe(expected);
  });
});

// The room-header logo only turns into "leave" on a plain click; a modified click (new tab, new
// window) is left to the browser, so the seat is not lost by opening home elsewhere (N3).
describe("a plain click on the logo", () => {
  const click = (o: Partial<{ button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o,
  });
  test("a plain left click is plain", () => expect(isPlainClick(click())).toBe(true));
  test.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)("%s held is not", (k) => expect(isPlainClick(click({ [k]: true }))).toBe(false));
  test("another button is not", () => expect(isPlainClick(click({ button: 1 }))).toBe(false));
});
