"use client";

import type { RankingEntry } from "../../../shared/protocol";
import { buttonClasses, cardClasses, focusClasses } from "@/lib/colors";
import { formatDuration } from "@/lib/room/clock";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";

interface Props {
  ranking: RankingEntry[];
  youId: string | null;
  isHost: boolean;
  onPlayAgain(): void;
  offline?: boolean;
}

// A real table (rank, player, rounds won, total time), drawn as rows of game pieces. Your row is
// yellow; equal rounds won and equal total time share a rank.
export function MatchSummary({ ranking, youId, isHost, onPlayAgain, offline = false }: Props) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const cell = (you: boolean) => `border-y-2 border-foreground py-2.5 ${you ? "bg-tile-present text-tile-present-fg" : "bg-surface"}`;
  return (
    <section aria-label="Final results" data-testid="match-summary" className={`flex w-full max-w-xl flex-col gap-4 p-5 sm:p-8 ${cardClasses}`}>
      <div className="flex flex-col gap-1">
        <h2 ref={heading} tabIndex={-1} className="extrabold-display-sm sm:extrabold-display-lg font-display outline-none">
          Final results
        </h2>
        <p className="regular-text-sm text-muted">Ranked by rounds won, then by total time. An unsolved round counts the full time.</p>
      </div>
      <table className="w-full border-separate border-spacing-y-2 text-left">
        <thead>
          <tr className="bold-text-xs tracking-wider text-muted uppercase">
            <th scope="col" className="px-2 pb-0">
              Rank
            </th>
            <th scope="col" className="px-2 pb-0">
              Player
            </th>
            <th scope="col" className="px-2 pb-0 text-right">
              Rounds won
            </th>
            <th scope="col" className="px-2 pb-0 text-right">
              Total time
            </th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((entry) => {
            const you = entry.id === youId;
            return (
              <tr key={entry.id} data-testid="ranking-row" data-rank={entry.rank} className="bold-text-md">
                <td className={`${cell(you)} w-12 rounded-l-xl border-l-2 pl-2.5`}>
                  <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-background">{entry.rank}</span>
                </td>
                <td className={`${cell(you)} max-w-0 px-2`}>
                  <span className="flex items-center gap-2">
                    <span className="truncate">{entry.name}</span>
                    {you && <span className="sr-only">(you)</span>}
                  </span>
                </td>
                <td className={`${cell(you)} px-2 text-right`}>{entry.roundsWon}</td>
                <td className={`${cell(you)} rounded-r-xl border-r-2 pr-3.5 text-right tabular-nums`}>{formatDuration(entry.totalMs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isHost ? (
        <button
          type="button"
          disabled={offline}
          onClick={onPlayAgain}
          className={`bold-text-md self-stretch rounded-xl px-5 py-3 disabled:opacity-50 sm:self-start ${buttonClasses} ${focusClasses}`}
        >
          Play again
        </button>
      ) : (
        <p className="regular-text-md text-muted">Waiting for the host to start another match.</p>
      )}
    </section>
  );
}
