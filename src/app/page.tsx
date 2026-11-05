import { LogoMark } from "@/components/Logo";
import { JoinByCode } from "@/components/home/JoinByCode";
import { SiteHeader } from "@/components/SiteHeader";
import { WoordleActions } from "@/components/WoordleActions";
import { cardClasses, hostBadgeClasses } from "@/lib/colors";


export default function Home() {
  return (
    <>
      <SiteHeader createRoom={false} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-4 pb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-16 sm:px-12 sm:pt-10">
        <div className="flex flex-col items-start gap-4 sm:max-w-xl">
          <span className={`bold-text-xs rounded-full px-2.5 py-0.5 ${hostBadgeClasses}`}>Up to 5 players · 5 rounds</span>
          <h1 className="extrabold-display-lg sm:extrabold-display-3xl font-display leading-[1.05] tracking-tight">
            {/* The logo carries the name visually; the heading carries it for screen readers. */}
            <span className="sr-only">WaitingOnClaude: </span>
            Game night, between prompts.
          </h1>
          <p className="regular-text-lg text-muted">Five rounds, one word each, up to five players. Fastest solve takes the round. Claude can wait.</p>
          {/* Decoration: a friendly scoreboard, not live data. */}
          <div aria-hidden="true" className="hidden gap-3.5 pt-4 sm:flex">
            {[["3", "Ali"], ["2", "Bo"], ["2", "Cy"]].map(([score, name]) => (
              <div key={name} className="flex flex-col items-center rounded-[14px] border-[2.5px] border-foreground bg-surface px-5 py-2.5 shadow-piece-lg">
                <span className="extrabold-display-md font-display">{score}</span>
                <span className="bold-text-sm text-muted">{name}</span>
              </div>
            ))}
          </div>
        </div>

        <section aria-labelledby="woordle-card" className={`flex w-full shrink-0 flex-col gap-4 p-5 sm:w-[520px] sm:p-7 ${cardClasses}`}>
          <div className="flex items-center gap-3">
            <LogoMark heavy className="size-9" />
            <h2 id="woordle-card" className="extrabold-display-xs font-display">
              Woordle
            </h2>
          </div>
          <p className="regular-text-md text-muted">Guess the five-letter word. Race up to 4 friends over 5 rounds, play on your own, or seal a challenge in a link.</p>
          <WoordleActions />
          <JoinByCode />
          <div className="flex flex-col gap-1 rounded-[18px] border-2 border-dashed border-border p-5">
            <h3 className="bold-text-md">More games soon</h3>
            <p className="regular-text-sm text-muted">One quick game at a time. Ideas welcome.</p>
          </div>
        </section>
      </main>
    </>
  );
}
