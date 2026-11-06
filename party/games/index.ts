import { createTypeRaceGame } from "./type-race/game";
import { createWoordleGame } from "./woordle/game";
import type { GameDefinition } from "./types";

// Maps a game id to its definition. Definitions are stateless: all match state lives in the value
// returned by `createState`, so one definition serves every room.
// `unknown` generics: each entry is narrowed by the game that registers it.
export const games: Record<string, GameDefinition<unknown, unknown, unknown>> = {
  woordle: createWoordleGame(),
  // Type Race speaks its own message union; the room treats messages as opaque JSON, so the cast
  // only erases that difference.
  "type-race": createTypeRaceGame() as unknown as GameDefinition<unknown, unknown, unknown>,
};

export function getGame(id: string): GameDefinition<unknown, unknown, unknown> | undefined {
  return Object.hasOwn(games, id) ? games[id] : undefined;
}
