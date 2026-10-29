"use client";

import type { RosterPlayer } from "../../../shared/protocol";
import { formatCountdown, formatDuration, remainingMs } from "@/lib/room/clock";
import type { RoundEndInfo } from "@/lib/room/match-store";
import { useNow } from "@/lib/use-now";

interface Props {
  info: RoundEndInfo;
  roster: RosterPlayer[];
  youId: string | null;
  totalRounds: number;
  offset: number;
}

export function RoundSummary({ info, roster, youId, totalRounds, offset }: Props) {
  const now = useNow();
  const name = (id: string) => roster.find((p) => p.id === id)?.name ?? "Player";
  const last = info.round >= totalRounds;
  const winner = info.winnerId ? (info.winnerId === youId ? "You" : name(info.winnerId)) : null;

  return (
    <section aria-label="Round result" data-testid="round-summary" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="semibold-display-xs">
          Round {info.round} of {totalRounds}
        </h2>
        <p className="regular-text-md">
          The word was <strong data-testid="round-answer" className="uppercase">{info.answer}</strong>.
        </p>
        <p className="regular-text-md" data-testid="round-winner">
          {winner ? `${winner} won the round.` : "Nobody solved it."}
        </p>
      </div>

      <ul className="flex flex-col gap-2" aria-label="Results">
        {info.results.map((r) => (
          <li key={r.id} className="regular-text-md flex items-center justify-between gap-2 rounded border-2 border-tile-border px-3 py-2">
            <span className="min-w-0 truncate">
              {name(r.id)}
              {r.id === youId ? " (you)" : ""}
            </span>
            <span className="regular-text-sm text-muted">
              {r.solvedMs !== null ? `${formatDuration(r.solvedMs)} · ${r.guesses} ${r.guesses === 1 ? "guess" : "guesses"}` : "Not solved"}
            </span>
          </li>
        ))}
      </ul>

      <p className="regular-text-sm text-muted" data-testid="next-countdown">
        {last ? "Final results in " : "Next round in "}
        {now === 0 ? "…" : formatCountdown(remainingMs(info.nextAt, now, offset))}
      </p>
    </section>
  );
}
