"use client";

import { useEffect, useState } from "react";
import { MAX_PLAYERS, type LobbyPlayer } from "../../../shared/protocol";
import { RACES_OPTIONS, type PassageLength, type Races } from "../../../shared/type-race-protocol";
import { LIMIT_SECONDS } from "../../../shared/type-race/passage";
import {
  buttonClasses,
  cardClasses,
  focusClasses,
  hostBadgeClasses,
  inputClasses,
  rowClasses,
  secondaryButtonClasses,
  selectedOptionClasses,
  youBadgeClasses,
} from "@/lib/colors";
import { PassageSize } from "./PassageSize";

interface Props {
  code: string;
  players: LobbyPlayer[];
  youId: string | null;
  races: Races;
  length: PassageLength;
  onSettings(settings: { races?: Races; length?: PassageLength }): void;
  onStart(): void;
  // Host controls cannot reach the server while the connection is down.
  offline?: boolean;
}

// Keys that belong to the focused control, not to "Enter starts the match".
const OWN_ENTER = "a, button, input, textarea, select, summary, [role=button], [contenteditable]";

export function RaceLobby({ code, players, youId, races, length, onSettings, onStart, offline = false }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = players.some((p) => p.isHost && p.id === youId);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/type-race/room/${code}`;

  // Enter starts the match for the host (spec 9), unless a control has focus and wants the key.
  useEffect(() => {
    if (!isHost || offline) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.defaultPrevented) return;
      if ((event.target as Element | null)?.closest?.(OWN_ENTER) || document.querySelector("dialog[open]")) return;
      onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHost, offline, onStart]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; the link box below stays selectable as the fallback.
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-5 lg:max-w-none lg:flex-row lg:items-start lg:justify-center lg:gap-8">
      <div className={`flex w-full flex-col gap-4 p-5 sm:p-7 lg:w-[560px] ${cardClasses}`}>
        <div className="flex flex-col gap-1">
          <h1 className="extrabold-display-sm font-display">Room {code}</h1>
          <p className="regular-text-md text-muted">Send this link to friends. Up to 5 players.</p>
        </div>
        <div className="flex gap-2.5">
          <input
            readOnly
            aria-label="Room link"
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className={`regular-text-sm min-w-0 flex-1 rounded-xl border-2 px-3.5 py-2.5 ${inputClasses} ${focusClasses}`}
          />
          <button type="button" onClick={copy} className={`bold-text-sm shrink-0 rounded-xl px-3.5 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <section aria-label="Players" className="flex flex-col gap-2">
          <h2 className="bold-text-sm tracking-wider text-muted uppercase">
            Players ({players.length}/{MAX_PLAYERS})
          </h2>
          <ul aria-live="polite" className="flex flex-col gap-2">
            {players.map((player) => (
              <li key={player.id} data-testid="player" className={`bold-text-md flex items-center gap-2 px-3.5 py-2.5 ${rowClasses} ${player.connected ? "" : "text-muted"}`}>
                <span className="min-w-0 flex-1 truncate">{player.name}</span>
                {!player.connected && <span className="regular-text-xs text-muted">Reconnecting…</span>}
                {player.id === youId && <span className={`bold-text-xs rounded-full px-2.5 py-0.5 ${youBadgeClasses}`}>You</span>}
                {player.isHost && <span className={`bold-text-xs rounded-full px-2.5 py-0.5 ${hostBadgeClasses}`}>Host</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-label="Race settings" className={`flex w-full flex-col gap-4 p-5 sm:p-7 lg:w-[400px] ${cardClasses}`}>
        <h2 className="bold-text-sm tracking-wider text-muted uppercase">Races</h2>
        {isHost ? (
          <div role="group" aria-label="Number of races" className="flex gap-2.5">
            {RACES_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={races === n}
                disabled={offline}
                onClick={() => onSettings({ races: n })}
                className={`bold-text-sm rounded-xl px-3.5 py-2 disabled:opacity-50 ${races === n ? selectedOptionClasses : secondaryButtonClasses} ${focusClasses}`}
              >
                {n} races
              </button>
            ))}
          </div>
        ) : (
          <p className="extrabold-display-xs font-display" data-testid="races-setting">
            {races} races
          </p>
        )}
        <h2 className="bold-text-sm tracking-wider text-muted uppercase">Passage length</h2>
        {isHost ? (
          <PassageSize value={length} onChange={(l) => onSettings({ length: l })} disabled={offline} />
        ) : (
          <p className="extrabold-display-xs font-display capitalize" data-testid="length-setting">
            {length}
          </p>
        )}
        <p className="regular-text-sm text-muted" data-testid="race-limit">
          {LIMIT_SECONDS[length]} seconds per race. Fastest finish scores 5 points, then 4, 3, 2, 1.
        </p>
        {isHost ? (
          <button type="button" disabled={offline} onClick={onStart} className={`bold-text-md rounded-xl px-5 py-3 disabled:opacity-50 ${buttonClasses} ${focusClasses}`}>
            Start match
          </button>
        ) : (
          <p className="regular-text-md text-muted">Waiting for the host to start.</p>
        )}
      </section>
    </div>
  );
}
