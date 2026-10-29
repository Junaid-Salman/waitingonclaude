"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isRoomCode } from "../../../shared/room-code";
import type { RoundSeconds } from "../../../shared/protocol";
import { connectRoom, type RoomConnection } from "@/lib/room/room-client";
import { browserSession } from "@/lib/room/session";
import { useRoom } from "@/lib/room/store";
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
  const { status, players, phase, roundSeconds, youId, error } = useRoom();

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
      />
    );
  } else {
    content = <p className="regular-text-md text-muted">Joining room {code}…</p>;
  }

  return <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">{content}</div>;
}
