import type { TileColour } from "../../../shared/protocol";

const styles: Record<TileColour, string> = {
  green: "bg-tile-correct border-tile-correct text-white",
  yellow: "bg-tile-present border-tile-present text-stone-900",
  grey: "bg-tile-absent border-tile-absent text-white",
};

const labels: Record<TileColour, string> = { green: "correct", yellow: "in the word, wrong place", grey: "not in the word" };

export function Tile({ letter, colour }: { letter: string; colour?: TileColour }) {
  const label = letter ? `${letter.toUpperCase()}, ${colour ? labels[colour] : "not yet guessed"}` : "empty";
  return (
    <div
      role="img"
      aria-label={label}
      data-state={colour ?? (letter ? "typed" : "empty")}
      className={`flex aspect-square items-center justify-center rounded border-2 text-2xl font-bold uppercase sm:text-3xl ${
        colour ? styles[colour] : letter ? "border-tile-border" : "border-tile-border/40"
      }`}
    >
      {letter}
    </div>
  );
}
