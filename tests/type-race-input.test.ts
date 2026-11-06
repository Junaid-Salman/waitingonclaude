import { describe, expect, test } from "vitest";
import { capsLockOn, inputAction } from "../src/lib/type-race/input";

describe("inputAction", () => {
  test("a single typed character is a keystroke", () => {
    expect(inputAction("insertText", "a")).toEqual({ type: "char", char: "a" });
    expect(inputAction("insertText", " ")).toEqual({ type: "char", char: " " });
  });

  test("Backspace deletes one character", () => {
    expect(inputAction("deleteContentBackward", null)).toEqual({ type: "backspace" });
  });

  test("Ctrl+Backspace and line deletes clear the current word only", () => {
    expect(inputAction("deleteWordBackward", null)).toEqual({ type: "clearWord" });
    expect(inputAction("deleteSoftLineBackward", null)).toEqual({ type: "clearWord" });
  });

  test.each([
    ["insertFromPaste", "pasted text"],
    ["insertFromDrop", "dropped"],
    ["insertReplacementText", "autocorrected"],
    ["insertCompositionText", "x"],
    ["insertFromYank", "x"],
    ["insertLineBreak", null],
    ["deleteContentForward", null],
    ["historyUndo", null],
  ])("%s is blocked", (type, data) => {
    expect(inputAction(type, data)).toBeNull();
  });

  test("a multi-character or empty insertText is blocked (autocomplete in disguise)", () => {
    expect(inputAction("insertText", "the ")).toBeNull();
    expect(inputAction("insertText", "")).toBeNull();
    expect(inputAction("insertText", null)).toBeNull();
    expect(inputAction("insertText", undefined)).toBeNull();
  });
});

describe("capsLockOn", () => {
  test("reads the modifier state", () => {
    expect(capsLockOn({ getModifierState: (k) => k === "CapsLock" })).toBe(true);
    expect(capsLockOn({ getModifierState: () => false })).toBe(false);
  });

  test("an event without the method is not caps lock", () => {
    expect(capsLockOn({})).toBe(false);
  });
});
