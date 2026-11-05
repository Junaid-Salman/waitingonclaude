"use client";

import { useCallback, useEffect, useRef } from "react";
import { buttonClasses, focusClasses } from "@/lib/colors";
import { connectSolo, type SoloConnection } from "@/lib/woordle/solo-client";
import { useKeyboardInput } from "@/lib/woordle/use-keyboard-input";
import { useWoordle } from "@/lib/woordle/store";
import { Grid } from "./Grid";
import { Keyboard } from "./Keyboard";

export function SoloGame() {
  const { status, rows, input, maxGuesses, keyColours, message, answer, rejections } = useWoordle();
  const connection = useRef<SoloConnection | null>(null);

  useEffect(() => {
    connection.current = connectSolo();
    return () => {
      connection.current?.close();
      connection.current = null;
    };
  }, []);

  const onLetter = useCallback((letter: string) => useWoordle.getState().type(letter), []);
  const onBackspace = useCallback(() => useWoordle.getState().backspace(), []);
  const onEnter = useCallback(() => {
    const word = useWoordle.getState().submit();
    if (word) connection.current?.send({ type: "guess", word });
  }, []);

  useKeyboardInput({ onLetter, onEnter, onBackspace });

  const finished = status === "won" || status === "lost";

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-4 py-3 sm:gap-4 sm:py-6">
      {/* Under 740 px of height (short phones, small laptop windows) the title bar goes to screen
          readers only, so the board and keyboard still fit below the header. */}
      <div className="flex items-center justify-between [@media(max-height:739px)]:sr-only">
        <h1 className="extrabold-display-xs font-display">Solo</h1>
        <span className="bold-text-xs rounded-full border-2 border-foreground bg-sunken px-2.5 py-0.5">
          {rows.length}/{maxGuesses}
        </span>
      </div>

      <p role="status" aria-live="polite" className={`bold-text-sm min-h-6 text-center ${message && status === "playing" ? "text-invalid" : ""}`}>
        {status === "connecting" && !message ? "Connecting…" : message}
      </p>

      <Grid rows={rows} input={input} maxGuesses={maxGuesses} shake={rejections} solvedRow={status === "won" ? rows.length - 1 : null} />

      {finished ? (
        <div className="mx-auto flex flex-col items-center gap-3 text-center" data-testid="end-panel">
          <p className="bold-text-lg">
            {status === "won" ? `You got it in ${rows.length}!` : "Out of guesses."}
          </p>
          {status === "lost" && answer && (
            <p>
              The word was <strong className="uppercase">{answer}</strong>.
            </p>
          )}
          <button
            type="button"
            className={`bold-text-md rounded-xl px-5 py-3 ${buttonClasses} ${focusClasses}`}
            onClick={() => connection.current?.send({ type: "newGame" })}
          >
            Play again
          </button>
        </div>
      ) : (
        <Keyboard colours={keyColours} onLetter={onLetter} onEnter={onEnter} onBackspace={onBackspace} />
      )}
    </main>
  );
}
