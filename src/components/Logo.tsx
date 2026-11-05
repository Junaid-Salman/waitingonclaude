import { MARK_PATH, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./logo-paths";

// The mark: a ball's bounce draws the W and the ball waits at the end. `heavy` is the favicon and
// small-size cut (stroke 15 instead of 12, ball moved clear) so it holds at 16-36 px.
export function LogoMark({ heavy = false, className = "" }: { heavy?: boolean; className?: string }) {
  const [cx, cy, r] = heavy ? [95.5, 32.5, 9.5] : [92, 37, 9];
  return (
    <svg viewBox={heavy ? "4.5 7.5 100.5 84" : "6 9 95 81"} className={className} aria-hidden="true" focusable="false">
      <path d={MARK_PATH} fill="none" className="stroke-primary" strokeWidth={heavy ? 15 : 12} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r} className="fill-accent" />
    </svg>
  );
}

// Primary horizontal lockup: mark 1.7x the cap height, centred on the cap middle, gap 0.6 cap.
export function LogoLockup({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 476.3 59.5" className={className} role="img" aria-label="WaitingOnClaude">
      <svg x="0" y="0" width="69.8" height="59.5" viewBox="6 9 95 81">
        <path d={MARK_PATH} fill="none" className="stroke-primary" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={92} cy={37} r={9} className="fill-accent" />
      </svg>
      <svg x="89.8" y="11.25" width="386.5" height="46.75" viewBox={WORDMARK_VIEWBOX}>
        <path d={WORDMARK_PATH} className="fill-foreground" />
      </svg>
    </svg>
  );
}
