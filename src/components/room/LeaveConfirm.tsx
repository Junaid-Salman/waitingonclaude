"use client";

import { useEffect, useRef } from "react";
import { accentButtonClasses, buttonClasses, cardClasses, focusClasses } from "@/lib/colors";

// "Leave the match?" (owner decision Q13). A native modal <dialog>: the browser traps focus inside
// it, Escape cancels, and focus goes back to whatever opened it. Never window.confirm, which blocks
// the page. Stay comes first, so showModal() focuses it and a stray Enter keeps the seat.
export function LeaveConfirm({ open, onStay, onLeave }: { open: boolean; onStay(): void; onLeave(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="leave-title"
      aria-describedby="leave-body"
      // Fires for Stay, for Escape and after Leave match; leaving navigates away regardless.
      onClose={onStay}
      className={`m-auto w-[min(22.5rem,calc(100%-2rem))] p-6 text-foreground backdrop:bg-scrim/60 ${cardClasses}`}
    >
      <h2 id="leave-title" className="extrabold-display-xs font-display">
        Leave the match?
      </h2>
      <p id="leave-body" className="regular-text-md mt-3 text-muted">
        You&apos;ll lose your seat, and the match carries on without you.
      </p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <button type="button" onClick={() => ref.current?.close()} className={`bold-text-md rounded-xl px-5 py-3 ${buttonClasses} ${focusClasses}`}>
          Stay
        </button>
        <button type="button" onClick={onLeave} className={`bold-text-md rounded-xl px-5 py-3 ${accentButtonClasses} ${focusClasses}`}>
          Leave match
        </button>
      </div>
    </dialog>
  );
}
