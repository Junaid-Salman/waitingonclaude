"use client";

import { useEffect } from "react";

interface Handlers {
  enabled?: boolean;
  onLetter(letter: string): void;
  onEnter(): void;
  onBackspace(): void;
}

export type KeyAction = { kind: "enter" } | { kind: "backspace" } | { kind: "letter"; letter: string } | null;

type KeyLike = Pick<KeyboardEvent, "key" | "repeat" | "ctrlKey" | "metaKey" | "altKey">;

// Pure, so the key rules are unit-tested without a DOM.
export function keyAction(event: KeyLike): KeyAction {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  // A held Enter repeats about 30 times a second; each would be a refused submit and a shake.
  // Backspace keeps repeating, which is useful.
  if (event.key === "Enter") return event.repeat ? null : { kind: "enter" };
  if (event.key === "Backspace") return { kind: "backspace" };
  if (/^[a-zA-Z]$/.test(event.key)) return { kind: "letter", letter: event.key.toLowerCase() };
  return null;
}

// Which element a key press belongs to (M1, N1):
// - the page itself and the on-screen keys: the board (Enter there must not also click the key);
// - a text field or a dialog: every key stays there;
// - a focused link or button: only Enter stays there (it follows the link or presses the button),
//   so after closing a dialog, focus back on Leave room, letters still reach the board.
type KeyTarget = { closest(selector: string): unknown } | null;
const TEXT_ENTRY = "input, textarea, select, [contenteditable], dialog";
const ACTS_ON_ENTER = "a, button, summary, [role=button]";
export function ownsKey(target: KeyTarget, key: string): boolean {
  if (!target || typeof target.closest !== "function") return true;
  if (target.closest("[data-board-keyboard]")) return true;
  if (target.closest(TEXT_ENTRY)) return false;
  return key !== "Enter" || !target.closest(ACTS_ON_ENTER);
}

// Physical keyboard for the board: letters, Enter and Backspace. Shared by solo and match play.
export function useKeyboardInput({ enabled = true, onLetter, onEnter, onBackspace }: Handlers) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      // A modal (Leave the match?) owns the page while it is open, wherever focus sits inside it (N2).
      if (document.querySelector("dialog[open]")) return;
      if (!ownsKey(event.target as Element | null, event.key)) return;
      // Stops Enter from also clicking whichever on-screen key has focus, repeat or not.
      if (event.key === "Enter" && !(event.ctrlKey || event.metaKey || event.altKey)) event.preventDefault();
      const action = keyAction(event);
      if (action?.kind === "enter") onEnter();
      else if (action?.kind === "backspace") onBackspace();
      else if (action?.kind === "letter") onLetter(action.letter);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onLetter, onEnter, onBackspace]);
}
