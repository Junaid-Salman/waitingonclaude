import type { Metadata } from "next";
import type { TileColour } from "../../../shared/protocol";
import { SiteHeader } from "@/components/SiteHeader";
import { WoordleActions } from "@/components/WoordleActions";
import { LetterTiles } from "@/components/woordle/LetterTiles";
import { cardClasses } from "@/lib/colors";

export const metadata: Metadata = { title: "Woordle · WaitingOnClaude" };

// CRANE against ROBOT: the example row in How to play.
const EXAMPLE: TileColour[] = ["grey", "yellow", "grey", "grey", "grey"];

export default function WoordlePage() {
  return (
    <>
      <SiteHeader createRoom={false} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-7 px-4 pt-4 pb-8 sm:pt-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="extrabold-display-lg sm:extrabold-display-3xl font-display leading-[1.05] tracking-tight">Woordle</h1>
          <p className="regular-text-lg text-muted">Race up to 4 friends over 5 rounds, play on your own, or send a friend a challenge.</p>
          <WoordleActions className="w-full sm:w-auto" />
        </div>

        <section aria-labelledby="how-to-play" className={`flex w-full flex-col gap-3 p-5 sm:p-7 ${cardClasses}`}>
          <h2 id="how-to-play" className="extrabold-display-xs font-display">
            How to play
          </h2>
          <LetterTiles letters="crane" colours={EXAMPLE} label="Example: CRANE, with R in the word but in the wrong spot." />
          <p className="regular-text-md">Green: right letter, right spot. Yellow: in the word, wrong spot. Grey: not in the word.</p>
          <p className="regular-text-md">Everyone in a room gets the same hidden word each round. The fastest solve wins the round; five rounds make a match.</p>
          <p className="regular-text-md">Rounds last 2, 3 or 5 minutes, chosen by the host. Six guesses per word.</p>
        </section>
      </main>
    </>
  );
}
