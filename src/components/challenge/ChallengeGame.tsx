"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { MAX_GUESSES } from "../../../shared/protocol";
import { connectChallenge, type ChallengeConnection } from "@/lib/challenge/challenge-client";
import { isPlausibleToken } from "@/lib/challenge/link";
import { isDone, useChallenge } from "@/lib/challenge/store";
import { buttonClasses, cardClasses, focusClasses, hostBadgeClasses, secondaryButtonClasses } from "@/lib/colors";
import { LetterTiles } from "@/components/woordle/LetterTiles";
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
    <section aria-label="Round result" data-testid="round-summary" className={`flex w-full max-w-lg flex-col items-center gap-3 p-5 text-center sm:p-8 ${cardClasses}`}>
      <h2 ref={heading} tabIndex={-1} className="bold-text-xs tracking-wider text-muted uppercase outline-none">
        Word {roundEnd.round} of {totalRounds}
      </h2>
      <p>
        <LetterTiles letters={roundEnd.answer} label={`The word was ${roundEnd.answer.toUpperCase()}.`} testId="round-answer" />
      </p>
      <p className={`extrabold-display-xs font-display ${roundEnd.solvedMs !== null ? "text-success" : ""}`}>
        {roundEnd.solvedMs !== null
          ? `Solved in ${formatDuration(roundEnd.solvedMs)} with ${roundEnd.guesses} ${roundEnd.guesses === 1 ? "guess" : "guesses"}.`
          : "Not solved."}
      </p>
      <p className="bold-text-sm text-muted" data-testid="next-countdown">
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
      <div className={`flex w-full max-w-md flex-col items-start gap-4 p-5 sm:p-8 ${cardClasses}`} data-testid="challenge-expired">
        <h1 className="extrabold-display-sm font-display">This challenge link has expired</h1>
        <p className="regular-text-md text-muted">The link is broken, was cut short, or the challenge was retired.</p>
        <Link href="/woordle/challenge/new" className={`bold-text-md rounded-xl px-5 py-3 ${secondaryButtonClasses} ${focusClasses}`}>
          Make your own challenge
        </Link>
      </div>
    );
  }
  if (state.stage === "unavailable") {
    return (
      <div className={`flex w-full max-w-md flex-col items-start gap-4 p-5 sm:p-8 ${cardClasses}`} data-testid="challenge-unavailable">
        <h1 className="extrabold-display-sm font-display">Challenges are unavailable right now</h1>
        <p className="regular-text-md text-muted">Try this link again in a little while.</p>
        <Link href="/woordle" className={`bold-text-md rounded-xl px-5 py-3 ${secondaryButtonClasses} ${focusClasses}`}>
          Back to Woordle
        </Link>
      </div>
    );
  }
  // The start and error screens show a visible h1; the run itself gets this one (L2).
  const title = <h1 className="sr-only">Woordle challenge</h1>;
  if (state.stage === "finished" && state.summary) {
    return (
      <>
        {title}
        <ChallengeSummary summary={state.summary} onPlayAgain={begin} />
      </>
    );
  }
  if (state.stage === "reveal")
    return (
      <>
        {title}
        <Reveal />
      </>
    );

  if (state.stage === "playing") {
    const done = isDone(state);
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 sm:gap-4">
        {title}
        <div className="flex items-center justify-between gap-4">
          <h2 className="extrabold-display-xs font-display" data-testid="round-label">
            Word {state.round} of {state.totalRounds}
          </h2>
          <RoundTimer endsAt={state.endsAt} offset={state.offset} />
        </div>
        <p role="status" aria-live="polite" className={`bold-text-sm min-h-5 text-center ${state.solvedMs !== null ? "text-success" : done ? "" : "text-invalid"}`}>
          {state.solvedMs !== null ? `Solved in ${formatDuration(state.solvedMs)}!` : done ? "Out of guesses." : state.message}
        </p>
        <Grid rows={state.rows} input={state.input} maxGuesses={MAX_GUESSES} shake={state.rejections} solvedRow={state.solvedMs !== null ? state.rows.length - 1 : null} />
        <Keyboard colours={state.keyColours} onLetter={onLetter} onEnter={onEnter} onBackspace={onBackspace} />
      </div>
    );
  }

  return (
    <div className={`flex w-full max-w-md flex-col items-center gap-4 p-5 text-center sm:p-8 ${cardClasses}`}>
      <span className={`bold-text-xs rounded-full px-2.5 py-0.5 ${hostBadgeClasses}`}>Sealed link</span>
      <h1 className="extrabold-display-sm sm:extrabold-display-lg font-display">Woordle challenge</h1>
      <p className="regular-text-md text-muted">
        Someone sent you 5 words. Solve each one before its timer runs out. Each word is revealed when its round ends.
      </p>
      <p role="status" aria-live="polite" className="bold-text-sm min-h-5">
        {state.stage === "connecting" ? "Connecting…" : state.message}
      </p>
      <button
        type="button"
        onClick={begin}
        disabled={state.stage === "connecting"}
        className={`bold-text-md self-stretch rounded-xl px-5 py-3 disabled:opacity-50 ${buttonClasses} ${focusClasses}`}
      >
        Start
      </button>
    </div>
  );
}
