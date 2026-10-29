import type { TileColour } from "../../../shared/protocol";

export type KeyColours = Record<string, TileColour>;

const rank: Record<TileColour, number> = { grey: 0, yellow: 1, green: 2 };

// A key keeps its best colour: green is never downgraded, yellow only upgrades to green.
export function mergeKeyColours(prev: KeyColours, word: string, colours: TileColour[]): KeyColours {
  const next = { ...prev };
  [...word].forEach((letter, i) => {
    const current = next[letter];
    if (current === undefined || rank[colours[i]] > rank[current]) next[letter] = colours[i];
  });
  return next;
}
