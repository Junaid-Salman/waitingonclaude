"use client";

import { buttonClasses, focusClasses } from "@/lib/colors";
import { useCreateRoom } from "./useCreateRoom";

export function CreateRoomButton({ label = "Create room" }: { label?: string }) {
  const { create, busy, error } = useCreateRoom();
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className={`semibold-text-md rounded px-4 py-2 disabled:opacity-60 ${buttonClasses} ${focusClasses}`}
      >
        {busy ? "Creating…" : label}
      </button>
      {error && (
        <p role="alert" className="regular-text-sm text-center">
          {error}
        </p>
      )}
    </div>
  );
}
