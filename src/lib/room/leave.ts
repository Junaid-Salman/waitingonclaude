import type { RoomPhase } from "../../../shared/protocol";
import type { MatchStage } from "./match-store";
import type { RoomStatus } from "./store";

// Owner decision Q13 (Sub-phase 6.1): leaving asks first only while a round is being played or
// revealed, when walking out costs the seat mid-game. In the lobby and on the final results it
// costs nothing, so it is immediate. A room in its match phase whose snapshot has not arrived yet
// ("idle") is still mid-round.
export function needsLeaveConfirm({ status, phase, stage }: { status: RoomStatus; phase: RoomPhase; stage: MatchStage }): boolean {
  return status === "joined" && phase === "match" && stage !== "finished";
}

// A modified click (new tab or window) is left to the browser, so opening home elsewhere never
// costs the seat (N3).
export function isPlainClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
