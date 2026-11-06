"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TypeRaceClientMessage } from "../../../shared/type-race-protocol";
import { splitWords } from "../../../shared/type-race/passage";
import { accuracy as accuracyOf, wpm as wpmOf } from "../../../shared/type-race/stats";
import { cardClasses } from "@/lib/colors";
import { toServerTime } from "@/lib/room/clock";
import { useNow } from "@/lib/use-now";
import { correctKeystrokes, type EngineAction } from "@/lib/type-race/engine";
import { useRaceLobby } from "@/lib/type-race/lobby-store";
import { createProgressSender } from "@/lib/type-race/progress-sender";
import { stageAt, useRace } from "@/lib/type-race/race-store";
import { CapsLockWarning } from "./CapsLockWarning";
import { Countdown } from "./Countdown";
import { LiveStats } from "./LiveStats";
import { MatchResults } from "./MatchResults";
import { PassagePanel } from "./PassagePanel";
import { RaceResults } from "./RaceResults";
import { RaceTrack } from "./RaceTrack";
import { TypingInput } from "./TypingInput";

interface Props {
  send(message: TypeRaceClientMessage): void;
  onPlayAgain(): void;
  onBack(): void;
}

export function RaceScreen({ send, onPlayAgain, onBack }: Props) {
  const race = useRace();
  const { players, youId, reconnecting } = useRaceLobby();
  const now = useNow();
  const [caps, setCaps] = useState(false);
  // Re-renders at the exact start moment, so typing unlocks on time instead of at the next 250 ms tick.
  const [, unlockTick] = useState(0);

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  const sender = useRef<ReturnType<typeof createProgressSender> | null>(null);

  // One sender per race, wired to the server's acknowledgement and refusals.
  const raceNo = race.race;
  useEffect(() => {
    if (raceNo === 0) return;
    const s = createProgressSender({
      now: () => Date.now(),
      setTimer: (ms, fn) => {
        const handle = setTimeout(fn, ms);
        return () => clearTimeout(handle);
      },
      send: (message) => sendRef.current(message),
    });
    sender.current = s;
    const unsubscribe = useRace.subscribe((state, prev) => {
      if (state.ackedWords !== prev.ackedWords) s.ack(state.ackedWords);
      if (state.rejections !== prev.rejections) s.rejected();
    });
    return () => {
      unsubscribe();
      s.stop();
      sender.current = null;
    };
  }, [raceNo]);

  const startAt = race.startAt;
  const offset = race.offset;
  useEffect(() => {
    if (race.stage !== "countdown") return;
    const wait = startAt - toServerTime(Date.now(), offset);
    if (wait <= 0) return;
    const handle = setTimeout(() => unlockTick((n) => n + 1), wait);
    return () => clearTimeout(handle);
  }, [race.stage, startAt, offset]);

  const onAction = useCallback((action: EngineAction) => {
    const before = useRace.getState().engine;
    const next = useRace.getState().input(action, Date.now());
    // Progress goes out when a word locks; the server needs nothing between words.
    if (next && before && next.wordIndex !== before.wordIndex) {
      sender.current?.update({ words: next.wordIndex, keystrokes: next.keystrokes, errors: next.errors }, next.finished);
    }
  }, []);

  const isHost = players.some((p) => p.isHost && p.id === youId);
  if (race.stage === "idle" || !race.engine || race.passage === null) {
    // The room says a match is running and the snapshot that redraws it is on its way.
    return <p className="regular-text-md text-muted">Rejoining the match…</p>;
  }
  if (race.stage === "finished" && race.standings) {
    return <MatchResults standings={race.standings} youId={youId} isHost={isHost} onPlayAgain={onPlayAgain} onBack={onBack} offline={reconnecting} />;
  }
  if (race.stage === "results" && race.raceEnd) {
    return <RaceResults end={race.raceEnd} roster={race.roster} youId={youId} totalRaces={race.totalRaces} offset={race.offset} />;
  }

  const stage = stageAt(race, now);
  const engine = race.engine;
  const words = splitWords(race.passage);
  const total = race.passage.length;
  const shareOfWords = (n: number) => (total === 0 ? 0 : words.slice(0, n).join("").length / total);
  const serverNow = toServerTime(now, race.offset);
  const elapsed = Math.max(0, serverNow - race.startAt);
  const away = new Set(players.filter((p) => !p.connected).map((p) => p.id));
  const ownWpm = wpmOf(engine.lockedChars, race.ownFinishedMs ?? elapsed);
  const done = engine.finished;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <p className="bold-text-md" data-testid="race-label">
        Race {race.race} of {race.totalRaces}
      </p>
      <RaceTrack
        roster={race.roster}
        progress={race.progress}
        youId={youId}
        ownShare={total === 0 ? 0 : engine.lockedChars / total}
        ownWpm={ownWpm}
        shareOf={shareOfWords}
        away={away}
      />
      <section aria-label="Your race" className={`flex flex-col gap-4 p-5 sm:p-7 ${cardClasses}`}>
        {stage === "countdown" && <Countdown remainingMs={race.startAt - serverNow} />}
        <PassagePanel engine={engine} />
        {done ? (
          <p role="status" className="bold-text-md" data-testid="finished-note">
            {race.ownFinishedMs !== null ? `You finished in ${(race.ownFinishedMs / 1000).toFixed(1)} s. ` : "Finished. "}
            Waiting for the others…
          </p>
        ) : (
          <>
            <CapsLockWarning on={caps} />
            <TypingInput typed={engine.typed} invalid={engine.firstError !== null} locked={stage !== "racing" || reconnecting} onAction={onAction} onCapsLock={setCaps} />
          </>
        )}
        <LiveStats
          wpm={ownWpm}
          accuracy={accuracyOf(correctKeystrokes(engine), engine.keystrokes)}
          remainingMs={stage === "countdown" ? race.endAt - race.startAt : race.endAt - serverNow}
        />
      </section>
    </div>
  );
}
