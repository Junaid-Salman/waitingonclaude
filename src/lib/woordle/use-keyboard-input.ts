"use client";

import { useEffect } from "react";

interface Handlers {
  enabled?: boolean;
  onLetter(letter: string): void;
  onEnter(): void;
  onBackspace(): void;
}

// Physical keyboard for the board: letters, Enter and Backspace. Shared by solo and match play.
export function useKeyboardInput({ enabled = true, onLetter, onEnter, onBackspace }: Handlers) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Enter") {
        // Stops Enter from also clicking whichever on-screen key has focus.
        event.preventDefault();
        onEnter();
      } else if (event.key === "Backspace") {
        onBackspace();
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        onLetter(event.key.toLowerCase());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onLetter, onEnter, onBackspace]);
}
