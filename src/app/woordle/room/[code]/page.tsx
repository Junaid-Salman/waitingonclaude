import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomPage } from "@/components/room/RoomPage";

export const metadata: Metadata = { title: "Woordle room · WaitingOnClaude" };

export default function Page() {
  return (
    <Suspense fallback={<p className="regular-text-md p-8 text-center text-muted">Loading…</p>}>
      <RoomPage />
    </Suspense>
  );
}
