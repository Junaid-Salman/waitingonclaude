import { formatCountdown } from "@/lib/room/clock";

interface Props {
  wpm: number;
  accuracy: number;
  remainingMs: number;
}

// Live numbers for the player's own run: WPM, accuracy and time left. Display only; the stats come
// from shared/type-race/stats.ts, the same formulas the server will use for a race result.
export function LiveStats({ wpm, accuracy, remainingMs }: Props) {
  const item = "flex flex-col items-center rounded-xl border-2 border-foreground bg-sunken px-4 py-2";
  return (
    <dl className="grid grid-cols-3 gap-2.5 text-center" aria-label="Your stats">
      <div className={item}>
        <dt className="bold-text-xs tracking-wider text-muted uppercase">WPM</dt>
        <dd className="extrabold-display-xs font-display" data-testid="live-wpm">
          {Math.round(wpm)}
        </dd>
      </div>
      <div className={item}>
        <dt className="bold-text-xs tracking-wider text-muted uppercase">Accuracy</dt>
        <dd className="extrabold-display-xs font-display" data-testid="live-accuracy">
          {Math.floor(accuracy * 100)}%
        </dd>
      </div>
      <div className={item}>
        <dt className="bold-text-xs tracking-wider text-muted uppercase">Time left</dt>
        <dd className="extrabold-display-xs font-display" data-testid="live-time">
          {formatCountdown(remainingMs)}
        </dd>
      </div>
    </dl>
  );
}
