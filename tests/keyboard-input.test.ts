import { describe, expect, test } from "vitest";
import { keyAction, ownsKey } from "../src/lib/woordle/use-keyboard-input";

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

// A stand-in for an event target: `matches` lists the selectors its closest() would find.
const target = (...matches: string[]) => ({
  closest: (selector: string) => (selector.split(",").some((s) => matches.includes(s.trim())) ? {} : null),
});

describe("who owns a key press (M1, N1)", () => {
  test("the page itself: the board takes every key", () => {
    for (const key of ["Enter", "c", "Backspace"]) {
      expect(ownsKey(target(), key)).toBe(true);
      expect(ownsKey(null, key)).toBe(true);
    }
  });

  test("an on-screen key: the board takes it, so Enter never also clicks the key", () => {
    expect(ownsKey(target("[data-board-keyboard]", "button"), "Enter")).toBe(true);
  });

  test.each(["a", "button", "summary", "[role=button]"])("a focused %s keeps Enter, but letters and Backspace still reach the board", (sel) => {
    expect(ownsKey(target(sel), "Enter")).toBe(false);
    expect(ownsKey(target(sel), "c")).toBe(true);
    expect(ownsKey(target(sel), "Backspace")).toBe(true);
  });

  test.each(["input", "textarea", "select", "[contenteditable]", "dialog"])("typing in a %s keeps every key", (sel) => {
    for (const key of ["Enter", "c", "Backspace"]) expect(ownsKey(target(sel), key)).toBe(false);
  });
});
