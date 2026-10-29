"use client";

import { useState } from "react";
import { MAX_NAME_LENGTH } from "../../../shared/protocol";
import { buttonClasses, focusClasses, inputClasses } from "@/lib/colors";

export function NameForm({ code, initialName, notice, onSubmit }: { code: string; initialName: string; notice?: string; onSubmit(name: string): void }) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <h1 className="semibold-display-xs">Join room {code}</h1>
      <div className="flex flex-col gap-2">
        <label htmlFor="player-name" className="medium-text-sm">
          Your name
        </label>
        <input
          id="player-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          autoFocus
          onChange={(event) => setName(event.target.value)}
          className={`regular-text-md rounded border-2 px-3 py-2 ${inputClasses} ${focusClasses}`}
        />
        {notice && (
          <p role="alert" className="regular-text-sm">
            {notice}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={!trimmed}
        className={`semibold-text-md rounded px-4 py-2 disabled:opacity-60 ${buttonClasses} ${focusClasses}`}
      >
        Join
      </button>
    </form>
  );
}
