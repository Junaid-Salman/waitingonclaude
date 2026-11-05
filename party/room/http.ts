import { isRoomCode } from "../../shared/room-code";
import { reply } from "../http-cors";

// POST /parties/main/<CODE> creates the room: 201, or 409 while a live room already holds the code.
export function handleRoomRequest(req: { method: string }, roomId: string, room: { create(): boolean }): Response {
  if (req.method === "OPTIONS") return reply(204, null);
  if (req.method !== "POST") return reply(405, "method not allowed", { Allow: "POST, OPTIONS" });
  if (!isRoomCode(roomId)) return reply(400, "invalid room code");
  return room.create()
    ? reply(201, JSON.stringify({ code: roomId }), { "Content-Type": "application/json" })
    : reply(409, "room code taken");
}
