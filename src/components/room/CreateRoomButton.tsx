"use client";

import { buttonClasses, focusClasses } from "@/lib/colors";
import { useCreateRoom, type CreateRoomGame } from "./useCreateRoom";

export function CreateRoomButton({ label = "Create room", small = false, wide = false, game = "woordle" }: { label?: string; small?: boolean; wide?: boolean; game?: CreateRoomGame }) {
  const { create, busy, error } = useCreateRoom(game);
  return (
    <div className={`relative flex flex-col gap-2 ${wide ? "w-full sm:w-auto" : "items-center"}`}>
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className={`${small ? "bold-text-sm px-3.5 py-2" : "bold-text-md px-5 py-3"} rounded-xl disabled:opacity-50 ${buttonClasses} ${focusClasses}`}
      >
        {busy ? "Creating…" : label}
      </button>
      {error && (
        <p role="alert" className={`bold-text-sm text-invalid ${small ? "absolute top-full right-0 mt-1 whitespace-nowrap" : "text-center"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
