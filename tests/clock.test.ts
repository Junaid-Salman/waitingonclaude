import { describe, expect, test } from "vitest";
import { formatCountdown, formatDuration, offsetFrom, remainingMs, toServerTime } from "../src/lib/room/clock";

describe("client clock", () => {
  test("the offset is server time minus client time", () => {
    expect(offsetFrom(10_500, 10_000)).toBe(500);
    expect(offsetFrom(9_000, 10_000)).toBe(-1000);
  });

  test("a client clock that runs behind is corrected by the offset", () => {
    const offset = offsetFrom(1_000_000, 400_000); // client is 600 s behind
    expect(toServerTime(450_000, offset)).toBe(1_050_000);
    expect(remainingMs(1_180_000, 450_000, offset)).toBe(130_000);
  });

  test("a client clock that runs ahead is corrected too", () => {
    const offset = offsetFrom(1_000_000, 1_700_000);
    expect(remainingMs(1_060_000, 1_730_000, offset)).toBe(30_000);
  });

  test("remaining time never goes negative", () => {
    expect(remainingMs(1000, 5000, 0)).toBe(0);
  });

  test.each([
    [180_000, "3:00"],
    [59_001, "1:00"],
    [59_000, "0:59"],
    [1, "0:01"],
    [0, "0:00"],
    [-5000, "0:00"],
    [125_000, "2:05"],
  ])("a countdown of %d ms reads %s (rounded up)", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });

  test.each([
    [0, "0:00"],
    [999, "0:00"],
    [42_900, "0:42"],
    [60_000, "1:00"],
    [185_999, "3:05"],
  ])("a duration of %d ms reads %s (rounded down)", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
