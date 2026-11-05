"use client";

import { useCallback } from "react";
import { MAX_GUESSES } from "../../../shared/protocol";
import { cardClasses } from "@/lib/colors";
import { formatDuration } from "@/lib/room/clock";
import { isDone, useMatch } from "@/lib/room/match-store";
import { useRoom } from "@/lib/room/store";
import { useKeyboardInput } from "@/lib/woordle/use-keyboard-input";
import { Grid } from "@/components/woordle/Grid";
import { Keyboard } from "@/components/woordle/Keyboard";
import { MatchSummary } from "./MatchSummary";
import { OpponentBoard } from "./OpponentBoard";
import { RoundSummary } from "./RoundSummary";
import { RoundTimer } from "./RoundTimer";

interface Props {
  onGuess(word: string): void;
  onPlayAgain(): void;
}

type PlayerStatus = "solved" | "out" | "playing" | "away" | "left";
const DOT: Record<PlayerStatus, string> = { solved: "bg-tile-correct", out: "bg-tile-absent", playing: "bg-tile-present", away: "bg-tile-border", left: "bg-tile-border" };

// Desktop only: this round's status per player (owner decision Q9). Rounds won are not shown here:
// a refreshed client has only the current round, so a running score could be wrong.
function PlayersCard({ rows }: { rows: { id: string; name: string; status: PlayerStatus; solvedMs: number | null }[] }) {
  const label = (r: (typeof rows)[number]) =>
    r.status === "solved" && r.solvedMs !== null ? `Solved · ${formatDuration(r.solvedMs)}` : { solved: "Solved", out: "Out of guesses", playing: "Playing", away: "Reconnecting…", left: "Left" }[r.status];
  return (
    <section aria-label="Players this round" className={`hidden w-70 shrink-0 flex-col gap-1 p-5 lg:flex ${cardClasses}`}>
      <h2 className="bold-text-xs pb-1 tracking-wider text-muted uppercase">Players · this round</h2>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className={`flex items-center gap-2.5 py-2 ${r.status === "away" || r.status === "left" ? "text-muted" : ""}`}>
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full border-[1.5px] border-foreground ${DOT[r.status]}`} />
            <span className="bold-text-md min-w-0 flex-1 truncate">{r.name}</span>
            <span className={`bold-text-xs shrink-0 ${r.status === "solved" ? "text-success" : "text-muted"}`}>{label(r)}</span>
          </li>
        ))}
      </ul>
      <p className="regular-text-xs pt-1 text-muted">Rounds won show on the final results.</p>
    </section>
  );
}

export function MatchScreen({ onGuess, onPlayAgain }: Props) {
  const match = useMatch();
  const { players, youId, reconnecting } = useRoom();
  const isHost = players.some((p) => p.isHost && p.id === youId);
  const inLobby = new Set(players.map((p) => p.id));
  const away = new Set(players.filter((p) => !p.connected).map((p) => p.id));

  const onLetter = useCallback((letter: string) => useMatch.getState().type(letter), []);
  const onBackspace = useCallback(() => useMatch.getState().backspace(), []);
  const onEnter = useCallback(() => {
    const word = useMatch.getState().submit();
    if (word) onGuess(word);
  }, [onGuess]);
  // While reconnecting a guess could not be sent, so typing waits for the snapshot that follows.
  useKeyboardInput({ enabled: match.stage === "playing" && !reconnecting, onLetter, onEnter, onBackspace });

  if (match.stage === "idle") {
    // The room says a match is running and the snapshot that redraws it is on its way.
    return <p className="regular-text-md text-muted">Rejoining the match…</p>;
  }
  if (match.stage === "finished" && match.ranking) {
    return <MatchSummary ranking={match.ranking} youId={youId} isHost={isHost} onPlayAgain={onPlayAgain} offline={reconnecting} />;
  }
  if (match.stage === "reveal" && match.roundEnd) {
    return <RoundSummary info={match.roundEnd} roster={match.roster} youId={youId} totalRounds={match.totalRounds} offset={match.offset} />;
  }

  const done = isDone(match);
  const opponents = match.roster.filter((p) => p.id !== youId);
  const statusOf = (id: string, solvedMs: number | null, guesses: number): PlayerStatus =>
    !inLobby.has(id) ? "left" : away.has(id) ? "away" : solvedMs !== null ? "solved" : guesses >= MAX_GUESSES ? "out" : "playing";
  const playerRows = [
    { id: youId ?? "you", name: "You", status: (match.solvedMs !== null ? "solved" : done ? "out" : "playing") as PlayerStatus, solvedMs: match.solvedMs },
    ...opponents.map((p) => {
      const o = match.opponents[p.id];
      return { id: p.id, name: p.name, status: statusOf(p.id, o?.solvedMs ?? null, o?.rows.length ?? 0), solvedMs: o?.solvedMs ?? null };
    }),
  ];

  return (
    <div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
      <PlayersCard rows={playerRows} />

      <div className="flex w-full max-w-lg flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="extrabold-display-xs font-display" data-testid="round-label">
            Round {match.round} of {match.totalRounds}
          </h2>
          <RoundTimer endsAt={match.endsAt} offset={match.offset} />
        </div>

        <p role="status" aria-live="polite" className={`bold-text-sm min-h-5 text-center ${match.solvedMs !== null ? "text-success" : done ? "" : "text-invalid"}`}>
          {match.solvedMs !== null
            ? `Solved in ${formatDuration(match.solvedMs)}. Waiting for the others…`
            : done
              ? "Out of guesses. Waiting for the others…"
              : match.message}
        </p>

        <Grid rows={match.rows} input={match.input} maxGuesses={MAX_GUESSES} shake={match.rejections} solvedRow={match.solvedMs !== null ? match.rows.length - 1 : null} />
        <div className={done ? "opacity-50" : ""}>
          <Keyboard colours={match.keyColours} onLetter={onLetter} onEnter={onEnter} onBackspace={onBackspace} disabled={reconnecting || done} />
        </div>
      </div>

      {opponents.length > 0 && (
        <section aria-label="Opponents" className="flex w-full max-w-lg flex-col gap-2 lg:w-60">
          <h3 className="bold-text-xs tracking-wider text-muted uppercase">Opponents</h3>
          <ul className="grid grid-cols-2 gap-2.5 min-[380px]:grid-cols-3 lg:grid-cols-1">
            {opponents.map((p) => (
              <OpponentBoard
                key={p.id}
                id={p.id}
                name={p.name}
                rows={match.opponents[p.id]?.rows ?? []}
                solvedMs={match.opponents[p.id]?.solvedMs ?? null}
                left={!inLobby.has(p.id)}
                away={away.has(p.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
