"use client";

import type { ChallengeSummaryInfo } from "@/lib/challenge/store";
import { formatDuration } from "@/lib/room/clock";
import { buttonClasses, cardClasses, focusClasses, rowClasses } from "@/lib/colors";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";

export function ChallengeSummary({ summary, onPlayAgain }: { summary: ChallengeSummaryInfo; onPlayAgain(): void }) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section aria-label="Challenge results" data-testid="challenge-summary" className={`flex w-full max-w-xl flex-col gap-3 p-5 sm:p-8 ${cardClasses}`}>
      <h2 ref={heading} tabIndex={-1} className="extrabold-display-sm sm:extrabold-display-lg font-display outline-none">
        Challenge complete
      </h2>
      <p className="bold-text-lg text-success" data-testid="summary-solved">
        {summary.solved} of {summary.rounds.length} solved
      </p>
      <p className="regular-text-md text-muted" data-testid="summary-time">
        Total time {formatDuration(summary.totalMs)}
      </p>
      <ol className="flex flex-col gap-2" aria-label="Words">
        {summary.rounds.map((r, i) => (
          <li key={i} className={`bold-text-md flex items-center justify-between gap-2 px-3.5 py-2.5 ${rowClasses}`}>
            <span className="tracking-widest uppercase">{r.answer}</span>
            <span className="bold-text-sm">
              {r.solvedMs !== null ? `${formatDuration(r.solvedMs)} · ${r.guesses} ${r.guesses === 1 ? "guess" : "guesses"}` : "Not solved"}
            </span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onPlayAgain} className={`bold-text-md self-stretch rounded-xl px-5 py-3 sm:self-start ${buttonClasses} ${focusClasses}`}>
        Play again
      </button>
    </section>
  );
}
