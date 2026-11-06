import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { CreateRoomButton } from "@/components/room/CreateRoomButton";
import { cardClasses, focusClasses, secondaryButtonClasses } from "@/lib/colors";

export const metadata: Metadata = { title: "Type Race · WaitingOnClaude" };

// Reachable by URL only until the home page links it (Phase 8.4). Challenge arrives in 8.3.
export default function TypeRacePage() {
  return (
    <>
      <SiteHeader createRoom={false} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-7 px-4 pt-4 pb-8 sm:pt-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="extrabold-display-lg sm:extrabold-display-3xl font-display leading-[1.05] tracking-tight">Type Race</h1>
          <p className="regular-text-lg text-muted">Race up to 4 friends over 3, 5 or 7 passages, or practise on your own. Type each one exactly, as fast as you can.</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <CreateRoomButton game="type-race" wide />
            <Link href="/type-race/practice" className={`bold-text-md rounded-xl px-5 py-3 text-center ${secondaryButtonClasses} ${focusClasses}`}>
              Practice
            </Link>
          </div>
        </div>
        <section aria-labelledby="how-to-play" className={`flex w-full flex-col gap-3 p-5 sm:p-7 ${cardClasses}`}>
          <h2 id="how-to-play" className="extrabold-display-xs font-display">
            How to play
          </h2>
          <p className="regular-text-md">Every letter, space and capital counts. A wrong key turns the word red; press Backspace to fix it before you go on.</p>
          <p className="regular-text-md">Speed is words per minute, five characters to a word. Accuracy counts every wrong key, even after you fix it.</p>
          <p className="regular-text-md">You need a physical keyboard. Pasting is not possible.</p>
        </section>
      </main>
    </>
  );
}
