import Link from "next/link";
import { focusClasses, secondaryButtonClasses } from "@/lib/colors";
import { CreateRoomButton } from "./room/CreateRoomButton";

const linkButton = `bold-text-md rounded-xl px-5 py-3 text-center ${secondaryButtonClasses} ${focusClasses}`;

// Woordle's three ways in, shared by the hub card and the /woordle page.
export function WoordleActions({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 sm:flex-row ${className}`}>
      <CreateRoomButton wide />
      <Link href="/woordle/solo" className={linkButton}>
        Play solo
      </Link>
      <Link href="/woordle/challenge/new" className={linkButton}>
        Make a challenge
      </Link>
    </div>
  );
}
