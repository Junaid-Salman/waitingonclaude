import type { TileColour } from "../../../shared/protocol";
import { tileClassesByColour } from "@/lib/colors";

// A row of static, coloured letter tiles (the revealed answer, the How to play example). Screen
// readers get `label` as one sentence instead of the letters one by one (L1).
export function LetterTiles({ letters, colours, label, testId }: { letters: string; colours?: TileColour[]; label: string; testId?: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" data-testid={testId} className="flex gap-1.5">
        {[...letters].map((letter, i) => (
          <span
            key={i}
            className={`extrabold-display-xs flex size-11 items-center justify-center rounded-lg border-[2.5px] font-display uppercase ${tileClassesByColour[colours?.[i] ?? "green"]}`}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}
