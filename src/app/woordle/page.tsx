import type { Metadata } from "next";
import Link from "next/link";
import { CreateRoomButton } from "@/components/room/CreateRoomButton";
import { focusClasses, secondaryButtonClasses } from "@/lib/colors";

export const metadata: Metadata = { title: "Woordle · WaitingOnClaude" };

export default function WoordlePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="semibold-display-sm tracking-tight">Woordle</h1>
      <p className="regular-text-md">Race up to 4 friends over 5 rounds, or play on your own.</p>
      <div className="flex flex-wrap items-start justify-center gap-3">
        <CreateRoomButton label="Create room" />
        <Link href="/woordle/solo" className={`semibold-text-md rounded px-4 py-2 ${secondaryButtonClasses} ${focusClasses}`}>
          Play solo
        </Link>
      </div>
    </main>
  );
}
