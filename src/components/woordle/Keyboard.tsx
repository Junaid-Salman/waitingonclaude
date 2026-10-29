import { keyClassesByColour, keyClassesIdle } from "@/lib/colors";
import type { KeyColours } from "@/lib/woordle/keyboard";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

interface Props {
  colours: KeyColours;
  onLetter(letter: string): void;
  onEnter(): void;
  onBackspace(): void;
}

export function Keyboard({ colours, onLetter, onEnter, onBackspace }: Props) {
  const base = "h-12 rounded uppercase select-none";
  return (
    <div role="group" aria-label="Keyboard" className="mx-auto flex w-full max-w-lg flex-col gap-1.5">
      {ROWS.map((row, i) => (
        <div key={row} className="flex justify-center gap-1">
          {i === 2 && (
            <button type="button" className={`${base} ${keyClassesIdle} semibold-text-xs flex-[1.5] px-1`} onClick={onEnter}>
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
                onClick={() => onLetter(letter)}
              >
                {letter}
              </button>
            );
          })}
          {i === 2 && (
            <button type="button" className={`${base} ${keyClassesIdle} semibold-text-xs flex-[1.5] px-1`} aria-label="Backspace" onClick={onBackspace}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
