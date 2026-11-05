import type { Metadata } from "next";
import { Suspense } from "react";
import { ChallengeLoader } from "@/components/challenge/ChallengeLoader";

export const metadata: Metadata = { title: "Woordle challenge · WaitingOnClaude" };

export default function Page() {
  return (
    <Suspense fallback={<p className="regular-text-md p-8 text-center text-muted">Loading…</p>}>
      <ChallengeLoader />
    </Suspense>
  );
}
