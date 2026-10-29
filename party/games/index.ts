import type { GameDefinition } from "./types";

// Maps a game id to its definition. Empty until Phase 3 registers the Woordle definition.
// `unknown` generics: each entry is narrowed by the game that registers it.
export const games: Record<string, GameDefinition<unknown, unknown, unknown>> = {};

export function getGame(id: string): GameDefinition<unknown, unknown, unknown> | undefined {
  return Object.hasOwn(games, id) ? games[id] : undefined;
}
