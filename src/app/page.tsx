import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">WaitingOnClaude</h1>
      <Link href="/woordle/solo" className="rounded bg-tile-correct px-4 py-2 font-semibold text-white">
        Play Woordle (solo)
      </Link>
    </main>
  );
}
