// Shown above the input while Caps Lock is on: the passage is case-sensitive.
export function CapsLockWarning({ on }: { on: boolean }) {
  return (
    <p role="status" aria-live="polite" data-testid="caps-lock" className="bold-text-sm min-h-5 text-invalid">
      {on ? "Caps Lock is on. Capital letters must match exactly." : ""}
    </p>
  );
}
