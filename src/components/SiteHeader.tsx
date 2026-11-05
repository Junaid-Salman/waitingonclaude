import Link from "next/link";
import { focusClasses } from "@/lib/colors";
import { LogoLockup, LogoMark } from "./Logo";
import { CreateRoomButton } from "./room/CreateRoomButton";

// The header of every page outside a room. Pages that already offer Create room in their content
// (home, /woordle) leave it out here, so there is one per page.
export function SiteHeader({ createRoom = true }: { createRoom?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 sm:px-12 sm:py-5">
      <Link href="/" aria-label="WaitingOnClaude home" className={`rounded ${focusClasses}`}>
        <LogoLockup className="hidden h-6 w-auto sm:block" />
        <LogoMark heavy className="size-9 sm:hidden" />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-7">
        <Link href="/woordle" className={`bold-text-md rounded ${focusClasses}`}>
          Woordle
        </Link>
        {createRoom && <CreateRoomButton small />}
      </nav>
    </header>
  );
}
