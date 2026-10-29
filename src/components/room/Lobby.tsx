"use client";

import { useState } from "react";
import { ROUND_SECONDS_OPTIONS, type LobbyPlayer, type RoundSeconds } from "../../../shared/protocol";
import {
  buttonClasses,
  focusClasses,
  hostBadgeClasses,
  inputClasses,
  secondaryButtonClasses,
  selectedOptionClasses,
  youBadgeClasses,
} from "@/lib/colors";

interface Props {
  code: string;
  players: LobbyPlayer[];
  youId: string | null;
  roundSeconds: number;
  onRoundSeconds(seconds: RoundSeconds): void;
  onStart(): void;
}

const minutes = (seconds: number) => `${seconds / 60} min`;

export function Lobby({ code, players, youId, roundSeconds, onRoundSeconds, onStart }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = players.some((p) => p.isHost && p.id === youId);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/woordle/room/${code}`;

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="semibold-display-xs">Room {code}</h1>
        <p className="regular-text-sm text-muted">Send this link to friends. Up to 5 players.</p>
      </div>

      <div className="flex gap-2">
        <input
          readOnly
          aria-label="Room link"
          value={link}
          onFocus={(event) => event.currentTarget.select()}
          className={`regular-text-sm min-w-0 flex-1 rounded border-2 px-3 py-2 ${inputClasses} ${focusClasses}`}
        />
        <button type="button" onClick={copy} className={`semibold-text-sm rounded px-3 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <section aria-label="Players" className="flex flex-col gap-2">
        <h2 className="semibold-text-md">
          Players ({players.length}/5)
        </h2>
        <ul aria-live="polite" className="flex flex-col gap-2">
          {players.map((player) => (
            <li key={player.id} data-testid="player" className="regular-text-md flex items-center gap-2 rounded border-2 border-tile-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{player.name}</span>
              {player.id === youId && <span className={`semibold-text-xs rounded px-2 py-0.5 ${youBadgeClasses}`}>You</span>}
              {player.isHost && <span className={`semibold-text-xs rounded px-2 py-0.5 ${hostBadgeClasses}`}>Host</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Round length" className="flex flex-col gap-2">
        <h2 className="semibold-text-md">Round length</h2>
        {isHost ? (
          <div role="group" aria-label="Round length" className="flex gap-2">
            {ROUND_SECONDS_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                aria-pressed={roundSeconds === seconds}
                onClick={() => onRoundSeconds(seconds)}
                className={`semibold-text-sm rounded px-3 py-2 ${roundSeconds === seconds ? selectedOptionClasses : secondaryButtonClasses} ${focusClasses}`}
              >
                {minutes(seconds)}
              </button>
            ))}
          </div>
        ) : (
          <p className="regular-text-md" data-testid="round-length">
            {minutes(roundSeconds)}
          </p>
        )}
      </section>

      {isHost ? (
        <button type="button" onClick={onStart} className={`semibold-text-md self-start rounded px-4 py-2 ${buttonClasses} ${focusClasses}`}>
          Start match
        </button>
      ) : (
        <p className="regular-text-sm text-muted">Waiting for the host to start the match.</p>
      )}
    </div>
  );
}
