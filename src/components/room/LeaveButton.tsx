"use client";

import { RECONNECT_GRACE_MS } from "../../../shared/protocol";
import { focusClasses, secondaryButtonClasses } from "@/lib/colors";
import { useRoom } from "@/lib/room/store";

// Frees the seat at once (no grace hold) and passes host on. Shared by the lobby and the match.
// While the connection is down the leave cannot reach the server: the tab still leaves, and the
// seat frees itself when its grace runs out (Phase 5.1, Q6), which the hint says. "About": the
// grace starts when the server notices the drop, which on a half-open connection can be later.
export function LeaveButton({ onLeave }: { onLeave(): void }) {
  const reconnecting = useRoom((s) => s.reconnecting);
  return (
    <div className="flex flex-col gap-1 self-start">
      <button type="button" onClick={onLeave} className={`semibold-text-sm self-start rounded px-3 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
        Leave room
      </button>
      {reconnecting && (
        <p className="regular-text-xs text-muted" data-testid="leave-hint">
          Your seat frees about {RECONNECT_GRACE_MS / 1000} s after the drop.
        </p>
      )}
    </div>
  );
}
