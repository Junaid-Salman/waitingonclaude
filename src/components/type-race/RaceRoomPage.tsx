"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RECONNECT_GRACE_MS } from "../../../shared/protocol";
import { isRoomCode } from "../../../shared/room-code";
import { focusClasses, secondaryButtonClasses } from "@/lib/colors";
import { LogoMark } from "@/components/Logo";
import { LeaveConfirm } from "@/components/room/LeaveConfirm";
import { NameForm } from "@/components/room/NameForm";
import { RoomError } from "@/components/room/RoomError";
import { isPlainClick } from "@/lib/room/leave";
import { browserSession } from "@/lib/room/session";
import { needsRaceLeaveConfirm } from "@/lib/type-race/leave";
import { useRaceLobby } from "@/lib/type-race/lobby-store";
import { useRace } from "@/lib/type-race/race-store";
import { connectRaceRoom, type RaceRoomConnection } from "@/lib/type-race/room-client";
import { RaceLobby } from "./RaceLobby";
import { RaceScreen } from "./RaceScreen";

interface Joining {
  name: string;
  attempt: number;
}

const subscribe = () => () => {};
const GAME = "type-race" as const;

// The Type Race twin of RoomPage, with the DI-1 fix pattern built in: `leaving` is reset at the top
// of the connection effect, and leave() forgets the chosen name, so Back (the page is kept mounted
// but hidden under cacheComponents) shows the prefilled name form instead of silently re-joining.
export function RaceRoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const valid = isRoomCode(code);

  // False while the shell prerenders and during hydration; sessionStorage is read only afterwards.
  const onClient = useSyncExternalStore(subscribe, () => true, () => false);
  const initial = useMemo(() => {
    if (!onClient) return null;
    const session = browserSession();
    const name = session.name();
    return { name: name ?? "", rejoin: name !== null && session.joinedRoom(GAME) === code };
  }, [onClient, code]);

  const [chosen, setChosen] = useState<Joining | null>(null);
  // Set by leave(); cleared when a name is chosen again. Without it a refresh-style auto rejoin
  // (from `initial`) would walk back into the room after Back.
  const [left, setLeft] = useState(false);
  // The name used before leaving, so the form after Back is prefilled with it.
  const [lastName, setLastName] = useState<string | null>(null);
  const joining: Joining | null = chosen ?? (initial?.rejoin && !left ? { name: initial.name, attempt: 0 } : null);

  const connection = useRef<RaceRoomConnection | null>(null);
  const router = useRouter();
  const { status, players, phase, races, length, youId, error, reconnecting } = useRaceLobby();
  const stage = useRace((s) => s.stage);

  const joiningName = joining?.name ?? null;
  const attempt = joining?.attempt ?? 0;
  const leaving = useRef(false);

  useEffect(() => {
    if (!valid || joiningName === null) return;
    leaving.current = false; // DI-1: a page shown again after Back may leave again
    const conn = connectRaceRoom({ code, playerId: browserSession().playerId(), name: joiningName });
    connection.current = conn;
    return () => {
      conn.close();
      connection.current = null;
      useRaceLobby.getState().reset();
      useRace.getState().reset();
    };
  }, [valid, code, joiningName, attempt]);

  useEffect(() => {
    if (status === "joined" && joiningName) browserSession().remember(code, joiningName, GAME);
  }, [status, code, joiningName]);

  const retry = () => joining && setChosen({ ...joining, attempt: joining.attempt + 1 });

  const leave = (to: string) => {
    if (leaving.current) return; // a double click sends one leave
    leaving.current = true;
    connection.current?.send({ type: "leave" });
    connection.current?.close();
    browserSession().forgetRoom(GAME);
    setLastName(joiningName);
    setChosen(null);
    setLeft(true);
    router.push(to);
  };
  const [confirmTo, setConfirmTo] = useState<string | null>(null);
  const requestLeave = (to: string) => (needsRaceLeaveConfirm({ status, phase, stage }) ? setConfirmTo(to) : leave(to));

  const send = (message: Parameters<RaceRoomConnection["send"]>[0]) => connection.current?.send(message);

  let content;
  if (!valid) {
    content = <RoomError code="room-not-found" game={GAME} onRetry={retry} />;
  } else if (!initial) {
    content = <p className="regular-text-md text-muted">Loading…</p>;
  } else if (!joining || (status === "error" && error === "invalid-name")) {
    content = (
      <NameForm
        code={code}
        initialName={joining?.name ?? lastName ?? initial.name}
        notice={error === "invalid-name" ? "Use a name with at least one letter, number or emoji." : undefined}
        onSubmit={(name) => {
          setLeft(false);
          setChosen({ name, attempt: (joining?.attempt ?? 0) + 1 });
        }}
      />
    );
  } else if (status === "error" && error && error !== "invalid-name") {
    content = <RoomError code={error} game={GAME} onRetry={retry} />;
  } else if (status === "joined" && phase === "match") {
    content = <RaceScreen send={(m) => send(m)} onPlayAgain={() => send({ type: "playAgain" })} onBack={() => requestLeave("/type-race")} />;
  } else if (status === "joined") {
    content = (
      <RaceLobby
        code={code}
        players={players}
        youId={youId}
        races={races}
        length={length}
        onSettings={(settings) => send({ type: "settings", ...settings })}
        onStart={() => send({ type: "start" })}
        offline={reconnecting}
      />
    );
  } else {
    content = <p className="regular-text-md text-muted">Joining room {code}…</p>;
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 px-4 py-3 sm:px-12 sm:py-5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="WaitingOnClaude home"
            className={`rounded ${focusClasses}`}
            onClick={(event) => {
              // With a seat, the logo is a way out of the room: free the seat instead of holding it.
              if (status !== "joined" || !isPlainClick(event)) return;
              event.preventDefault();
              requestLeave("/");
            }}
          >
            <LogoMark heavy className="size-9" />
          </Link>
          {valid && (
            <>
              <span className="regular-text-md text-muted">Room</span>
              <span className="bold-text-md tracking-widest">{code}</span>
            </>
          )}
        </div>
        {status === "joined" && (
          <div className="relative flex flex-col items-end">
            <button type="button" onClick={() => requestLeave("/type-race")} className={`bold-text-sm rounded-xl px-3.5 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
              Leave room
            </button>
            {reconnecting && (
              <p className="regular-text-xs mt-1 max-w-36 text-right text-muted sm:absolute sm:top-full sm:right-0 sm:w-44 sm:max-w-none" data-testid="leave-hint">
                Your seat frees about {RECONNECT_GRACE_MS / 1000} s after the drop.
              </p>
            )}
          </div>
        )}
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 pb-8 sm:px-12">
        {status === "joined" && phase === "match" && <h1 className="sr-only">Type Race match</h1>}
        <p role="status" aria-live="polite" className="bold-text-sm min-h-5 text-center text-muted" data-testid="connection-status">
          {reconnecting ? `Connection lost. Reconnecting… your seat is held for ${RECONNECT_GRACE_MS / 1000} seconds.` : ""}
        </p>
        {content}
      </main>
      <LeaveConfirm
        open={confirmTo !== null}
        onStay={() => setConfirmTo(null)}
        onLeave={() => {
          const to = confirmTo ?? "/type-race";
          setConfirmTo(null);
          leave(to);
        }}
      />
    </>
  );
}
