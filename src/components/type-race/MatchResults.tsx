"use client";

import Link from "next/link";
import type { Standing } from "../../../shared/type-race-protocol";
import { round1 } from "../../../shared/type-race/stats";
import { buttonClasses, cardClasses, focusClasses, secondaryButtonClasses } from "@/lib/colors";
import { isPlainClick } from "@/lib/room/leave";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";

interface Props {
  standings: Standing[];
  youId: string | null;
  isHost: boolean;
  onPlayAgain(): void;
  // Frees the seat, then goes to the Type Race page.
  onBack(): void;
  offline?: boolean;
}

// Final standings: points, then average WPM, then average accuracy. Your row is yellow; full ties share a rank.
export function MatchResults({ standings, youId, isHost, onPlayAgain, onBack, offline = false }: Props) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const cell = (you: boolean) => `border-y-2 border-foreground py-2.5 ${you ? "bg-tile-present text-tile-present-fg" : "bg-surface"}`;
  return (
    <section aria-label="Final standings" data-testid="match-standings" className={`flex w-full max-w-3xl flex-col gap-4 p-5 sm:p-8 ${cardClasses}`}>
      <div className="flex flex-col gap-1">
        <h2 ref={heading} tabIndex={-1} className="extrabold-display-sm sm:extrabold-display-lg font-display outline-none">
          Final standings
        </h2>
        <p className="regular-text-sm text-muted">Ranked by points, then average WPM, then average accuracy.</p>
      </div>
      <table className="w-full border-separate border-spacing-y-2 text-left">
        <thead>
          <tr className="bold-text-xs tracking-wider text-muted uppercase">
            <th scope="col" className="px-2">Rank</th>
            <th scope="col" className="px-2">Player</th>
            <th scope="col" className="px-2 text-right">Points</th>
            <th scope="col" className="px-2 text-right">Avg WPM</th>
            <th scope="col" className="px-2 text-right">Avg accuracy</th>
            <th scope="col" className="px-2 text-right">Best WPM</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const you = s.id === youId;
            return (
              <tr key={s.id} data-testid="standing-row" data-rank={s.rank} data-points={s.points} data-player={s.name} className="bold-text-md">
                <td className={`${cell(you)} w-12 rounded-l-xl border-l-2 pl-2.5`}>
                  <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-background">{s.rank}</span>
                </td>
                <td className={`${cell(you)} max-w-0 px-2`}>
                  <span className="block truncate">{s.name}</span>
                  {you && <span className="sr-only">(you)</span>}
                </td>
                <td className={`${cell(you)} px-2 text-right tabular-nums`}>{s.points}</td>
                <td className={`${cell(you)} px-2 text-right tabular-nums`}>{round1(s.avgWpm)}</td>
                <td className={`${cell(you)} px-2 text-right tabular-nums`}>{Math.floor(s.avgAccuracy * 100)}%</td>
                <td className={`${cell(you)} rounded-r-xl border-r-2 pr-3.5 text-right tabular-nums`}>{round1(s.bestWpm)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3">
        {isHost ? (
          <button type="button" disabled={offline} onClick={onPlayAgain} className={`bold-text-md rounded-xl px-5 py-3 disabled:opacity-50 ${buttonClasses} ${focusClasses}`}>
            Play again
          </button>
        ) : (
          <p className="regular-text-md text-muted">Waiting for the host to start another match.</p>
        )}
        <Link
          href="/type-race"
          onClick={(event) => {
            // Leaving frees the seat, so the Back link goes through the page's leave().
            if (!isPlainClick(event)) return;
            event.preventDefault();
            onBack();
          }}
          className={`bold-text-md rounded-xl px-5 py-3 ${secondaryButtonClasses} ${focusClasses}`}
        >
          Back to Type Race
        </Link>
      </div>
    </section>
  );
}
