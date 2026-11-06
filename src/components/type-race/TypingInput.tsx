"use client";

import { useEffect, useRef } from "react";
import { focusClasses, inputClasses, invalidInputClasses } from "@/lib/colors";
import type { EngineAction } from "@/lib/type-race/engine";
import { capsLockOn, inputAction } from "@/lib/type-race/input";

interface Props {
  // Only the current word is shown (spec 5.3).
  typed: string;
  invalid: boolean;
  // Locked during the countdown and after the run.
  locked: boolean;
  onAction(action: EngineAction): void;
  onCapsLock(on: boolean): void;
}

// Keys a text field, dialog or other control needs for itself: typing there must not steal focus.
const OWN_KEYS = "input, textarea, select, [contenteditable]";

// A single-line input that only echoes the engine. Every `beforeinput` is cancelled and mapped to an
// engine action, so paste, drop, autocorrect and multi-character inserts never reach the engine
// (spec 4). React's onBeforeInput is a keypress polyfill without `inputType`, so the native event
// is used.
export function TypingInput({ typed, invalid, locked, onAction, onCapsLock }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onBeforeInput = (event: InputEvent) => {
      event.preventDefault();
      const action = inputAction(event.inputType, event.data);
      if (action) onAction(action);
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, [onAction]);

  // Focus at zero, and win focus back when the player returns to the window (Tab away, another app).
  // A printable key typed while focus is elsewhere moves focus here and is not typed (spec 8.4, Q36).
  useEffect(() => {
    const el = ref.current;
    if (!el || locked) return;
    el.focus({ preventScroll: true });
    const refocus = () => {
      if (document.visibilityState === "visible" && document.activeElement !== el) el.focus({ preventScroll: true });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement === el || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as Element | null)?.closest?.(OWN_KEYS) || document.querySelector("dialog[open]")) return;
      // Cancelling the keydown stops the character from landing in the input that is about to get focus.
      event.preventDefault();
      el.focus({ preventScroll: true });
    };
    window.addEventListener("focus", refocus);
    document.addEventListener("visibilitychange", refocus);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("focus", refocus);
      document.removeEventListener("visibilitychange", refocus);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [locked]);

  return (
    <input
      ref={ref}
      type="text"
      value={typed}
      // Controlled by the engine; the native edit is always cancelled, so this never fires.
      onChange={() => {}}
      disabled={locked}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      aria-label="Type the passage here"
      aria-invalid={invalid}
      data-testid="typing-input"
      onPaste={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
      onKeyDown={(event) => onCapsLock(capsLockOn(event.nativeEvent))}
      onKeyUp={(event) => onCapsLock(capsLockOn(event.nativeEvent))}
      className={`regular-text-xl w-full rounded-xl border-2 px-3.5 py-2.5 disabled:opacity-50 ${invalid ? `${invalidInputClasses} underline decoration-wavy decoration-invalid underline-offset-4` : inputClasses} ${focusClasses}`}
    />
  );
}
