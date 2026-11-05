"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isRoomCode } from "../../../shared/room-code";
import { RECONNECT_GRACE_MS, type RoundSeconds } from "../../../shared/protocol";
import { connectRoom, type RoomConnection } from "@/lib/room/room-client";
import { browserSession } from "@/lib/room/session";
import { useRoom } from "@/lib/room/store";
import { useMatch } from "@/lib/room/match-store";
import { isPlainClick, needsLeaveConfirm } from "@/lib/room/leave";
import { focusClasses } from "@/lib/colors";
import { LogoMark } from "@/components/Logo";
import { LeaveButton } from "./LeaveButton";
import { LeaveConfirm } from "./LeaveConfirm";
import { Lobby } from "./Lobby";
import { MatchScreen } from "./MatchScreen";
import { NameForm } from "./NameForm";
import { RoomError } from "./RoomError";

interface Joining {
  name: string;
  attempt: number;
}

const subscribe = () => () => {};

export function RoomPage() {
  const params = useParams<{ code: string }>();
  // A pasted lowercase link still works: codes are uppercase everywhere.
  const code = params.code.toUpperCase();
  const valid = isRoomCode(code);

  // False while the shell prerenders and during hydration, true afterwards. sessionStorage only
  // exists in the browser, so it is read only once this is true.
  const onClient = useSyncExternalStore(subscribe, () => true, () => false);
  const initial = useMemo(() => {
    if (!onClient) return null;
    const session = browserSession();
    const name = session.name();
    // Same room as last time in this tab (a refresh): rejoin without asking for the name again.
    return { name: name ?? "", rejoin: name !== null && session.joinedRoom() === code };
  }, [onClient, code]);

  const [chosen, setChosen] = useState<Joining | null>(null);
  const joining: Joining | null = chosen ?? (initial?.rejoin ? { name: initial.name, attempt: 0 } : null);

  const connection = useRef<RoomConnection | null>(null);
  const router = useRouter();
  const { status, players, phase, roundSeconds, youId, error, reconnecting } = useRoom();

  const joiningName = joining?.name ?? null;
  const attempt = joining?.attempt ?? 0;

  useEffect(() => {
    if (!valid || joiningName === null) return;
    const conn = connectRoom({ code, playerId: browserSession().playerId(), name: joiningName });
    connection.current = conn;
    return () => {
      conn.close();
      connection.current = null;
      useRoom.getState().reset();
    };
  }, [valid, code, joiningName, attempt]);

  useEffect(() => {
    if (status === "joined" && joiningName) browserSession().remember(code, joiningName);
  }, [status, code, joiningName]);

  const retry = () => joining && setChosen({ ...joining, attempt: joining.attempt + 1 });

  // Frees the seat at once. The tab forgets the room so a refresh does not walk back in. While
  // reconnecting the leave frame is dropped (nothing is sent on a closed socket) and the seat frees
  // at the end of its grace instead (Q6).
  const leaving = useRef(false);
  const leave = (to: string) => {
    if (leaving.current) return; // a double click on Leave match sends one leave
    leaving.current = true;
    connection.current?.send({ type: "leave" });
    connection.current?.close();
    browserSession().forgetRoom();
    router.push(to);
  };
  // Mid-round, both ways out (Leave room and the logo) ask first (Q13); elsewhere they leave at once.
  const stage = useMatch((s) => s.stage);
  const [confirmTo, setConfirmTo] = useState<string | null>(null);
  const requestLeave = (to: string) => (needsLeaveConfirm({ status, phase, stage }) ? setConfirmTo(to) : leave(to));

  let content;
  if (!valid) {
    content = <RoomError code="room-not-found" onRetry={retry} />;
  } else if (!initial) {
    content = <p className="regular-text-md text-muted">Loading…</p>;
  } else if (!joining || (status === "error" && error === "invalid-name")) {
    // Either nobody has chosen a name yet, or the server rejected the one we sent.
    content = (
      <NameForm
        code={code}
        initialName={joining?.name ?? initial.name}
        notice={error === "invalid-name" ? "Use a name with at least one letter, number or emoji." : undefined}
        onSubmit={(name) => setChosen({ name, attempt: (joining?.attempt ?? 0) + 1 })}
      />
    );
  } else if (status === "error" && error && error !== "invalid-name") {
    content = <RoomError code={error} onRetry={retry} />;
  } else if (status === "joined" && phase === "match") {
    content = (
      <MatchScreen
        onGuess={(word) => connection.current?.send({ type: "guess", word })}
        onPlayAgain={() => connection.current?.send({ type: "playAgain" })}
      />
    );
  } else if (status === "joined") {
    content = (
      <Lobby
        code={code}
        players={players}
        youId={youId}
        roundSeconds={roundSeconds}
        onRoundSeconds={(seconds: RoundSeconds) => connection.current?.send({ type: "settings", roundSeconds: seconds })}
        onStart={() => connection.current?.send({ type: "start" })}
        offline={reconnecting}
      />
    );
  } else {
    content = <p className="regular-text-md text-muted">Joining room {code}…</p>;
  }

  return (
    <>
      {/* The room header: code on the left, Leave room on the right once there is a seat to free. */}
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
        {status === "joined" && <LeaveButton onLeave={() => requestLeave("/woordle")} />}
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 pb-8 sm:px-12">
        {/* The lobby, name form and errors have a visible h1; the match screens get this one (L2). */}
        {status === "joined" && phase === "match" && <h1 className="sr-only">Woordle match</h1>}
        {/* Always rendered, so screen readers announce the change rather than a new element. */}
        <p role="status" aria-live="polite" className="bold-text-sm min-h-5 text-center text-muted" data-testid="connection-status">
          {reconnecting ? `Connection lost. Reconnecting… your seat is held for ${RECONNECT_GRACE_MS / 1000} seconds.` : ""}
        </p>
        {content}
      </main>
      <LeaveConfirm
        open={confirmTo !== null}
        onStay={() => setConfirmTo(null)}
        onLeave={() => {
          const to = confirmTo ?? "/woordle";
          setConfirmTo(null);
          leave(to);
        }}
      />
    </>
  );
}
