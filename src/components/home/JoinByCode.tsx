"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { focusClasses, inputClasses, invalidInputClasses, secondaryButtonClasses } from "@/lib/colors";
import { parseJoinInput } from "@/lib/room/join-code";

// Join a room by typing its code (or pasting its link). Client-only: it opens the room page, which
// already handles a room that does not exist.
export function JoinByCode() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const target = parseJoinInput(value);
        if (!target.ok) {
          setError(target.reason === "empty" ? "Type a room code first." : "Codes are four letters (no I, L or O), like KQXF.");
          return;
        }
        router.push(target.href);
      }}
    >
      <div className="flex items-center gap-2.5">
        <label htmlFor="room-code" className="regular-text-sm shrink-0 text-muted">
          Have a code?
        </label>
        <input
          id="room-code"
          value={value}
          placeholder="KQXF"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby="room-code-error"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          className={`bold-text-md min-w-0 flex-1 rounded-xl border-2 px-3.5 py-2.5 tracking-widest uppercase placeholder:text-muted ${error ? invalidInputClasses : inputClasses} ${focusClasses}`}
        />
        <button type="submit" className={`bold-text-sm rounded-xl px-3.5 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
          Join
        </button>
      </div>
      <p id="room-code-error" aria-live="polite" className="regular-text-xs min-h-4 text-invalid">
        {error}
      </p>
    </form>
  );
}
