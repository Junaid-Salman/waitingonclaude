"use client";

import { formatCountdown, remainingMs } from "@/lib/room/clock";
import { useNow } from "@/lib/use-now";

// Display only: the server ends the round. `offset` is server time minus client time.
// A yellow piece; red for the last 10 seconds.
export function RoundTimer({ endsAt, offset }: { endsAt: number; offset: number }) {
  const now = useNow();
  const left = now === 0 ? null : remainingMs(endsAt, now, offset);
  const last = left !== null && left <= 10_000;
  return (
    <span
      role="timer"
      aria-label="Time left in the round"
      data-testid="round-timer"
      className={`bold-text-xl rounded-xl border-[2.5px] border-foreground px-3 py-1 tabular-nums ${last ? "bg-accent text-accent-fg" : "bg-tile-present text-tile-present-fg"}`}
    >
      {left === null ? "–:––" : formatCountdown(left)}
    </span>
  );
}
