"use client";

import { useState } from "react";
import { MAX_NAME_LENGTH } from "../../../shared/protocol";
import { buttonClasses, cardClasses, focusClasses, inputClasses, invalidInputClasses } from "@/lib/colors";

export function NameForm({ code, initialName, notice, onSubmit }: { code: string; initialName: string; notice?: string; onSubmit(name: string): void }) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <form
      className={`flex w-full max-w-md flex-col gap-4 p-5 sm:p-7 ${cardClasses}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="extrabold-display-sm font-display">Join room {code}</h1>
        <p className="regular-text-md text-muted">Pick a name for this room. It is only kept in this tab.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="player-name" className="bold-text-sm">
          Your name
        </label>
        <input
          id="player-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          autoFocus
          aria-invalid={notice !== undefined}
          aria-describedby={notice ? "player-name-notice" : undefined}
          onChange={(event) => setName(event.target.value)}
          className={`regular-text-md rounded-xl border-2 px-3.5 py-2.5 ${notice ? invalidInputClasses : inputClasses} ${focusClasses}`}
        />
        {notice && (
          <p id="player-name-notice" role="alert" className="regular-text-sm text-invalid">
            {notice}
          </p>
        )}
      </div>
      <button type="submit" disabled={!trimmed} className={`bold-text-md rounded-xl px-5 py-3 disabled:opacity-50 ${buttonClasses} ${focusClasses}`}>
        Join
      </button>
    </form>
  );
}
