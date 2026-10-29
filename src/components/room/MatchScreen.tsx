"use client";

import { useCallback } from "react";
import { MAX_GUESSES } from "../../../shared/protocol";
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

export function MatchScreen({ onGuess, onPlayAgain }: Props) {
  const match = useMatch();
  const { players, youId } = useRoom();
  const isHost = players.some((p) => p.isHost && p.id === youId);
  const inLobby = new Set(players.map((p) => p.id));

  const onLetter = useCallback((letter: string) => useMatch.getState().type(letter), []);
  const onBackspace = useCallback(() => useMatch.getState().backspace(), []);
  const onEnter = useCallback(() => {
    const word = useMatch.getState().submit();
    if (word) onGuess(word);
  }, [onGuess]);
  useKeyboardInput({ enabled: match.stage === "playing", onLetter, onEnter, onBackspace });

  if (match.stage === "idle") {
    // The room says a match is running but no round has reached this tab (it joined mid-match).
    return <p className="regular-text-md text-muted">Reconnecting to the match…</p>;
  }
  if (match.stage === "finished" && match.ranking) {
    return <MatchSummary ranking={match.ranking} youId={youId} isHost={isHost} onPlayAgain={onPlayAgain} />;
  }
  if (match.stage === "reveal" && match.roundEnd) {
    return <RoundSummary info={match.roundEnd} roster={match.roster} youId={youId} totalRounds={match.totalRounds} offset={match.offset} />;
  }

  const done = isDone(match);
  const opponents = match.roster.filter((p) => p.id !== youId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="semibold-text-lg" data-testid="round-label">
          Round {match.round} of {match.totalRounds}
        </h2>
        <RoundTimer endsAt={match.endsAt} offset={match.offset} />
      </div>

      <p role="status" aria-live="polite" className="regular-text-sm min-h-5 text-center">
        {match.solvedMs !== null
          ? `Solved in ${formatDuration(match.solvedMs)}. Waiting for the others…`
          : done
            ? "Out of guesses. Waiting for the others…"
            : match.message}
      </p>

      <Grid rows={match.rows} input={match.input} maxGuesses={MAX_GUESSES} />
      <Keyboard colours={match.keyColours} onLetter={onLetter} onEnter={onEnter} onBackspace={onBackspace} />

      {opponents.length > 0 && (
        <section aria-label="Opponents" className="flex flex-col gap-2">
          <h3 className="semibold-text-md">Opponents</h3>
          <ul className="grid grid-cols-2 gap-2">
            {opponents.map((p) => (
              <OpponentBoard
                key={p.id}
                id={p.id}
                name={p.name}
                rows={match.opponents[p.id]?.rows ?? []}
                solvedMs={match.opponents[p.id]?.solvedMs ?? null}
                left={!inLobby.has(p.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
