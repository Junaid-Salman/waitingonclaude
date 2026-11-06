import type { RosterPlayer } from "../../../shared/protocol";
import type { RaceProgressEntry } from "../../../shared/type-race-protocol";
import { cardClasses, youBadgeClasses } from "@/lib/colors";

interface Props {
  roster: RosterPlayer[];
  progress: Record<string, RaceProgressEntry>;
  youId: string | null;
  // Share of the passage you have locked in, 0 to 1. Your own lane uses the local engine so it moves
  // as you type; the others come from the server.
  ownShare: number;
  ownWpm: number;
  // Characters in the first `words` words / total characters, for the other lanes.
  shareOf(words: number): number;
  away: ReadonlySet<string>;
}

// One lane per player: name, a bar, progress %, live WPM and a "finished #n" badge. The finish order
// shown here is by the server's finish times; the race results screen has the final numbers.
export function RaceTrack({ roster, progress, youId, ownShare, ownWpm, shareOf, away }: Props) {
  const finishOrder = roster
    .map((p) => progress[p.id])
    .filter((e): e is RaceProgressEntry => e !== undefined && e.finishedMs !== null)
    .sort((a, b) => a.finishedMs! - b.finishedMs!)
    .map((e) => e.id);

  return (
    <section aria-label="Race track" className={`flex flex-col gap-2.5 p-4 sm:p-5 ${cardClasses}`}>
      <ul className="flex flex-col gap-2.5">
        {roster.map((p) => {
          const entry = progress[p.id];
          const you = p.id === youId;
          const share = you ? ownShare : shareOf(entry?.words ?? 0);
          const place = finishOrder.indexOf(p.id);
          const wpm = you ? ownWpm : (entry?.wpm ?? 0);
          return (
            <li key={p.id} data-testid="race-lane" data-player={p.name} data-share={Math.round(share * 100)} className={`flex items-center gap-3 ${away.has(p.id) ? "text-muted" : ""}`}>
              <span className="bold-text-sm w-20 shrink-0 truncate sm:w-28">{p.name}</span>
              {you && <span className={`bold-text-xs rounded-full px-2 py-0.5 ${youBadgeClasses}`}>You</span>}
              <div className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-full border-2 border-foreground bg-sunken" role="progressbar" aria-label={`${p.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
                <div className="h-full bg-tile-correct transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
              <span className="bold-text-xs w-10 shrink-0 text-right tabular-nums">{Math.round(share * 100)}%</span>
              <span className="bold-text-xs w-16 shrink-0 text-right tabular-nums text-muted">{Math.round(wpm)} WPM</span>
              <span className="w-16 shrink-0">
                {place >= 0 && (
                  <span data-testid="finish-badge" className="bold-text-xs rounded-full border-2 border-foreground bg-tile-correct px-2 py-0.5 text-tile-correct-fg">
                    #{place + 1}
                  </span>
                )}
                {away.has(p.id) && place < 0 && <span className="regular-text-xs">Away</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
