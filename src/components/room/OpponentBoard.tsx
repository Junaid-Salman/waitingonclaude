import { MAX_GUESSES, WORD_LENGTH, type TileColour } from "../../../shared/protocol";
import { miniTileClassesByColour, miniTileEmptyClasses, solvedBadgeClasses } from "@/lib/colors";
import { formatDuration } from "@/lib/room/clock";

interface Props {
  id: string;
  name: string;
  rows: TileColour[][];
  solvedMs: number | null;
  left: boolean;
}

// Colours only. An opponent's letters are never sent to the browser, so none can be shown.
export function OpponentBoard({ id, name, rows, solvedMs, left }: Props) {
  const status = solvedMs !== null ? `solved in ${formatDuration(solvedMs)}` : `${rows.length} of ${MAX_GUESSES} guesses`;
  return (
    <li
      data-testid="opponent"
      data-id={id}
      aria-label={`${name}: ${status}${left ? ", left the match" : ""}`}
      className={`flex flex-col gap-2 rounded border-2 border-tile-border p-2 ${left ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col items-start gap-1">
        <span className="medium-text-sm max-w-full truncate">{name}</span>
        {left ? (
          <span className="regular-text-xs text-muted">Left</span>
        ) : solvedMs !== null ? (
          <span className={`semibold-text-xs rounded px-2 py-0.5 ${solvedBadgeClasses}`}>Solved {formatDuration(solvedMs)}</span>
        ) : null}
      </div>
      <div aria-hidden="true" className="flex flex-col gap-0.5">
        {Array.from({ length: MAX_GUESSES }, (_, r) => (
          <div key={r} className="flex gap-0.5">
            {Array.from({ length: WORD_LENGTH }, (_, c) => {
              const colour = rows[r]?.[c];
              return <span key={c} data-state={colour ?? "empty"} className={`size-3 rounded-sm ${colour ? miniTileClassesByColour[colour] : miniTileEmptyClasses}`} />;
            })}
          </div>
        ))}
      </div>
    </li>
  );
}
