import { describe, expect, test } from "vitest";
import { keyAction } from "../src/lib/woordle/use-keyboard-input";

const key = (k: string, extra: Partial<{ repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

describe("physical keyboard", () => {
  test("letters type in lowercase; Enter and Backspace act", () => {
    expect(keyAction(key("C"))).toEqual({ kind: "letter", letter: "c" });
    expect(keyAction(key("Enter"))).toEqual({ kind: "enter" });
    expect(keyAction(key("Backspace"))).toEqual({ kind: "backspace" });
  });

  test("a held Enter submits once: repeats are ignored", () => {
    expect(keyAction(key("Enter", { repeat: true }))).toBeNull();
  });

  test("a held Backspace keeps deleting", () => {
    expect(keyAction(key("Backspace", { repeat: true }))).toEqual({ kind: "backspace" });
  });

  test("shortcuts and other keys do nothing", () => {
    expect(keyAction(key("r", { ctrlKey: true }))).toBeNull();
    expect(keyAction(key("Enter", { metaKey: true }))).toBeNull();
    expect(keyAction(key("1"))).toBeNull();
    expect(keyAction(key("Tab"))).toBeNull();
  });
});
