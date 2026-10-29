"use client";

import { useCallback, useEffect, useRef } from "react";
import { connectSolo, type SoloConnection } from "@/lib/woordle/solo-client";
import { useWoordle } from "@/lib/woordle/store";
import { Grid } from "./Grid";
import { Keyboard } from "./Keyboard";

export function SoloGame() {
  const { status, rows, input, maxGuesses, keyColours, message, answer } = useWoordle();
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Enter") {
        // Stops Enter from also clicking whichever on-screen key has focus.
        event.preventDefault();
        onEnter();
      } else if (event.key === "Backspace") {
        onBackspace();
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        onLetter(event.key.toLowerCase());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEnter, onBackspace, onLetter]);

  const finished = status === "won" || status === "lost";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-center text-2xl font-semibold tracking-tight">Woordle</h1>

      <p role="status" aria-live="polite" className="min-h-6 text-center text-sm">
        {status === "connecting" && !message ? "Connecting…" : message}
      </p>

      <Grid rows={rows} input={input} maxGuesses={maxGuesses} />

      {finished ? (
        <div className="mx-auto flex flex-col items-center gap-3 text-center" data-testid="end-panel">
          <p className="text-lg font-medium">
            {status === "won" ? `You got it in ${rows.length}!` : "Out of guesses."}
          </p>
          {status === "lost" && answer && (
            <p>
              The word was <strong className="uppercase">{answer}</strong>.
            </p>
          )}
          <button
            type="button"
            className="rounded bg-tile-correct px-4 py-2 font-semibold text-white"
            onClick={() => connection.current?.send({ type: "newGame" })}
          >
            Play again
          </button>
        </div>
      ) : (
        <Keyboard colours={keyColours} onLetter={onLetter} onEnter={onEnter} onBackspace={onBackspace} />
      )}
    </div>
  );
}
