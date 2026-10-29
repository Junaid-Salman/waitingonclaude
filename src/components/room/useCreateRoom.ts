"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoom } from "@/lib/room/create-room";

// Creates a room and navigates to it. Shared by the /woordle page and the "room not found" screen.
export function useCreateRoom() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      router.push(`/woordle/room/${await createRoom()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a room.");
      setBusy(false);
    }
  }

  return { create, busy, error };
}
