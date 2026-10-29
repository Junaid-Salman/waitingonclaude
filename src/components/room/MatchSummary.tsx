"use client";

import type { RankingEntry } from "../../../shared/protocol";
import { buttonClasses, focusClasses, youBadgeClasses } from "@/lib/colors";
import { formatDuration } from "@/lib/room/clock";

interface Props {
  ranking: RankingEntry[];
  youId: string | null;
  isHost: boolean;
  onPlayAgain(): void;
}

export function MatchSummary({ ranking, youId, isHost, onPlayAgain }: Props) {
  return (
    <section aria-label="Final results" data-testid="match-summary" className="flex flex-col gap-4">
      <h2 className="semibold-display-xs">Final results</h2>
      <table className="regular-text-md w-full border-collapse text-left">
        <thead>
          <tr className="semibold-text-sm text-muted">
            <th scope="col" className="py-2 pr-2">
              Rank
            </th>
            <th scope="col" className="py-2 pr-2">
              Player
            </th>
            <th scope="col" className="py-2 pr-2">
              Rounds won
            </th>
            <th scope="col" className="py-2">
              Total time
            </th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((entry) => (
            <tr key={entry.id} data-testid="ranking-row" data-rank={entry.rank} className="border-t-2 border-tile-border">
              <td className="semibold-text-md py-2 pr-2">{entry.rank}</td>
              <td className="py-2 pr-2">
                <span className="inline-flex items-center gap-2">
                  <span className="truncate">{entry.name}</span>
                  {entry.id === youId && <span className={`semibold-text-xs rounded px-2 py-0.5 ${youBadgeClasses}`}>You</span>}
                </span>
              </td>
              <td className="py-2 pr-2">{entry.roundsWon}</td>
              <td className="py-2">{formatDuration(entry.totalMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isHost ? (
        <button type="button" onClick={onPlayAgain} className={`semibold-text-md self-start rounded px-4 py-2 ${buttonClasses} ${focusClasses}`}>
          Play again
        </button>
      ) : (
        <p className="regular-text-sm text-muted">Waiting for the host to start another match.</p>
      )}
    </section>
  );
}
