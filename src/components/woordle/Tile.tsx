import type { TileColour } from "../../../shared/protocol";
import { tileClassesByColour, tileClassesUnscored } from "@/lib/colors";

const labels: Record<TileColour, string> = { green: "correct", yellow: "in the word, wrong place", grey: "not in the word" };

export function Tile({ letter, colour }: { letter: string; colour?: TileColour }) {
  const label = letter ? `${letter.toUpperCase()}, ${colour ? labels[colour] : "not yet guessed"}` : "empty";
  return (
    <div
      role="img"
      aria-label={label}
      data-state={colour ?? (letter ? "typed" : "empty")}
      className={`flex aspect-square items-center justify-center rounded border-2 bold-display-xs uppercase sm:bold-display-sm ${
        colour ? tileClassesByColour[colour] : letter ? tileClassesUnscored.typed : tileClassesUnscored.empty
      }`}
    >
      {letter}
    </div>
  );
}
