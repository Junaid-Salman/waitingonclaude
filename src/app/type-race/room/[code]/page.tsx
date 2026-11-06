import type { Metadata } from "next";
import { Suspense } from "react";
import { RaceRoomPage } from "@/components/type-race/RaceRoomPage";

export const metadata: Metadata = { title: "Type Race room · WaitingOnClaude" };

export default function Page() {
  return (
    <Suspense fallback={<p className="regular-text-md p-8 text-center text-muted">Loading…</p>}>
      <RaceRoomPage />
    </Suspense>
  );
}
