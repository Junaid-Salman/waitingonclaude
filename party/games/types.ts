import type { PlayerId, RoomPlayer } from "../room/types";

export interface GameContext {
  now(): number;
  schedule(delayMs: number, callback: () => void): void;
  sendTo(playerId: PlayerId, message: unknown): void;
  broadcast(message: unknown): void;
}

export interface GameDefinition<State, Settings, Action> {
  id: string;
  defaultSettings: Settings;
  validateSettings(input: unknown): Settings;
  createState(players: RoomPlayer[], settings: Settings, ctx: GameContext): State;
  onAction(state: State, playerId: PlayerId, action: Action, ctx: GameContext): State;
  onPlayerLeave(state: State, playerId: PlayerId, ctx: GameContext): State;
  viewFor(state: State, playerId: PlayerId): unknown;
  isFinished(state: State): boolean;
}
