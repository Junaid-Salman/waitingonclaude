import type { KeyColours } from "@/lib/woordle/keyboard";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

const keyStyles = {
  green: "bg-tile-correct text-white",
  yellow: "bg-tile-present text-stone-900",
  grey: "bg-key-absent text-key-absent-fg",
};

interface Props {
  colours: KeyColours;
  onLetter(letter: string): void;
  onEnter(): void;
  onBackspace(): void;
}

export function Keyboard({ colours, onLetter, onEnter, onBackspace }: Props) {
  const base = "h-12 rounded font-semibold uppercase select-none";
  return (
    <div role="group" aria-label="Keyboard" className="mx-auto flex w-full max-w-lg flex-col gap-1.5">
      {ROWS.map((row, i) => (
        <div key={row} className="flex justify-center gap-1">
          {i === 2 && (
            <button type="button" className={`${base} bg-key-idle flex-[1.5] px-1 text-xs`} onClick={onEnter}>
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
                className={`${base} flex-1 ${colour ? keyStyles[colour] : "bg-key-idle"}`}
                onClick={() => onLetter(letter)}
              >
                {letter}
              </button>
            );
          })}
          {i === 2 && (
            <button type="button" className={`${base} bg-key-idle flex-[1.5] px-1 text-xs`} aria-label="Backspace" onClick={onBackspace}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
