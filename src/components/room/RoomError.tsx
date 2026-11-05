"use client";

import type { RoomErrorCode } from "../../../shared/protocol";
import { buttonClasses, cardClasses, focusClasses } from "@/lib/colors";
import { CreateRoomButton } from "./CreateRoomButton";

const MESSAGES: Record<Exclude<RoomErrorCode, "invalid-name">, { title: string; detail: string }> = {
  "room-not-found": { title: "Room not found", detail: "This room doesn't exist or has ended. Rooms close when everyone leaves." },
  "room-full": { title: "Room is full", detail: "This room already has 5 players." },
  "match-in-progress": { title: "Match in progress", detail: "You can join once the match ends and the room is back in the lobby." },
  replaced: { title: "Opened in another tab", detail: "This player joined from another tab or window, so this one was disconnected." },
};

export function RoomError({ code, onRetry }: { code: Exclude<RoomErrorCode, "invalid-name">; onRetry(): void }) {
  const message = MESSAGES[code];
  const heads = code === "replaced";
  return (
    <div role="alert" className={`flex w-full max-w-md flex-col items-start gap-4 p-5 sm:p-7 ${cardClasses}`}>
      <span className={`bold-text-xs rounded-full border-2 border-foreground px-3 py-0.5 ${heads ? "bg-tile-present text-tile-present-fg" : "bg-accent text-accent-fg"}`}>
        {heads ? "Heads up" : "Can't join"}
      </span>
      <h1 className="extrabold-display-sm sm:extrabold-display-md font-display">{message.title}</h1>
      <p className="regular-text-md text-muted">{message.detail}</p>
      <div className="flex w-full flex-wrap gap-3">
        {(code === "match-in-progress" || code === "replaced" || code === "room-full") && (
          <button type="button" onClick={onRetry} className={`bold-text-md w-full rounded-xl px-5 py-3 sm:w-auto ${buttonClasses} ${focusClasses}`}>
            {code === "replaced" ? "Use this tab" : "Try again"}
          </button>
        )}
        {code === "room-not-found" && <CreateRoomButton wide />}
      </div>
    </div>
  );
}
