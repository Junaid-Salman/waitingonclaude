import { isRoomCode } from "../../shared/room-code";

// PartyKit adds no CORS headers, so the browser's cross-origin POST would be blocked without these.
// There are no cookies or credentials, so "*" exposes nothing a direct request could not do.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function reply(status: number, body: string | null, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...CORS_HEADERS, ...extra } });
}

// POST /parties/main/<CODE> creates the room: 201, or 409 while a live room already holds the code.
export function handleRoomRequest(req: { method: string }, roomId: string, room: { create(): boolean }): Response {
  if (req.method === "OPTIONS") return reply(204, null);
  if (req.method !== "POST") return reply(405, "method not allowed", { Allow: "POST, OPTIONS" });
  if (!isRoomCode(roomId)) return reply(400, "invalid room code");
  return room.create()
    ? reply(201, JSON.stringify({ code: roomId }), { "Content-Type": "application/json" })
    : reply(409, "room code taken");
}
