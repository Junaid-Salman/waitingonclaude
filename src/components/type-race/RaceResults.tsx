"use client";

import type { RosterPlayer } from "../../../shared/protocol";
import type { RaceEnd } from "../../../shared/type-race-protocol";
import { round1 } from "../../../shared/type-race/stats";
import { cardClasses } from "@/lib/colors";
import { formatCountdown, formatDuration, remainingMs } from "@/lib/room/clock";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";
import { useNow } from "@/lib/use-now";

interface Props {
  end: RaceEnd;
  roster: RosterPlayer[];
  youId: string | null;
  totalRaces: number;
  offset: number;
}

// Placement table for one race: placement, WPM, accuracy, time, points. The numbers are the
// server's. A player who did not finish has no placement and 0 points.
export function RaceResults({ end, roster, youId, totalRaces, offset }: Props) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const now = useNow();
  const name = (id: string) => roster.find((p) => p.id === id)?.name ?? "Player";
  const last = end.race >= totalRaces;
  const left = now === 0 ? null : remainingMs(end.nextAt, now, offset);
  const cell = (you: boolean) => `border-y-2 border-foreground py-2.5 ${you ? "bg-tile-present text-tile-present-fg" : "bg-surface"}`;

  return (
    <section aria-label="Race results" data-testid="race-results" className={`flex w-full max-w-2xl flex-col gap-4 p-5 sm:p-8 ${cardClasses}`}>
      <div className="flex flex-col gap-1">
        <h2 ref={heading} tabIndex={-1} className="extrabold-display-sm font-display outline-none">
          Race {end.race} of {totalRaces}
        </h2>
        <p className="regular-text-sm text-muted" data-testid="next-race">
          {left === null ? "" : last ? `Final results in ${formatCountdown(left)}` : `Next race in ${formatCountdown(left)}`}
        </p>
      </div>
      <table className="w-full border-separate border-spacing-y-2 text-left">
        <thead>
          <tr className="bold-text-xs tracking-wider text-muted uppercase">
            <th scope="col" className="px-2">Place</th>
            <th scope="col" className="px-2">Player</th>
            <th scope="col" className="px-2 text-right">WPM</th>
            <th scope="col" className="px-2 text-right">Accuracy</th>
            <th scope="col" className="px-2 text-right">Time</th>
            <th scope="col" className="px-2 text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {end.results.map((r) => {
            const you = r.id === youId;
            return (
              <tr key={r.id} data-testid="result-row" data-player={name(r.id)} data-points={r.points} data-place={r.placement ?? "none"} className="bold-text-md">
                <td className={`${cell(you)} w-12 rounded-l-xl border-l-2 pl-2.5`}>{r.placement ?? "DNF"}</td>
                <td className={`${cell(you)} max-w-0 px-2`}>
                  <span className="block truncate">{name(r.id)}</span>
                  {you && <span className="sr-only">(you)</span>}
                </td>
                <td className={`${cell(you)} px-2 text-right tabular-nums`}>{round1(r.wpm)}</td>
                <td className={`${cell(you)} px-2 text-right tabular-nums`}>{Math.floor(r.accuracy * 100)}%</td>
                <td className={`${cell(you)} px-2 text-right tabular-nums`}>{r.timeMs === null ? "–" : formatDuration(r.timeMs)}</td>
                <td className={`${cell(you)} rounded-r-xl border-r-2 pr-3.5 text-right tabular-nums`}>{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {r0(end) && <p className="regular-text-sm text-muted">Nobody finished in time.</p>}
    </section>
  );
}

const r0 = (end: RaceEnd) => end.results.length > 0 && end.results.every((r) => r.placement === null);
