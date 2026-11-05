import type { RoomServerMessage } from "../../shared/protocol";
import type { PublicId, RoomPlayer } from "../room/types";

// Reserved sender for actions the game scheduled for itself (a round timer firing).
export const SYSTEM = "system" as const;
export type Sender = PublicId | typeof SYSTEM;

// What the room layer lends a game: a clock, timers, and ways to talk to players. Games only ever
// see public ids; the room maps them to connections and never passes the secret playerId across.
export interface GameContext<Action> {
  now(): number;
  // Delivers `action` to `onAction` with sender SYSTEM after `delayMs`. Returns a cancel function.
  schedule(delayMs: number, action: Action): () => void;
  sendTo(id: PublicId, message: RoomServerMessage): void;
  broadcast(message: RoomServerMessage): void;
  broadcastExcept(id: PublicId, message: RoomServerMessage): void;
}

export interface GameDefinition<State, Settings, Action> {
  id: string;
  defaultSettings: Settings;
  // Throws on invalid input.
  validateSettings(input: unknown): Settings;
  // Validates one untrusted client message; null means drop it. Internal actions (timers) must
  // never be parseable here.
  parseAction(input: unknown): Action | null;
  createState(players: RoomPlayer[], settings: Settings, ctx: GameContext<Action>): State;
  onAction(state: State, sender: Sender, action: Action, ctx: GameContext<Action>): State;
  // The player's seat is gone for good: their reconnect grace expired or they pressed Leave. A
  // player who merely dropped is still in the match until then, and must count as playing.
  onPlayerLeave(state: State, id: PublicId, ctx: GameContext<Action>): State;
  // A seated player came back (refresh or reconnect) while the match runs. The game sends them
  // whatever they need to redraw the match, through ctx.sendTo and built from viewFor.
  onPlayerReturn(state: State, id: PublicId, ctx: GameContext<Action>): State;
  // The room owns rate limits but not the game's vocabulary: this names the reply to an action
  // the room refused for arriving too fast (null means drop it silently).
  rateLimitedReply(action: Action): RoomServerMessage | null;
  // The fairness boundary: what this player may see (own letters, opponents' colours, the answer
  // only once the round is over).
  viewFor(state: State, id: PublicId): unknown;
  isFinished(state: State): boolean;
}
