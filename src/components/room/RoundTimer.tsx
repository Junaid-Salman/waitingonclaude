"use client";

import { formatCountdown, remainingMs } from "@/lib/room/clock";
import { useNow } from "@/lib/use-now";

// Display only: the server ends the round. `offset` is server time minus client time.
export function RoundTimer({ endsAt, offset }: { endsAt: number; offset: number }) {
  const now = useNow();
  return (
    <span role="timer" aria-label="Time left in the round" data-testid="round-timer" className="semibold-display-xs tabular-nums">
      {now === 0 ? "–:––" : formatCountdown(remainingMs(endsAt, now, offset))}
    </span>
  );
}
