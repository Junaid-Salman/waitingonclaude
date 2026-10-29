"use client";

import type { RoomErrorCode } from "../../../shared/protocol";
import { buttonClasses, focusClasses } from "@/lib/colors";
import { CreateRoomButton } from "./CreateRoomButton";

const MESSAGES: Record<Exclude<RoomErrorCode, "invalid-name">, { title: string; detail: string }> = {
  "room-not-found": { title: "Room not found", detail: "This room doesn't exist or has ended. Rooms close when everyone leaves." },
  "room-full": { title: "Room is full", detail: "This room already has 5 players." },
  "match-in-progress": { title: "Match in progress", detail: "You can join once the match ends and the room is back in the lobby." },
  replaced: { title: "Opened in another tab", detail: "This player joined from another tab or window, so this one was disconnected." },
};

export function RoomError({ code, onRetry }: { code: Exclude<RoomErrorCode, "invalid-name">; onRetry(): void }) {
  const message = MESSAGES[code];
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <h1 className="semibold-display-xs">{message.title}</h1>
      <p className="regular-text-md">{message.detail}</p>
      <div className="flex flex-wrap gap-3">
        {(code === "match-in-progress" || code === "replaced" || code === "room-full") && (
          <button type="button" onClick={onRetry} className={`semibold-text-md rounded px-4 py-2 ${buttonClasses} ${focusClasses}`}>
            {code === "replaced" ? "Use this tab" : "Try again"}
          </button>
        )}
        {code === "room-not-found" && <CreateRoomButton />}
      </div>
    </div>
  );
}
