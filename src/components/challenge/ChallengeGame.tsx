"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { MAX_GUESSES } from "../../../shared/protocol";
import { connectChallenge, type ChallengeConnection } from "@/lib/challenge/challenge-client";
import { isPlausibleToken } from "@/lib/challenge/link";
import { isDone, useChallenge } from "@/lib/challenge/store";
import { buttonClasses, focusClasses, secondaryButtonClasses } from "@/lib/colors";
import { formatCountdown, formatDuration, remainingMs } from "@/lib/room/clock";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";
import { useNow } from "@/lib/use-now";
import { useKeyboardInput } from "@/lib/woordle/use-keyboard-input";
import { RoundTimer } from "@/components/room/RoundTimer";
import { Grid } from "@/components/woordle/Grid";
import { Keyboard } from "@/components/woordle/Keyboard";
import { ChallengeSummary } from "./ChallengeSummary";

// Far above a normal connect; the solver can press Start again, which opens a fresh socket.
const CONNECT_TIMEOUT_MS = 10_000;

function Reveal() {
  const { roundEnd, totalRounds, offset } = useChallenge();
  const now = useNow();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  if (!roundEnd) return null;
  const last = roundEnd.round >= totalRounds;
  return (
    <section aria-label="Round result" data-testid="round-summary" className="flex flex-col gap-3">
      <h2 ref={heading} tabIndex={-1} className="semibold-display-xs outline-none">
        Word {roundEnd.round} of {totalRounds}
      </h2>
      <p className="regular-text-md">
        The word was <strong data-testid="round-answer" className="uppercase">{roundEnd.answer}</strong>.
      </p>
      <p className="regular-text-md">
        {roundEnd.solvedMs !== null
          ? `Solved in ${formatDuration(roundEnd.solvedMs)} with ${roundEnd.guesses} ${roundEnd.guesses === 1 ? "guess" : "guesses"}.`
          : "Not solved."}
      </p>
      <p className="regular-text-sm text-muted" data-testid="next-countdown">
        {last ? "Results in " : "Next word in "}
        {now === 0 ? "…" : formatCountdown(remainingMs(roundEnd.nextAt, now, offset))}
      </p>
    </section>
  );
}

export function ChallengeGame({ token }: { token: string }) {
  const state = useChallenge();
  const connection = useRef<ChallengeConnection | null>(null);

  // The socket opens on the first Start, so merely opening a link costs nothing.
  const begin = useCallback(() => {
    const { stage } = useChallenge.getState();
    if (stage === "connecting" || stage === "playing" || stage === "reveal") return;
    // A mangled link cannot be a challenge: say so now, without opening a socket.
    if (!isPlausibleToken(token)) {
      useChallenge.getState().expire();
      return;
    }
    connection.current ??= connectChallenge();
    useChallenge.getState().beginning();
    connection.current.send({ type: "begin", token });
  }, [token]);

  useEffect(() => {
    useChallenge.getState().reset();
    return () => {
      connection.current?.close();
      connection.current = null;
    };
  }, []);

  // If the server never answers Start, go back to the Start screen. The connection is closed and
  // dropped so a begin still queued on it cannot start a run behind an idle screen later.
  useEffect(() => {
    if (state.stage !== "connecting") return;
    const timer = setTimeout(() => {
      useChallenge.getState().connectTimedOut();
      connection.current?.close();
      connection.current = null;
    }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.stage]);

  const onLetter = useCallback((letter: string) => useChallenge.getState().type(letter), []);
  const onBackspace = useCallback(() => useChallenge.getState().backspace(), []);
  const onEnter = useCallback(() => {
    const word = useChallenge.getState().submit();
    if (word) connection.current?.send({ type: "guess", word });
  }, []);
  useKeyboardInput({ enabled: state.stage === "playing", onLetter, onEnter, onBackspace });

  if (state.stage === "expired") {
    return (
      <div className="flex flex-col items-start gap-4" data-testid="challenge-expired">
        <h1 className="semibold-display-xs">This challenge link has expired</h1>
        <p className="regular-text-md text-muted">The link is broken, was cut short, or the challenge was retired.</p>
        <Link href="/woordle/challenge/new" className={`semibold-text-md rounded px-4 py-2 ${buttonClasses} ${focusClasses}`}>
          Make your own
        </Link>
      </div>
    );
  }
  if (state.stage === "unavailable") {
    return (
      <div className="flex flex-col items-start gap-4" data-testid="challenge-unavailable">
        <h1 className="semibold-display-xs">Challenges are unavailable right now</h1>
        <p className="regular-text-md text-muted">Try this link again in a little while.</p>
        <Link href="/woordle" className={`semibold-text-md rounded px-4 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
          Back to Woordle
        </Link>
      </div>
    );
  }
  if (state.stage === "finished" && state.summary) {
    return <ChallengeSummary summary={state.summary} onPlayAgain={begin} />;
  }
  if (state.stage === "reveal") return <Reveal />;

  if (state.stage === "playing") {
    const done = isDone(state);
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="semibold-text-lg" data-testid="round-label">
            Word {state.round} of {state.totalRounds}
          </h2>
          <RoundTimer endsAt={state.endsAt} offset={state.offset} />
        </div>
        <p role="status" aria-live="polite" className="regular-text-sm min-h-5 text-center">
          {state.solvedMs !== null ? `Solved in ${formatDuration(state.solvedMs)}!` : done ? "Out of guesses." : state.message}
        </p>
        <Grid rows={state.rows} input={state.input} maxGuesses={MAX_GUESSES} shake={state.rejections} solvedRow={state.solvedMs !== null ? state.rows.length - 1 : null} />
        <Keyboard colours={state.keyColours} onLetter={onLetter} onEnter={onEnter} onBackspace={onBackspace} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="semibold-display-xs">Woordle challenge</h1>
      <p className="regular-text-md">
        Someone sent you 5 words. Solve each one before its timer runs out. Each word is revealed when its round ends.
      </p>
      <p role="status" aria-live="polite" className="regular-text-sm min-h-5">
        {state.stage === "connecting" ? "Connecting…" : state.message}
      </p>
      <button
        type="button"
        onClick={begin}
        disabled={state.stage === "connecting"}
        className={`semibold-text-md rounded px-4 py-2 disabled:opacity-60 ${buttonClasses} ${focusClasses}`}
      >
        Start
      </button>
    </div>
  );
}
