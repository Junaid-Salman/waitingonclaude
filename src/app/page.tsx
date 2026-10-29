import Link from "next/link";
import { buttonClasses } from "@/lib/colors";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="semibold-display-sm tracking-tight">WaitingOnClaude</h1>
      <Link href="/woordle/solo" className={`semibold-text-md rounded px-4 py-2 ${buttonClasses}`}>
        Play Woordle (solo)
      </Link>
    </main>
  );
}
