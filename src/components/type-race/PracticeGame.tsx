"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import { accuracy as accuracyOf, round1, wpm as wpmOf } from "../../../shared/type-race/stats";
import { buttonClasses, cardClasses, focusClasses } from "@/lib/colors";
import { formatDuration } from "@/lib/room/clock";
import { useFocusOnMount } from "@/lib/use-focus-on-mount";
import { useNow } from "@/lib/use-now";
import { correctKeystrokes, type EngineAction } from "@/lib/type-race/engine";
import { practiceStore, type PracticeError, type PracticeResult } from "@/lib/type-race/practice-store";
import { CapsLockWarning } from "./CapsLockWarning";
import { Countdown } from "./Countdown";
import { DesktopNotice } from "./DesktopNotice";
import { LiveStats } from "./LiveStats";
import { PassagePanel } from "./PassagePanel";
import { PassageSize } from "./PassageSize";
import { TypingInput } from "./TypingInput";

const ERROR_TEXT: Record<PracticeError, string> = {
  unreachable: "Can't reach the game server.",
  "rate-limited": "Too many passages requested. Wait a few seconds.",
  "bad-response": "The server sent something unexpected.",
};

const primary = `bold-text-md rounded-xl px-5 py-3 ${buttonClasses} ${focusClasses}`;

function Results({ result, onNext, children }: { result: PracticeResult; onNext(): void; children: React.ReactNode }) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <div className="flex flex-col gap-5" data-testid="practice-results">
      <h2 ref={heading} tabIndex={-1} className="extrabold-display-sm font-display outline-none">
        {result.timedOut ? "Time's up" : "Done!"}
      </h2>
      <dl className="grid grid-cols-3 gap-2.5 text-center">
        {[
          ["WPM", String(round1(result.wpm)), "result-wpm"],
          ["Accuracy", `${round1(result.accuracy * 100)}%`, "result-accuracy"],
          ["Time", formatDuration(result.timeMs), "result-time"],
        ].map(([label, value, id]) => (
          <div key={id} className="flex flex-col items-center rounded-xl border-2 border-foreground bg-sunken px-4 py-3">
            <dt className="bold-text-xs tracking-wider text-muted uppercase">{label}</dt>
            <dd className="extrabold-display-sm font-display" data-testid={id}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {result.timedOut && <p className="regular-text-md text-muted">You got through {Math.floor(result.progress * 100)}% of the passage.</p>}
      {children}
      <button type="button" className={`${primary} self-start`} onClick={onNext}>
        Next passage
      </button>
    </div>
  );
}

export function PracticeGame() {
  const { stage, length, engine, error, startAt, endAt, result } = useStore(practiceStore);
  const now = useNow();
  const [caps, setCaps] = useState(false);

  // The store is module-wide and the page can stay mounted but hidden (cacheComponents), so each
  // visit starts from the picker and leaves no timer behind.
  useEffect(() => {
    practiceStore.getState().reset();
    practiceStore.getState().loadSize();
    return () => practiceStore.getState().reset();
  }, []);

  const onAction = useCallback((action: EngineAction) => practiceStore.getState().input(action), []);
  const start = () => void practiceStore.getState().start();

  const live = stage === "countdown" || stage === "running";
  const elapsed = Math.max(0, now - startAt);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4 sm:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="extrabold-display-sm font-display">Practice</h1>
        <p className="regular-text-md text-muted">One passage, on your own. Type it exactly; fix a mistake with Backspace before you go on.</p>
      </div>
      <DesktopNotice />

      <section aria-label="Practice" className={`flex flex-col gap-5 p-5 sm:p-7 ${cardClasses}`}>
        {(stage === "choose" || stage === "loading" || stage === "error") && (
          <>
            <PassageSize value={length} onChange={(l) => practiceStore.getState().setLength(l)} disabled={stage === "loading"} />
            {stage === "error" && error && (
              <p role="alert" className="bold-text-md text-invalid">
                {ERROR_TEXT[error]}
              </p>
            )}
            <p role="status" className="regular-text-md min-h-6 text-muted">
              {stage === "loading" ? "Loading a passage…" : ""}
            </p>
            <button type="button" className={`${primary} self-start disabled:opacity-50`} disabled={stage === "loading"} onClick={start}>
              {stage === "error" ? "Retry" : "Start typing"}
            </button>
          </>
        )}

        {live && engine && (
          <>
            {stage === "countdown" && <Countdown remainingMs={startAt - now} />}
            <PassagePanel engine={engine} />
            <CapsLockWarning on={caps} />
            <TypingInput typed={engine.typed} invalid={engine.firstError !== null} locked={stage !== "running"} onAction={onAction} onCapsLock={setCaps} />
            <LiveStats
              wpm={wpmOf(engine.lockedChars, elapsed)}
              accuracy={accuracyOf(correctKeystrokes(engine), engine.keystrokes)}
              remainingMs={stage === "running" ? endAt - now : endAt - startAt}
            />
          </>
        )}

        {stage === "done" && result && (
          <Results result={result} onNext={start}>
            <PassageSize value={length} onChange={(l) => practiceStore.getState().setLength(l)} />
          </Results>
        )}
      </section>
    </main>
  );
}
