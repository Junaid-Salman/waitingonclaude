"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoom } from "@/lib/room/create-room";

// Each game has its own party (a separate namespace of room codes) and its own room page.
const GAMES = {
  woordle: { party: "main", path: "/woordle/room" },
  "type-race": { party: "type-race", path: "/type-race/room" },
} as const;
export type CreateRoomGame = keyof typeof GAMES;

// Creates a room and navigates to it. Shared by the game pages and the "room not found" screen.
export function useCreateRoom(game: CreateRoomGame = "woordle") {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      router.push(`${GAMES[game].path}/${await createRoom({ party: GAMES[game].party })}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a room.");
      setBusy(false);
    }
  }

  return { create, busy, error };
}
