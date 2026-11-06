// Type Race needs a physical keyboard. Shown on touch devices and narrow screens only (owner
// decision: a notice, no on-screen-keyboard handling in v1).
export function DesktopNotice() {
  return (
    <p role="note" data-testid="desktop-notice" className="bold-text-sm hidden rounded-xl border-2 border-foreground bg-sunken px-3.5 py-2.5 pointer-coarse:block max-sm:block">
      Type Race is best on a computer with a keyboard. It needs one to play.
    </p>
  );
}
