import Link from "next/link";
import { focusClasses } from "@/lib/colors";

const games = [
  { href: "/woordle", name: "Woordle", blurb: "Guess the five-letter word. Race friends or play solo." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 p-8">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="semibold-display-sm tracking-tight">WaitingOnClaude</h1>
        <p className="regular-text-md text-muted">Quick games for while you wait on Claude.</p>
      </header>
      <ul className="flex flex-col gap-3">
        {games.map((game) => (
          <li key={game.href}>
            <Link href={game.href} className={`flex flex-col gap-1 rounded border-2 border-tile-border px-4 py-3 ${focusClasses}`}>
              <span className="semibold-text-lg">{game.name}</span>
              <span className="regular-text-sm text-muted">{game.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
