// The big 3-2-1 before a run. The number is derived from the start time on every tick, so it can't
// drift from the moment typing unlocks. Static on purpose: no animation to switch off for reduced motion.
export function Countdown({ remainingMs }: { remainingMs: number }) {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return (
    <p role="status" aria-live="polite" data-testid="countdown" className="extrabold-display-lg font-display text-center">
      <span className="sr-only">Starting in </span>
      {seconds}
    </p>
  );
}
