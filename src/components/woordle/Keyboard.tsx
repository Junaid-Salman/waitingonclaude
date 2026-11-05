"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { keyClassesByColour, keyClassesIdle } from "@/lib/colors";
import { ROW_REVEAL_MS } from "@/lib/motion/timing";
import type { KeyColours } from "@/lib/woordle/keyboard";

// The keys change colour when the row's flip has landed, not before it starts, so the board tells
// the story first. With reduced motion there is no flip and no wait.
function useRevealedColours(colours: KeyColours): KeyColours {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(colours);
  useEffect(() => {
    if (reduce) return;
    const timer = setTimeout(() => setShown(colours), ROW_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [colours, reduce]);
  return reduce ? colours : shown;
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

interface Props {
  colours: KeyColours;
  onLetter(letter: string): void;
  onEnter(): void;
  onBackspace(): void;
  // While the room connection is down nothing could be sent, so the keys say so.
  disabled?: boolean;
}

export function Keyboard({ colours: latest, onLetter, onEnter, onBackspace, disabled = false }: Props) {
  const colours = useRevealedColours(latest);
  // At least 44 px tall (Apple's touch target); touch-manipulation stops double-tap zoom on iOS.
  const base = "h-12 min-h-11 min-w-0 rounded uppercase select-none touch-manipulation disabled:opacity-60";
  return (
    <div role="group" aria-label="Keyboard" className="mx-auto flex w-full max-w-lg flex-col gap-1.5">
      {ROWS.map((row, i) => (
        <div key={row} className="flex justify-center gap-1">
          {i === 2 && (
            <button type="button" className={`${base} ${keyClassesIdle} semibold-text-xs flex-[1.5] px-1`} disabled={disabled} onClick={onEnter}>
              Enter
            </button>
          )}
          {[...row].map((letter) => {
            const colour = colours[letter];
            return (
              <button
                key={letter}
                type="button"
                data-key={letter}
                data-colour={colour ?? "none"}
                aria-label={colour ? `${letter}, ${colour === "green" ? "correct" : colour === "yellow" ? "in the word" : "not in the word"}` : letter}
                className={`${base} semibold-text-md flex-1 ${colour ? keyClassesByColour[colour] : keyClassesIdle}`}
                disabled={disabled}
                onClick={() => onLetter(letter)}
              >
                {letter}
              </button>
            );
          })}
          {i === 2 && (
            <button type="button" className={`${base} ${keyClassesIdle} semibold-text-xs flex-[1.5] px-1`} aria-label="Backspace" disabled={disabled} onClick={onBackspace}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
