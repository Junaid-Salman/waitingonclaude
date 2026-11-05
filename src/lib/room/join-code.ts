import { isRoomCode } from "../../../shared/room-code";

export type JoinTarget = { ok: true; code: string; href: string } | { ok: false; reason: "empty" | "invalid" };

// Turns what someone typed or pasted into a room to open: a code ("kqxf", " K Q X F ") or a whole
// room link (".../woordle/room/KQXF"). Pure, so the home page's code box is unit-tested.
export function parseJoinInput(input: string): JoinTarget {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const fromLink = /\/woordle\/room\/([A-Za-z]{4})\/?(?:[?#].*)?$/.exec(trimmed)?.[1];
  const code = (fromLink ?? trimmed.replace(/\s+/g, "")).toUpperCase();
  if (!isRoomCode(code)) return { ok: false, reason: "invalid" };
  return { ok: true, code, href: `/woordle/room/${code}` };
}
