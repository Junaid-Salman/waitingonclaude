"use client";

import type { ChallengeSummaryInfo } from "@/lib/challenge/store";
import { formatDuration } from "@/lib/room/clock";
import { buttonClasses, focusClasses } from "@/lib/colors";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";

export function ChallengeSummary({ summary, onPlayAgain }: { summary: ChallengeSummaryInfo; onPlayAgain(): void }) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section aria-label="Challenge results" data-testid="challenge-summary" className="flex flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="semibold-display-xs outline-none">
        Challenge complete
      </h2>
      <p className="medium-text-lg" data-testid="summary-solved">
        {summary.solved} of {summary.rounds.length} solved
      </p>
      <p className="regular-text-md" data-testid="summary-time">
        Total time {formatDuration(summary.totalMs)}
      </p>
      <ol className="flex flex-col gap-2" aria-label="Words">
        {summary.rounds.map((r, i) => (
          <li key={i} className="regular-text-md flex items-center justify-between gap-2 rounded border-2 border-tile-border px-3 py-2">
            <span className="uppercase">{r.answer}</span>
            <span className="regular-text-sm text-muted">
              {r.solvedMs !== null ? `${formatDuration(r.solvedMs)} · ${r.guesses} ${r.guesses === 1 ? "guess" : "guesses"}` : "Not solved"}
            </span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onPlayAgain} className={`semibold-text-md self-start rounded px-4 py-2 ${buttonClasses} ${focusClasses}`}>
        Play again
      </button>
    </section>
  );
}
