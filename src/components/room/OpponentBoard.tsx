import { MAX_GUESSES, WORD_LENGTH, type TileColour } from "../../../shared/protocol";
import { miniTileClassesByColour, miniTileEmptyClasses, solvedBadgeClasses } from "@/lib/colors";
import { formatDuration } from "@/lib/room/clock";

interface Props {
  id: string;
  name: string;
  rows: TileColour[][];
  solvedMs: number | null;
  left: boolean;
  // Dropped, but the seat is held for the reconnect grace.
  away: boolean;
}

// Colours only. An opponent's letters are never sent to the browser, so none can be shown.
export function OpponentBoard({ id, name, rows, solvedMs, left, away }: Props) {
  const status = solvedMs !== null ? `solved in ${formatDuration(solvedMs)}` : `${rows.length} of ${MAX_GUESSES} guesses`;
  return (
    <li
      data-testid="opponent"
      data-id={id}
      aria-label={`${name}: ${status}${left ? ", left the match" : away ? ", reconnecting" : ""}`}
      className="flex min-w-0 flex-col gap-2 rounded-[14px] border-2 border-foreground bg-surface p-3"
    >
      <span className="bold-text-sm max-w-full truncate">{name}</span>
      {/* Away or left: only the colours dim; the name and status keep full contrast (M4). */}
      <div aria-hidden="true" className={`flex flex-col gap-[3px] ${left || away ? "opacity-60" : ""}`}>
        {Array.from({ length: MAX_GUESSES }, (_, r) => (
          <div key={r} className="flex gap-[3px]">
            {Array.from({ length: WORD_LENGTH }, (_, c) => {
              const colour = rows[r]?.[c];
              return <span key={c} data-state={colour ?? "empty"} className={`size-3 rounded-[3px] ${colour ? miniTileClassesByColour[colour] : miniTileEmptyClasses}`} />;
            })}
          </div>
        ))}
      </div>
      {/* Nothing while playing: the card then holds the name and the colours only. */}
      {left ? (
        <span className="regular-text-xs text-muted">Left</span>
      ) : away ? (
        <span className="regular-text-xs text-muted">Reconnecting…</span>
      ) : solvedMs !== null ? (
        <span className={`bold-text-xs self-start rounded-full px-2 py-0.5 ${solvedBadgeClasses}`}>Solved {formatDuration(solvedMs)}</span>
      ) : null}
    </li>
  );
}
