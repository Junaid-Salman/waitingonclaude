import type { RoomPhase } from "../../../shared/protocol";
import type { RaceLobbyStatus } from "./lobby-store";
import type { TrStage } from "./race-store";

// Owner decision Q13, applied to races: leaving asks first while a race is counting down, being
// raced or showing its results, when walking out costs the seat mid-match. In the lobby and on the
// final results it costs nothing, so it is immediate. A room in its match phase whose snapshot has
// not arrived yet ("idle") is still mid-race.
export function needsRaceLeaveConfirm({ status, phase, stage }: { status: RaceLobbyStatus; phase: RoomPhase; stage: TrStage }): boolean {
  return status === "joined" && phase === "match" && stage !== "finished";
}
