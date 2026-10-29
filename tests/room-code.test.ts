import { describe, expect, test } from "vitest";
import {
  generateRoomCode,
  isRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "../shared/room-code";

describe("room codes", () => {
  test("the alphabet has 23 letters and no I, L or O", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(23);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(23);
    for (const banned of "ILO") expect(ROOM_CODE_ALPHABET).not.toContain(banned);
  });

  test("every generated code is valid", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isRoomCode(code), code).toBe(true);
    }
  });

  test("the injected rng is honoured", () => {
    expect(generateRoomCode(() => 0)).toBe("AAAA");
    expect(generateRoomCode(() => 0.999999)).toBe("ZZZZ");
  });

  test.each(["abcd", "ABC", "ABCDE", "ABCI", "ABCL", "ABCO", "AB1D", "", "AB D", "ABC\n"])(
    "rejects %j",
    (value) => {
      expect(isRoomCode(value)).toBe(false);
    },
  );

  test("accepts TEST, which Phase 0 used as a sample code", () => {
    expect(isRoomCode("TEST")).toBe(true);
  });
});
