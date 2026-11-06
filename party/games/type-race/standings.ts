import type { Standing } from "../../../shared/type-race-protocol";

export interface StandingInput {
  id: string;
  name: string;
  points: number;
  // One entry per race of the match. A race after the player left is {0, 0}; a race they did not
  // finish counts its WPM measured to the time limit.
  races: readonly { wpm: number; accuracy: number }[];
}

const average = (values: readonly number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

// Points, then average WPM, then average accuracy (spec 6). Players equal on all three share a rank
// and the next rank is one higher (dense: 1, 1, 2), like Woordle's ranking. Stable, so join order
// breaks the display order of a tie.
export function rankStandings(players: readonly StandingInput[]): Standing[] {
  const rows = players.map((p) => ({
    id: p.id,
    name: p.name,
    points: p.points,
    avgWpm: average(p.races.map((r) => r.wpm)),
    avgAccuracy: average(p.races.map((r) => r.accuracy)),
    bestWpm: Math.max(0, ...p.races.map((r) => r.wpm)),
  }));
  rows.sort((a, b) => b.points - a.points || b.avgWpm - a.avgWpm || b.avgAccuracy - a.avgAccuracy);
  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.points !== r.points || prev.avgWpm !== r.avgWpm || prev.avgAccuracy !== r.avgAccuracy) rank++;
    return { ...r, rank };
  });
}
