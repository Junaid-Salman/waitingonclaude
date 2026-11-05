"use client";

import { RECONNECT_GRACE_MS } from "../../../shared/protocol";
import { focusClasses, secondaryButtonClasses } from "@/lib/colors";
import { useRoom } from "@/lib/room/store";

// In the room header. Frees the seat at once (no grace hold) and passes host on.
// While the connection is down the leave cannot reach the server: the tab still leaves, and the
// seat frees itself when its grace runs out (Phase 5.1, Q6), which the hint says. "About": the
// grace starts when the server notices the drop, which on a half-open connection can be later.
export function LeaveButton({ onLeave }: { onLeave(): void }) {
  const reconnecting = useRoom((s) => s.reconnecting);
  return (
    <div className="relative flex flex-col items-end">
      <button type="button" onClick={onLeave} className={`bold-text-sm rounded-xl px-3.5 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
        Leave room
      </button>
      {reconnecting && (
        /* In the page flow on phones, so it cannot sit on top of the reconnecting line (M2). */
        <p className="regular-text-xs mt-1 max-w-36 text-right text-muted sm:absolute sm:top-full sm:right-0 sm:w-44 sm:max-w-none" data-testid="leave-hint">
          Your seat frees about {RECONNECT_GRACE_MS / 1000} s after the drop.
        </p>
      )}
    </div>
  );
}
