"use client";

import type { RosterPlayer } from "../../../shared/protocol";
import { cardClasses, rowClasses, youRowClasses } from "@/lib/colors";
import { LetterTiles } from "@/components/woordle/LetterTiles";
import { formatCountdown, formatDuration, remainingMs } from "@/lib/room/clock";
import type { RoundEndInfo } from "@/lib/room/match-store";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";
import { useNow } from "@/lib/use-now";

interface Props {
  info: RoundEndInfo;
  roster: RosterPlayer[];
  youId: string | null;
  totalRounds: number;
  offset: number;
}

// Between rounds: the answer, the winner and this round's results only.
export function RoundSummary({ info, roster, youId, totalRounds, offset }: Props) {
  const now = useNow();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const name = (id: string) => roster.find((p) => p.id === id)?.name ?? "Player";
  const last = info.round >= totalRounds;
  const winner = info.winnerId ? (info.winnerId === youId ? "You" : name(info.winnerId)) : null;

  return (
    <section aria-label="Round result" data-testid="round-summary" className={`flex w-full max-w-xl flex-col items-center gap-4 p-5 text-center sm:p-8 ${cardClasses}`}>
      <h2 ref={heading} tabIndex={-1} className="bold-text-xs tracking-wider text-muted uppercase outline-none">
        Round {info.round} of {totalRounds} · Round result
      </h2>
      <p>
        <LetterTiles letters={info.answer} label={`The word was ${info.answer.toUpperCase()}.`} testId="round-answer" />
      </p>
      <p className={`extrabold-display-xs font-display ${info.winnerId === youId ? "text-success" : ""}`} data-testid="round-winner">
        {winner ? `${winner} won the round.` : "Nobody solved it."}
      </p>

      <ul className="flex w-full flex-col gap-2 text-left" aria-label="Results">
        {info.results.map((r) => (
          <li key={r.id} className={`bold-text-md flex items-center justify-between gap-2 px-3.5 py-2.5 ${r.id === youId ? youRowClasses : rowClasses}`}>
            <span className="min-w-0 truncate">
              {r.id === youId ? "You" : name(r.id)}
            </span>
            <span className="bold-text-sm shrink-0">
              {r.solvedMs !== null ? `${formatDuration(r.solvedMs)} · ${r.guesses} ${r.guesses === 1 ? "guess" : "guesses"}` : "Not solved"}
            </span>
          </li>
        ))}
      </ul>

      <p className="bold-text-sm text-muted" data-testid="next-countdown">
        {last ? "Final results in " : "Next round in "}
        {now === 0 ? "…" : formatCountdown(remainingMs(info.nextAt, now, offset))}
      </p>
    </section>
  );
}
