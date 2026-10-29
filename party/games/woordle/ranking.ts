import type { RankingEntry } from "../../../shared/protocol";

export interface RankInput {
  id: string;
  name: string;
  roundsWon: number;
  totalMs: number;
}

// Most rounds won first, then least total time (an unsolved round already counts as the full
// limit in `totalMs`). Players equal on both share a rank, and the next rank is one higher
// (dense ranking: 1, 1, 2). The sort is stable, so ties keep join order.
export function rankPlayers(players: readonly RankInput[]): RankingEntry[] {
  const sorted = [...players].sort((a, b) => b.roundsWon - a.roundsWon || a.totalMs - b.totalMs);
  let rank = 0;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.roundsWon !== p.roundsWon || prev.totalMs !== p.totalMs) rank++;
    return { id: p.id, name: p.name, roundsWon: p.roundsWon, totalMs: p.totalMs, rank };
  });
}
